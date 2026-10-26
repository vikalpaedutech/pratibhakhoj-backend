import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import XLSX from "xlsx";
import { SchoolVisit } from "../../models/portal/schoolVisit.models.js";
import { VisitForm } from "../../models/portal/visitForm.models.js";
import { School } from "../../models/portal/school.models.js";
import { District } from "../../models/portal/district.models.js";
import { Block } from "../../models/portal/block.models.js";
import { User } from "../../models/portal/user.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { uploadToSpaces, getSignedUrlForSpacesKey } from "../../utils/space.utils.js";
import { isSchoolAccessible } from "../../services/portal/schoolVisitAccess.service.js";

const ACTIVITIES = [
  "Coordination with School In-Charge",
  "Screening of awareness videos",
  "Timelines shared & Awareness survey conducted",
  "Display of campaign posters on bulletin board",
  "Student Registration",
];
const PROGRAMMES = [
  { programme: "Mission Buniyaad", eligibleClass: "Class 8" },
  { programme: "Haryana Super 100", eligibleClass: "Class 10" },
];

const dateOnly = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "Invalid visit date");
  date.setHours(0, 0, 0, 0);
  return date;
};

const cleanNumber = (value) => value === "" || value === null || value === undefined ? null : Math.max(0, Number(value));

const normalizeForm = (form = {}) => ({
  schoolCampaign: {
    principal: String(form.schoolCampaign?.principal || "").trim(),
  },
  activities: ACTIVITIES.map((activity, index) => ({
    activity,
    status: ["Yes", "No"].includes(form.activities?.[index]?.status) ? form.activities[index].status : "",
    remarks: String(form.activities?.[index]?.remarks || "").trim(),
  })),
  studentRegistrationStatus: PROGRAMMES.map((program, index) => ({
    programme: program.programme,
    eligibleClass: program.eligibleClass,
    totalStudents: cleanNumber(form.studentRegistrationStatus?.[index]?.totalStudents),
    studentsAbove60: cleanNumber(form.studentRegistrationStatus?.[index]?.studentsAbove60),
    studentsBelow60: cleanNumber(form.studentRegistrationStatus?.[index]?.studentsBelow60),
    studentsPresent: cleanNumber(form.studentRegistrationStatus?.[index]?.studentsPresent),
    studentsAbsent: cleanNumber(form.studentRegistrationStatus?.[index]?.studentsAbsent),
    registrationsCompleted: cleanNumber(form.studentRegistrationStatus?.[index]?.registrationsCompleted),
    registrationsPending: cleanNumber(form.studentRegistrationStatus?.[index]?.registrationsPending),
  })),
  pendingFollowUp: PROGRAMMES.map((program, index) => ({
    programme: program.programme,
    pendingRegistrations: cleanNumber(form.pendingFollowUp?.[index]?.pendingRegistrations),
    reasonRemarks: String(form.pendingFollowUp?.[index]?.reasonRemarks || "").trim(),
    committedDate: form.pendingFollowUp?.[index]?.committedDate ? dateOnly(form.pendingFollowUp[index].committedDate) : null,
  })),
  signOff: {
    centreCoordinatorName: String(form.signOff?.centreCoordinatorName || "").trim(),
    schoolHeadName: String(form.signOff?.schoolHeadName || "").trim(),
  },
});

const canManageVisit = async (req, visit) => {
  const ownerId = visit?.userId?._id || visit?.userId;
  return String(ownerId) === String(req.user._id);
};

const getVisit = async (id) => {
  const visit = await SchoolVisit.findById(id)
    .populate("schoolId", "schoolName schoolCode districtId blockId")
    .populate("districtId", "districtName")
    .populate("blockId", "blockName")
    .populate("userId", "name contact")
    .lean();
  if (!visit) throw new ApiError(404, "School visit not found");
  const form = await VisitForm.findOne({ schoolVisitId: visit._id }).lean();
  visit.form = form ? {
    schoolCampaign: { principal: form.principalName || "" },
    activities: form.awarenessCampaignActivities || [],
    studentRegistrationStatus: form.studentRegistrationStatus || [],
    pendingFollowUp: form.pendingRegistrationFollowUp || [],
    signOff: { centreCoordinatorName: form.centreCoordinatorName || "", schoolHeadName: form.schoolHeadName || "" },
  } : null;
  return visit;
};

// The complete SLC template is the background. The header-only source is also
// kept at the requested path for future layout changes / dynamic-only rendering.
const TEMPLATE_PATH = path.join(process.cwd(), "public", "template", "slc-template-cc-only-header1.pdf");
const HEADER_TEMPLATE_PATH = path.join(process.cwd(), "public", "template", "slc-template-cc-only-header1.pdf");
const FONT_PATH = path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf");

