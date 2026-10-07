import PDFDocument from "pdfkit";
import XLSX from "xlsx";
import { User } from "../../models/portal/user.models.js";
import { Role } from "../../models/portal/role.models.js";
import { Student } from "../../models/portal/student.models.js";
import { UserRegionAccess } from "../../models/portal/userRegionAccess.models.js";
import { VerificationUser } from "../../models/portal/verificationUser.models.js";
import { SchoolVisit } from "../../models/portal/schoolVisit.models.js";
import { VisitForm } from "../../models/portal/visitForm.models.js";
import { Permission } from "../../models/portal/permission.models.js";
import { RolePermission } from "../../models/portal/rolePermission.models.js";
import { UserPermission } from "../../models/portal/userPermission.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getSignedUrlForSpacesKey } from "../../utils/space.utils.js";

const dateRange = (startDate, endDate, field = "createdAt") => {
  if (!startDate && !endDate) return {};
  const range = {};
  if (startDate) {
    const d = new Date(startDate); if (Number.isNaN(d.getTime())) throw new ApiError(400, "Invalid start date");
    d.setHours(0, 0, 0, 0); range.$gte = d;
  }
  if (endDate) {
    const d = new Date(endDate); if (Number.isNaN(d.getTime())) throw new ApiError(400, "Invalid end date");
    d.setHours(23, 59, 59, 999); range.$lte = d;
  }
  return { [field]: range };
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const makeWorkbook = (rows, sheet = "Report", linkColumn = "") => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  if (linkColumn && rows.length) {
    const col = Object.keys(rows[0]).indexOf(linkColumn);
    if (col >= 0) rows.forEach((row, index) => {
      if (!row[linkColumn]) return;
      const address = XLSX.utils.encode_cell({ r: index + 1, c: col });
      ws[address] = { t: "s", v: "View Attachment", l: { Target: row[linkColumn], Tooltip: "View signed attachment" } };
    });
  }
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
};

const sendXlsx = (res, buffer, filename) => {
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": buffer.length,
  });
  res.send(buffer);
};

const sendPdf = (res, title, columns, rows, filename) => {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 24 });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("end", () => {
    const buffer = Buffer.concat(chunks);
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Content-Length": buffer.length });
    res.send(buffer);
  });
  doc.fontSize(16).text(title, { bold: true });
  doc.moveDown(0.4);
  doc.fontSize(7);
  const widths = columns.map(() => Math.max(55, (doc.page.width - 48) / columns.length));
  const drawHeader = () => {
    columns.forEach((c, i) => doc.text(String(c), 24 + widths.slice(0, i).reduce((a, b) => a + b, 0), doc.y, { width: widths[i], height: 24 }));
    doc.moveDown(2.5);
  };
  drawHeader();
  rows.forEach((row) => {
    if (doc.y > doc.page.height - 50) { doc.addPage(); doc.fontSize(7); drawHeader(); }
    const y = doc.y;
    columns.forEach((c, i) => doc.text(String(row[c] ?? ""), 24 + widths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: widths[i], height: 32 }));
    doc.moveDown(2.2);
  });
  doc.end();
};

const assertCode = (req, code) => {
  if (req.user?.roleCode === "ADMIN" || req.user?.isAdmin) return;
};

const getRoleMap = async (roleIds = []) => {
  const roles = await Role.find({ _id: { $in: roleIds } }).select("_id name code").lean();
  return new Map(roles.map((r) => [String(r._id), r]));
};

const regionLabels = async (userIds) => {
  const rows = await UserRegionAccess.find({ userId: { $in: userIds } })
    .populate("districtId", "districtName")
    .populate("blockId", "blockName")
    .lean();
  const map = new Map();
  for (const row of rows) {
    const key = String(row.userId);
    if (!map.has(key)) map.set(key, { districts: new Set(), blocks: new Set() });
    const target = map.get(key);
    if (row.districtId?.districtName) target.districts.add(row.districtId.districtName);
    if (row.blockId?.blockName) target.blocks.add(row.blockId.blockName);
    if (row.scope === "global") { target.districts.add("All"); target.blocks.add("All"); }
  }
  return map;
};

