import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { PDFDocument } from "pdf-lib";
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
  "Coordination with Principal / School Nodal Officer",
  "Assembly / interaction with eligible students",
  "Awareness session on Mission Buniyaad & Haryana Super 100",
  "Screening of approved awareness videos",
  "Display / sharing of campaign posters",
  "Student queries and interaction",
  "Awareness survey (FAQs) conducted",
  "Registration",
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
    centreCoordinator: String(form.schoolCampaign?.centreCoordinator || "").trim(),
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
    schoolCampaign: { centreCoordinator: form.centreCoordinator || "" },
    activities: form.awarenessCampaignActivities || [],
    studentRegistrationStatus: form.studentRegistrationStatus || [],
    pendingFollowUp: form.pendingRegistrationFollowUp || [],
    signOff: { centreCoordinatorName: form.centreCoordinatorName || "", schoolHeadName: form.schoolHeadName || "" },
  } : null;
  return visit;
};

const TEMPLATE_PATH = path.join(process.cwd(), "public", "template", "slcTemplate.pdf");
const FONT_PATH = path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf");

const formatDate = (value) => value ? new Date(value).toLocaleDateString("en-IN") : "";
const textValue = (value) => value === null || value === undefined ? "" : String(value);

const fitText = (font, value, size, maxWidth) => {
  let text = textValue(value);
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  while (text.length && font.widthOfTextAtSize(`${text}…`, size) > maxWidth) text = text.slice(0, -1);
  return text ? `${text}…` : "";
};

const drawValue = (page, font, value, x, top, width, height, size = 7.5, align = "left") => {
  const text = fitText(font, value, size, Math.max(4, width - 6));
  if (!text) return;
  const pageHeight = page.getHeight();
  const textWidth = font.widthOfTextAtSize(text, size);
  const tx = align === "center" ? x + Math.max(3, (width - textWidth) / 2) : x + 3;
  const ty = pageHeight - top - height + Math.max(3, (height - size) / 2 + 1);
  page.drawText(text, { x: tx, y: ty, size, font });
};

const createVisitPdf = async ({ visit, blank = false }) => {
  const bytes = await fs.readFile(TEMPLATE_PATH);
  if (blank) return bytes;

  const pdfDoc = await PDFDocument.load(bytes);
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = await fs.readFile(FONT_PATH);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const page = pdfDoc.getPages()[0];

  // Coordinates are aligned to the supplied slcTemplate.pdf. Values are overlaid
  // into the existing cells; the template itself is never re-drawn in code.
  const school = visit?.schoolId?.schoolName || "";
  const schoolCode = visit?.schoolId?.schoolCode || "";
  const block = visit?.blockId?.blockName || "";
  const district = visit?.districtId?.districtName || "";
  const visitDate = formatDate(visit?.visitDate);
  const coordinator = visit?.form?.schoolCampaign?.centreCoordinator || visit?.userId?.name || "";

  // Section 1 value cells.
  drawValue(page, font, school, 119.9, 142.7, 177.5, 13.8, 7.2);
  drawValue(page, font, schoolCode, 426.3, 142.7, 128.9, 13.8, 7.2);
  drawValue(page, font, block, 119.9, 156.5, 177.5, 13.8, 7.2);
  drawValue(page, font, district, 426.3, 156.5, 128.9, 13.8, 7.2);
  drawValue(page, font, visitDate, 119.9, 170.9, 177.5, 13.8, 7.2);
  drawValue(page, font, coordinator, 426.3, 170.9, 128.9, 13.8, 7.2);

  // Section 2 activity status + remarks.
  const activities = visit?.form?.activities || [];
  activities.slice(0, 8).forEach((item, index) => {
    const top = 235.0 + index * 19.2;
    drawValue(page, font, item.status, 345.3, top, 35.4, 19.2, 7.2, "center");
    drawValue(page, font, item.remarks, 380.7, top, 176.3, 19.2, 6.5);
  });

  // Section 3 two programme rows.
  const statuses = visit?.form?.studentRegistrationStatus || [];
  statuses.slice(0, 2).forEach((item, index) => {
    const top = 460.4 + index * 27.6;
    const values = [
      item.totalStudents, item.studentsAbove60, item.studentsBelow60,
      item.studentsPresent, item.studentsAbsent, item.registrationsCompleted,
      item.registrationsPending,
    ];
    const xs = [152.9, 199.6, 262.0, 326.1, 380.7, 431.7, 493.4];
    const widths = [46.7, 62.4, 64.1, 54.6, 50.9, 61.8, 65.4];
    values.forEach((value, i) => drawValue(page, font, value, xs[i], top, widths[i], 27.6, 7.2, "center"));
  });

  // Section 4 pending registration/follow-up.
  const follow = visit?.form?.pendingFollowUp || [];
  follow.slice(0, 2).forEach((item, index) => {
    const top = 588.1 + index * 36.0;
    drawValue(page, font, item.pendingRegistrations, 134.3, top, 109.1, 36, 7.2, "center");
    drawValue(page, font, item.reasonRemarks, 243.4, top, 199.6, 36, 6.5);
    drawValue(page, font, formatDate(item.committedDate), 443.0, top, 118.7, 36, 7.0, "center");
  });

  // Section 6 sign-off names (signature/stamp remain blank for printing/signing).
  drawValue(page, font, visit?.form?.signOff?.centreCoordinatorName || "", 132, 738, 190, 18, 7.2);
  drawValue(page, font, visit?.form?.signOff?.schoolHeadName || "", 470, 738, 88, 18, 7.2);

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
    "Centre Coordinator": visit.form?.schoolCampaign?.centreCoordinator || visit.userId?.name || "",
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
    row[`${prefix} Students Absent`] = s.studentsAbsent ?? "";
    row[`${prefix} Registrations Completed`] = s.registrationsCompleted ?? "";
    row[`${prefix} Registrations Pending`] = s.registrationsPending ?? "";
    const f = follow[i] || {};
    row[`${prefix} Pending Registrations`] = f.pendingRegistrations ?? "";
    row[`${prefix} Reason / Remarks`] = f.reasonRemarks || "";
    row[`${prefix} Committed Date for Completion`] = formatDate(f.committedDate);
  });
  row["Centre Coordinator Name"] = visit.form?.signOff?.centreCoordinatorName || "";
  row["School Head Name"] = visit.form?.signOff?.schoolHeadName || "";
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
        centreCoordinator: normalized.schoolCampaign.centreCoordinator,
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
  const visit = await getVisit(req.params.id);
  if (String(visit.userId?._id || visit.userId) !== String(req.user._id)) throw new ApiError(403, "You can only download your own visit form");
  const pdf = await createVisitPdf({ visit });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="school-visit-${visit._id}.pdf"`, "Content-Length": pdf.length });
  res.send(pdf);
});

export const downloadBlankVisitPdf = asyncHandler(async (_req, res) => {
  const pdf = await fs.readFile(TEMPLATE_PATH);
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