const formatDate = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "";
const textValue = (value) => value === null || value === undefined ? "" : String(value);

const wrapText = (font, value, size, maxWidth) => {
  const words = textValue(value).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  for (const word of words) {
    // Break a single oversized token safely rather than allowing it outside the cell.
    let token = word;
    while (font.widthOfTextAtSize(token, size) > maxWidth && token.length > 1) {
      let cut = token.length;
      while (cut > 1 && font.widthOfTextAtSize(token.slice(0, cut), size) > maxWidth) cut--;
      if (line) { lines.push(line); line = ""; }
      lines.push(token.slice(0, cut));
      token = token.slice(cut);
    }
    const candidate = line ? `${line} ${token}` : token;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else { if (line) lines.push(line); line = token; }
  }
  if (line) lines.push(line);
  return lines;
};

const drawValue = (page, font, value, x, top, width, height, size = 7.5, align = "left") => {
  const text = textValue(value).trim();
  if (!text) return;
  const inset = 3;
  const maxWidth = Math.max(4, width - inset * 2);
  const lineHeight = size + 1.4;
  // Fit the content inside the cell: wrap first, then reduce font if it needs
  // more lines than the cell can safely display. Never draw beyond the cell.
  const maxLines = Math.max(1, Math.floor((height - 3) / lineHeight));
  let actualSize = size;
  let lines = wrapText(font, text, actualSize, maxWidth);
  while (lines.length > maxLines && actualSize > 5.2) {
    actualSize -= 0.3;
    lines = wrapText(font, text, actualSize, maxWidth);
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1] || "";
    while (last && font.widthOfTextAtSize(`${last}…`, actualSize) > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last ? `${last}…` : "";
  }
  const pageHeight = page.getHeight();
  const totalHeight = lines.length * (actualSize + 1.2);
  let baseline = pageHeight - top - Math.max(2, (height - totalHeight) / 2) - actualSize;
  for (const line of lines) {
    if (!line) continue;
    const textWidth = font.widthOfTextAtSize(line, actualSize);
    const tx = align === "center" ? x + Math.max(inset, (width - textWidth) / 2) : x + inset;
    page.drawText(line, { x: tx, y: baseline, size: actualSize, font, maxWidth });
    baseline -= actualSize + 1.2;
  }
};