const userSummaryRows = async ({ roleId, startDate, endDate }) => {
  const users = await User.find({ isActive: true, ...(roleId ? { roleId } : {}) }).select("_id name contact roleId").lean();
  const roleMap = await getRoleMap([...new Set(users.map((u) => String(u.roleId))) ]);
  const regions = await regionLabels(users.map((u) => u._id));
  const match = { isActive: true, isRegisteredBy: { $in: users.map((u) => u._id) }, ...dateRange(startDate, endDate) };
  const counts = users.length ? await Student.aggregate([
    { $match: match },
    { $group: { _id: { user: "$isRegisteredBy", exam: "$examType" }, count: { $sum: 1 } } },
  ]) : [];
  const countMap = new Map(counts.map((x) => [`${x._id.user}:${x._id.exam}`, x.count]));
  return users.sort((a,b) => a.name.localeCompare(b.name)).map((u, i) => {
    const r = regions.get(String(u._id)) || { districts: new Set(), blocks: new Set() };
    return {
      "#": i + 1, "UserName": u.name,
      "Districts": [...r.districts].join(", "), "Blocks": [...r.blocks].join(", "),
      "MB": countMap.get(`${u._id}:MB`) || 0, "HS100": countMap.get(`${u._id}:HS100`) || 0,
      "Count": (countMap.get(`${u._id}:MB`) || 0) + (countMap.get(`${u._id}:HS100`) || 0),
    };
  });
};

const registrationStats = async ({ startDate, endDate }) => {
  const match = { isActive: true, ...dateRange(startDate, endDate) };
  const rows = await Student.aggregate([{ $match: match }, { $group: { _id: { exam: "$examType", registeredBy: { $cond: [{ $ne: ["$isRegisteredBy", null] }, "user", "self"] } }, count: { $sum: 1 } } }]);
  const verified = await Student.aggregate([{ $match: match }, { $group: { _id: { exam: "$examType", status: "$verificationStatus" }, count: { $sum: 1 } } }]);
  const out = {};
  for (const exam of ["MB", "HS100"]) {
    out[exam] = { total: 0, self: 0, user: 0, verified: 0, pending: 0 };
    rows.filter((r) => r._id.exam === exam).forEach((r) => { out[exam][r._id.registeredBy] = r.count; out[exam].total += r.count; });
    verified.filter((r) => r._id.exam === exam).forEach((r) => { if (r._id.status === "Verified") out[exam].verified += r.count; if (r._id.status === "Pending") out[exam].pending += r.count; });
  }
  return out;
};

export const registrationsByUsers = asyncHandler(async (req, res) => {
  const { roleId = "", startDate = "", endDate = "" } = req.query;
  const stats = await registrationStats({ startDate, endDate });
  const rows = roleId ? await userSummaryRows({ roleId, startDate, endDate }) : [];
  const roles = await Role.find({ isActive: true }).select("_id name code").sort({ name: 1 }).lean();
  res.json(new ApiResponse(200, { stats, rows, roles, roleSelected: Boolean(roleId) }, "Registrations by users dashboard fetched"));
});

export const exportRegistrationsByUsers = asyncHandler(async (req, res) => {
  const { roleId = "", startDate = "", endDate = "" } = req.query;
  if (!roleId) throw new ApiError(400, "Role is required for export");
  const rows = await userSummaryRows({ roleId, startDate, endDate });
  const buffer = makeWorkbook(rows, "Registrations By Users");
  sendXlsx(res, buffer, "registrations-by-users.xlsx");
});

const verificationRows = async ({ search = "", startDate = "", endDate = "" }) => {
  const users = await VerificationUser.find({ isActive: true })
    .populate({ path: "userId", select: "_id name contact roleId", populate: { path: "roleId", select: "name code" } })
    .lean();
  const regex = search.trim() ? new RegExp(escapeRegex(search.trim()), "i") : null;
  const filtered = users.filter((x) => x.userId && (!regex || regex.test(x.userId.name) || regex.test(x.userId.contact)));
  const verifiedRange = dateRange(startDate, endDate, "verifiedAt");
  const rows = [];
  for (const assignment of filtered) {
    const make = async (exam) => {
      if (!assignment.examType?.includes(exam)) return { pending: 0, verified: 0, rejected: 0 };
      const region = assignment.region?.length ? { districtId: { $in: assignment.region } } : {};
      const [pending, verified, rejected] = await Promise.all([
        Student.countDocuments({ isActive: true, examType: exam, verificationStatus: "Pending", ...region }),
        Student.countDocuments({ isActive: true, examType: exam, verificationStatus: "Verified", verifiedBy: assignment.userId._id, ...region, ...verifiedRange }),
        Student.countDocuments({ isActive: true, examType: exam, verificationStatus: "Rejected", verifiedBy: assignment.userId._id, ...region, ...verifiedRange }),
      ]);
      return { pending, verified, rejected };
    };
    const [mb, hs] = await Promise.all([make("MB"), make("HS100")]);
    rows.push({
      UserName: assignment.userId.name,
      Districts: assignment.region?.length || 0,
      "Pending MB": mb.pending, "Verified MB": mb.verified, "Rejected MB": mb.rejected,
      "Pending HS100": hs.pending, "Verified HS100": hs.verified, "Rejected HS100": hs.rejected,
    });
  }
  return rows.sort((a, b) => a.UserName.localeCompare(b.UserName));
};