const createVisitPdf = async ({ visit, blank = false }) => {
  const bytes = await fs.readFile(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(bytes);
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = await fs.readFile(FONT_PATH);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const page = pdfDoc.getPages()[0], W = page.getWidth(), H = page.getHeight();
  const ink = rgb(0.12, 0.12, 0.12), blue = rgb(0.84, 0.91, 0.94);
  const py = (top) => H - top;
  const line = (x1,t1,x2,t2) => page.drawLine({start:{x:x1,y:py(t1)},end:{x:x2,y:py(t2)},thickness:0.45,color:ink});
  const box = (x,t,w,h,fill=null) => page.drawRectangle({x,y:H-t-h,width:w,height:h,borderColor:ink,borderWidth:0.45,...(fill?{color:fill}:{})});
  const txt = (v,x,t,w,h,size=6.5,align="left") => {
    const s=textValue(v).replace(/\\s+/g," ").trim(); if(!s)return;
    let fs=size, lines=wrapText(font,s,fs,Math.max(4,w-6)), max=Math.max(1,Math.floor((h-4)/(fs+1.2)));
    while(lines.length>max && fs>5){fs-=0.3;lines=wrapText(font,s,fs,Math.max(4,w-6));}
    lines=lines.slice(0,max); let base=H-t-Math.max(2,(h-lines.length*(fs+1.2))/2)-fs;
    for(const ln of lines){const tw=font.widthOfTextAtSize(ln,fs);page.drawText(ln,{x:align==="center"?x+Math.max(3,(w-tw)/2):x+3,y:base,size:fs,font,color:ink,maxWidth:Math.max(4,w-6)});base-=fs+1.2;}
  };
  const cell=(x,t,w,h,v="",fill=null,size=6.5,align="left")=>{box(x,t,w,h,fill);txt(v,x,t,w,h,size,align);};
  const pair=(x,t,lbl,val,lw,vw)=>{cell(x,t,lw,14,lbl,blue,6.2);cell(x+lw,t,vw,14,val,null,6.5);};
  box(11,11,W-22,H-22);
  const school=visit?.schoolId?.schoolName||"", code=visit?.schoolId?.schoolCode||"";
  const block=visit?.blockId?.blockName||"", district=visit?.districtId?.districtName||"";
  const date=formatDate(visit?.visitDate), principal=visit?.form?.schoolCampaign?.principal||"";
  txt("1. SCHOOL CAMPAIGN DETAILS",35,143,300,13,8);
  const x=36, y0=157, a=68,b=201,d=73,e=177;
  pair(x,y0,"District",district,a,b); pair(x+a+b,y0,"Date",date,d,e);
  pair(x,y0+14,"Block",block,a,b); pair(x+a+b,y0+14,"Principal",principal,d,e);
  pair(x,y0+28,"School Name",school,a,b); pair(x+a+b,y0+28,"School Code",code,d,e);
  txt("2. AWARENESS CAMPAIGN ACTIVITIES",35,207,350,13,8);
  const acts=visit?.form?.activities||[], ax=36, at=220, ac=[35,207,70,210];
  ["S. No.","Activity","Status (Yes/No)","Remarks"].forEach((v,i)=>{const xx=ax+ac.slice(0,i).reduce((s,n)=>s+n,0);cell(xx,at,ac[i],15,v,blue,6.2,"center");});
  ACTIVITIES.forEach((v,i)=>{const t=at+15+i*20, r=acts[i]||{}; let xx=ax; [String(i+1),v,r.status||"",r.remarks||""].forEach((val,j)=>{cell(xx,t,ac[j],20,val,null,j===1?6.1:6.5,j===0||j===2?"center":"left");xx+=ac[j];});});
  txt("3. STUDENT REGISTRATION STATUS",35,343,350,13,8);
  const sx=36, st=356, sc=[67,49,51,55,65,66,75,94];
  const sh=["Programme","Class","Total Students","Students Present","Registered Students Above 60%","Registered Students Below 60%","Total Registrations Completed","Registrations Pending"];
  let xx=sx; sh.forEach((v,i)=>{cell(xx,st,sc[i],33,v,blue,5.7,"center");xx+=sc[i];});
  const stats=visit?.form?.studentRegistrationStatus||[];
  PROGRAMMES.forEach((p,i)=>{const r=stats[i]||{}, vals=[p.programme,p.eligibleClass,r.totalStudents??"",r.studentsPresent??"",r.studentsAbove60??"",r.studentsBelow60??"",r.registrationsCompleted??"",r.registrationsPending??""];xx=sx;vals.forEach((v,j)=>{cell(xx,st+33+i*27,sc[j],27,v,null,j<2?6.1:6.4,j<2?"left":"center");xx+=sc[j];});});
  txt("4. PENDING REGISTRATION & FOLLOW-UP",35,449,360,13,8);
  const fx=36, ft=462, fc=[98,110,220,94], fh=["Programme","Pending Registrations","Reason / Remarks","Committed Date for Completion"];
  xx=fx;fh.forEach((v,i)=>{cell(xx,ft,fc[i],32,v,blue,6.0,"center");xx+=fc[i];});
  const follow=visit?.form?.pendingFollowUp||[];
  PROGRAMMES.forEach((p,i)=>{const r=follow[i]||{},vals=[p.programme,r.pendingRegistrations??"",r.reasonRemarks||"",formatDate(r.committedDate)];xx=fx;vals.forEach((v,j)=>{cell(xx,ft+32+i*34,fc[j],34,v,null,6.2,j===1||j===3?"center":"left");xx+=fc[j];});});
  txt("6. SIGN-OFF & SUBMISSION",35,603,300,13,8);
  txt("Block Campaign Incharge Name:",36,642,190,14,6.7); line(143,654,255,654);
  txt("School In-Charge Name:",355,642,190,14,6.7); line(438,654,550,654);
  txt("Signature:",36,671,70,14,6.7); line(78,683,180,683);
  txt("Signature:",355,671,70,14,6.7); line(397,683,490,683);
  txt("Stamp:",355,700,70,14,6.7); line(390,712,490,712);
  return pdfDoc.save();
};

const buildVisitFilter = (req) => {
  const filter = { userId: req.user._id };
  const { startDate, endDate, status } = req.query;
  if (startDate || endDate) {
    filter.visitDate = {};
    if (startDate) filter.visitDate.$gte = dateOnly(startDate);
    if (endDate) {
      const end = dateOnly(endDate);
      end.setHours(23, 59, 59, 999);
      filter.visitDate.$lte = end;
    }
  }
  if (status === "VISITED") filter.status = "VISITED";
  else if (status === "YET_TO_VISIT" || status === "PLANNED") filter.status = "PLANNED";
  return filter;
};

const populateVisits = (query) => query
  .populate("schoolId", "schoolName schoolCode")
  .populate("districtId", "districtName")
  .populate("blockId", "blockName")
  .populate("userId", "name contact");

const reportRow = async (visit) => {
  const activities = visit.form?.activities || [];
  const statuses = visit.form?.studentRegistrationStatus || [];
  const follow = visit.form?.pendingFollowUp || [];
  const row = {
    "Visit Date": formatDate(visit.visitDate),
    "Visiting Status": visit.status === "VISITED" ? "Visited" : "Yet to visit",
    "School Name": visit.schoolId?.schoolName || "",
    "School Code": visit.schoolId?.schoolCode || "",
    "Block": visit.blockId?.blockName || "",
    "District": visit.districtId?.districtName || "",
    "Principal": visit.form?.schoolCampaign?.principal || "",
    "Description": visit.description || "",
  };
  activities.slice(0, 8).forEach((a, i) => {
    row[`Activity ${i + 1} Status`] = a.status || "";
    row[`Activity ${i + 1} Remarks`] = a.remarks || "";
  });
  PROGRAMMES.forEach((program, i) => {
    const s = statuses[i] || {};
    const prefix = program.programme;
    row[`${prefix} Eligible Class`] = program.eligibleClass;
    row[`${prefix} Total Students`] = s.totalStudents ?? "";
    row[`${prefix} Students Above 60%`] = s.studentsAbove60 ?? "";
    row[`${prefix} Students Below 60%`] = s.studentsBelow60 ?? "";
    row[`${prefix} Students Present`] = s.studentsPresent ?? "";
    row[`${prefix} Registrations Completed`] = s.registrationsCompleted ?? "";
    row[`${prefix} Registrations Pending`] = s.registrationsPending ?? "";
    const f = follow[i] || {};
    row[`${prefix} Pending Registrations`] = f.pendingRegistrations ?? "";
    row[`${prefix} Reason / Remarks`] = f.reasonRemarks || "";
    row[`${prefix} Committed Date for Completion`] = formatDate(f.committedDate);
  });
  row["Block Campaign Incharge Name"] = visit.form?.signOff?.centreCoordinatorName || "";
  row["School In-Charge Name"] = visit.form?.signOff?.schoolHeadName || "";
  row["Attachment"] = "";
  if (visit.attachment?.key) row.__attachmentUrl = await getSignedUrlForSpacesKey(visit.attachment.key, 7 * 24 * 60 * 60);
  return row;
};

export const listVisits = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page || "1", 10) || 1);
  const limit = 50;
  const filter = buildVisitFilter(req);
  const [total, visits] = await Promise.all([
    SchoolVisit.countDocuments(filter),
    populateVisits(SchoolVisit.find(filter)
      .sort({ visitDate: 1, createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
    ).lean(),
  ]);
  res.json(new ApiResponse(200, { items: visits, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }, "School visits fetched successfully"));
});

export const exportVisits = asyncHandler(async (req, res) => {
  req.setTimeout(0); res.setTimeout(0);
  const filter = buildVisitFilter(req);
  const visits = await populateVisits(SchoolVisit.find(filter).sort({ visitDate: 1, createdAt: 1 })).lean();
  const rows = await Promise.all(visits.map(reportRow));
  const attachmentUrls = rows.map((row) => row.__attachmentUrl || "");
  rows.forEach((row) => { delete row.__attachmentUrl; });
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const attachmentColumn = headers.indexOf("Attachment");
  if (attachmentColumn >= 0) {
    attachmentUrls.forEach((url, index) => {
      if (!url) return;
      const cellAddress = XLSX.utils.encode_cell({ r: index + 1, c: attachmentColumn });
      worksheet[cellAddress] = { t: "s", v: "View Attachment", l: { Target: url, Tooltip: "View signed attachment" } };
    });
  }
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  XLSX.utils.book_append_sheet(workbook, worksheet, "School Visits");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="school-visits-report-${new Date().toISOString().slice(0,10)}.xlsx"`,
    "Content-Length": buffer.length,
  });
  res.send(buffer);
});

export const createVisit = asyncHandler(async (req, res) => {
  const { visitDate, districtId, blockId, schoolId, description = "" } = req.body;
  if (!visitDate || !districtId || !blockId || !schoolId) throw new ApiError(400, "Visit date, district, block and school are required");
  if (!(await isSchoolAccessible(req.user._id, schoolId))) throw new ApiError(403, "You do not have access to this school");

  const school = await School.findOne({ _id: schoolId, districtId, blockId, isActive: true }).lean();
  if (!school) throw new ApiError(400, "Selected school does not match the selected district/block");

  const visit = await SchoolVisit.create({
    userId: req.user._id,
    schoolId,
    districtId,
    blockId,
    visitDate: dateOnly(visitDate),
    description: String(description).trim(),
  });
  res.status(201).json(new ApiResponse(201, await getVisit(visit._id), "School visit created successfully"));
});

export const getVisitDetails = asyncHandler(async (req, res) => {
  const visit = await getVisit(req.params.id);
  if (!(await canManageVisit(req, visit))) throw new ApiError(403, "You can only access your own school visits");
  res.json(new ApiResponse(200, visit, "School visit fetched successfully"));
});

export const saveVisitForm = asyncHandler(async (req, res) => {
  const visit = await SchoolVisit.findById(req.params.id).populate("schoolId", "schoolName schoolCode").populate("districtId", "districtName").populate("blockId", "blockName");
  if (!visit) throw new ApiError(404, "School visit not found");
  if (String(visit.userId) !== String(req.user._id)) throw new ApiError(403, "You can only update your own school visits");

  const normalized = normalizeForm(req.body?.form || {});
  await VisitForm.findOneAndUpdate(
    { schoolVisitId: visit._id },
    {
      $set: {
        schoolVisitId: visit._id,
        userId: visit.userId,
        schoolName: visit.schoolId?.schoolName || "",
        schoolCode: visit.schoolId?.schoolCode || "",
        block: visit.blockId?.blockName || "",
        district: visit.districtId?.districtName || "",
        dateOfSLCVisit: visit.visitDate,
        principalName: normalized.schoolCampaign.principal,
        awarenessCampaignActivities: normalized.activities,
        studentRegistrationStatus: normalized.studentRegistrationStatus,
        pendingRegistrationFollowUp: normalized.pendingFollowUp,
        centreCoordinatorName: normalized.signOff.centreCoordinatorName,
        schoolHeadName: normalized.signOff.schoolHeadName,
        submittedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json(new ApiResponse(200, await getVisit(visit._id), "Visit form saved successfully"));
});

export const downloadVisitPdf = asyncHandler(async (req, res) => {
  req.setTimeout(0); res.setTimeout(0);
  const visit = await getVisit(req.params.id);
  if (String(visit.userId?._id || visit.userId) !== String(req.user._id)) throw new ApiError(403, "You can only download your own visit form");
  const pdf = await createVisitPdf({ visit });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="school-visit-${visit._id}.pdf"`, "Content-Length": pdf.length });
  res.send(pdf);
});