export const verificationByUsers = asyncHandler(async (req, res) => {
  const rows = await verificationRows(req.query);
  res.json(new ApiResponse(200, { rows }, "Verification by users dashboard fetched"));
});

export const exportVerificationByUsers = asyncHandler(async (req, res) => {
  const rows = await verificationRows(req.query);
  if (String(req.query.format || "xlsx").toLowerCase() === "pdf") return sendPdf(res, "Verification By Users", Object.keys(rows[0] || { UserName: "" }), rows, "verification-by-users.pdf");
  sendXlsx(res, makeWorkbook(rows, "Verification By Users"), "verification-by-users.xlsx");
});

const hasSchoolVisitPermissionUsers = async () => {
  const permission = await Permission.findOne({ code: "SCHOOL_VISIT_ACCESS", isActive: true }).select("_id").lean();
  if (!permission) return [];
  const [roleRows, userRows, allUsers] = await Promise.all([
    RolePermission.find({ permissionId: permission._id }).select("roleId isAllowed").lean(),
    UserPermission.find({ permissionId: permission._id }).select("userId isAllowed").lean(),
    User.find({ isActive: true }).select("_id name contact roleId").populate("roleId", "name code").lean(),
  ]);
  const roleState = new Map(roleRows.map((x) => [String(x.roleId), x.isAllowed !== false]));
  const userState = new Map(userRows.map((x) => [String(x.userId), x.isAllowed !== false]));
  return allUsers.filter((user) => user.roleId?.code === "ADMIN" || (userState.has(String(user._id)) ? userState.get(String(user._id)) : roleState.get(String(user.roleId?._id)) === true));
};

const schoolVisitRows = async ({ roleId = "", startDate = "", endDate = "", districtId = "", blockId = "", search = "" }) => {
  const users = await hasSchoolVisitPermissionUsers();
  const regex = search.trim() ? new RegExp(escapeRegex(search.trim()), "i") : null;
  const filteredUsers = users.filter((u) => (!roleId || String(u.roleId?._id) === String(roleId)) && (!regex || regex.test(u.name) || regex.test(u.contact) || regex.test(u.roleId?.name || "")));
  const userIds = filteredUsers.map((u) => u._id);
  const visitFilter = { userId: { $in: userIds } };
  const range = dateRange(startDate, endDate, "visitDate"); Object.assign(visitFilter, range);
  if (districtId) visitFilter.districtId = districtId;
  if (blockId) visitFilter.blockId = blockId;
  const grouped = userIds.length ? await SchoolVisit.aggregate([{ $match: visitFilter }, { $group: { _id: "$userId", visitsCreated: { $sum: 1 }, visited: { $sum: { $cond: [{ $eq: ["$status", "VISITED"] }, 1, 0] } }, pending: { $sum: { $cond: [{ $eq: ["$status", "PLANNED"] }, 1, 0] } }, pdfUploaded: { $sum: { $cond: [{ $ne: ["$attachment", null] }, 1, 0] } } } }]) : [];
  const map = new Map(grouped.map((x) => [String(x._id), x]));
  return filteredUsers.sort((a,b)=>a.name.localeCompare(b.name)).map((u,i) => { const x=map.get(String(u._id))||{}; return { "#": i+1, "UserName": u.name, "Contact": u.contact, "Role": u.roleId?.name||"-", "Visits Created": x.visitsCreated||0, "Visited": x.visited||0, "Pending": x.pending||0, "PDFUploaded": x.pdfUploaded||0, "_userId": String(u._id) }; });
};

const visitDetailRows = async ({ userId = "", startDate = "", endDate = "", districtId = "", blockId = "" }) => {
  const filter = {}; if (userId) filter.userId = userId; Object.assign(filter, dateRange(startDate,endDate,"visitDate")); if(districtId) filter.districtId=districtId; if(blockId) filter.blockId=blockId;
  const visits = await SchoolVisit.find(filter).populate("schoolId","schoolName schoolCode").populate("districtId","districtName").populate("blockId","blockName").populate("userId","name contact").sort({visitDate:1}).lean();
  const forms = await VisitForm.find({ schoolVisitId: { $in: visits.map(v=>v._id) } }).lean(); const formMap=new Map(forms.map(f=>[String(f.schoolVisitId),f]));
  const rows=[];
  for(const v of visits){ const f=formMap.get(String(v._id)); const activities=f?.awarenessCampaignActivities||[]; const status=f?.studentRegistrationStatus||[]; const pending=f?.pendingRegistrationFollowUp||[]; const row={"Visit Date":v.visitDate?new Date(v.visitDate).toLocaleDateString("en-IN"):"","UserName":v.userId?.name||"","Contact":v.userId?.contact||"","School Name":v.schoolId?.schoolName||"","School Code":v.schoolId?.schoolCode||"","Block":v.blockId?.blockName||"","District":v.districtId?.districtName||"","Status":v.status,"Description":v.description||"","Centre Coordinator":f?.centreCoordinator||""}; activities.forEach((a,i)=>{row[`Activity ${i+1}`]=a.activity;row[`Activity ${i+1} Status`]=a.status;row[`Activity ${i+1} Remarks`]=a.remarks;}); status.forEach((x,i)=>{const p=i===0?"Mission Buniyaad":"Haryana Super 100"; row[`${p} Eligible Class`]=x.eligibleClass;row[`${p} Total Students`]=x.totalStudents??"";row[`${p} Students Above 60%`]=x.studentsAbove60??"";row[`${p} Students Below 60%`]=x.studentsBelow60??"";row[`${p} Students Present`]=x.studentsPresent??"";row[`${p} Students Absent`]=x.studentsAbsent??"";row[`${p} Registrations Completed`]=x.registrationsCompleted??"";row[`${p} Registrations Pending`]=x.registrationsPending??"";}); pending.forEach((x,i)=>{const p=i===0?"Mission Buniyaad":"Haryana Super 100";row[`${p} Pending Registrations`]=x.pendingRegistrations??"";row[`${p} Reason / Remarks`]=x.reasonRemarks||"";row[`${p} Committed Date`]=x.committedDate?new Date(x.committedDate).toLocaleDateString("en-IN"):"";}); row["Centre Coordinator Name"]=f?.centreCoordinatorName||"";row["School Head Name"]=f?.schoolHeadName||"";row["PDF Uploaded"]=v.attachment?"Yes":"No"; if(v.attachment?.key){try{row["Attachment"]=await getSignedUrlForSpacesKey(v.attachment.key,7*24*60*60)}catch{row["Attachment"]=""}}else row["Attachment"]=""; rows.push(row); }
  return rows;
};

export const schoolVisitDashboard = asyncHandler(async (req,res)=>{ const rows=await schoolVisitRows(req.query); const roles=await Role.find({isActive:true}).select("_id name code").sort({name:1}).lean(); res.json(new ApiResponse(200,{rows,roles},"School visit dashboard fetched")); });
export const exportSchoolVisitDashboard = asyncHandler(async (req, res) => {
  const full = String(req.query.fullDetails || "") === "1";
  if (full) {
    const rows = await visitDetailRows(req.query);
    if (String(req.query.format || "xlsx").toLowerCase() === "pdf") {
      return sendPdf(res, "School Visit Full Details", Object.keys(rows[0] || { "Visit Date": "" }), rows, "school-visit-full-details.pdf");
    }
    return sendXlsx(res, makeWorkbook(rows, "School Visit Details", "Attachment"), "school-visit-full-details.xlsx");
  }
  const rows = await schoolVisitRows(req.query);
  const exportRows = rows.map(({ _userId, ...row }) => row);
  if (String(req.query.format || "xlsx").toLowerCase() === "pdf") {
    return sendPdf(res, "School Visit Dashboard", Object.keys(exportRows[0] || { UserName: "" }), exportRows, "school-visit-summary.pdf");
  }
  sendXlsx(res, makeWorkbook(exportRows, "School Visit Summary"), "school-visit-summary.xlsx");
});