export const downloadBlankVisitPdf = asyncHandler(async (_req, res) => {
  res.setTimeout(0);
  const pdf = await createVisitPdf({ blank: true });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=school-awareness-campaign-blank-template.pdf", "Content-Length": pdf.length });
  res.send(pdf);
});

export const uploadSignedVisit = asyncHandler(async (req, res) => {
  const visit = await SchoolVisit.findById(req.params.id);
  if (!visit) throw new ApiError(404, "School visit not found");
  if (String(visit.userId) !== String(req.user._id)) throw new ApiError(403, "You can only upload your own visit form");
  if (!req.file) throw new ApiError(400, "Signed visit form is required");
  if (!/^(application\/pdf|image\/(jpeg|png|webp))$/i.test(req.file.mimetype)) throw new ApiError(400, "Upload a PDF, JPG, PNG or WEBP file");

  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(req.file.originalname || ".pdf").toLowerCase()}`;
  const uploaded = await uploadToSpaces({ file: req.file, folder: "pratibhakhoj/school-visits", fileName });
  visit.attachment = uploaded;
  visit.status = "VISITED";
  await visit.save();
  res.json(new ApiResponse(200, await getVisit(visit._id), "Signed visit form uploaded successfully"));
});

export const viewSignedVisit = asyncHandler(async (req, res) => {
  const visit = await getVisit(req.params.id);
  if (String(visit.userId?._id || visit.userId) !== String(req.user._id)) throw new ApiError(403, "You can only view your own visit attachment");
  if (!visit.attachment?.key) throw new ApiError(404, "No signed attachment uploaded yet");
  const url = await getSignedUrlForSpacesKey(visit.attachment.key, 900);
  res.json(new ApiResponse(200, { url, fileName: visit.attachment.originalName || visit.attachment.fileName, mimeType: visit.attachment.mimeType }, "Attachment link generated"));
});
