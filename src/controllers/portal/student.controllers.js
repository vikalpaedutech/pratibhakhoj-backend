import mongoose from "mongoose";
import XLSX from "xlsx";

import { Student } from "../../models/portal/student.models.js";
import { StudentLog } from "../../models/portal/studentLog.models.js";
import { School } from "../../models/portal/school.models.js";
import { District } from "../../models/portal/district.models.js";
import { Block } from "../../models/portal/block.models.js";
import { UserRegionAccess } from "../../models/portal/userRegionAccess.models.js";
import { VerificationUser } from "../../models/portal/verificationUser.models.js";
import { UserDashboardAccess, DASHBOARD_ACCESS_CODES } from "../../models/portal/userDashboardAccess.models.js";
import { Role } from "../../models/portal/role.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { generateSlipId } from "../../utils/portal.utils.js";
import { saveUploadedFile } from "../../utils/file.utils.js";
import { deleteFromSpaces, getSignedUrlForSpacesKey } from "../../utils/space.utils.js";
import { createL1AcknowledgementSlip } from "../acknowledgment-slips/L1AcknowledgementSlip.js";
import { createZip } from "../../utils/zip.utils.js";
import { hasEffectiveDashboardAccess, hasAllRegistrationAccess } from "../../services/portal/dashboardAccess.services.js";

const examConfig = {
  MB: { name: "Mission Buniyaad", classOfStudent: 8 },
  HS100: { name: "Haryana Super 100", classOfStudent: 10 },
};

const getExam = (examType) => {
  const config = examConfig[String(examType || "").toUpperCase()];
  if (!config) throw new ApiError(400, "examType must be MB or HS100");
  return { code: String(examType).toUpperCase(), ...config };
};

const cleanString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

// Bulk registration templates expose ONLY region names.
// The user never enters Mongo ObjectIds in Excel. The backend resolves:
// districtName -> District._id
// blockName    -> Block._id (inside that district)
// schoolName   -> School._id (inside that district + block)
//
// Names are matched case-insensitively after trimming. The hierarchy is
// always used so the same block/school name can safely exist elsewhere.
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resolveBulkRegion = async (row, cache = new Map()) => {
  const districtName = cleanString(row.districtName);
  const blockName = cleanString(row.blockName);
  const schoolName = cleanString(row.schoolName);

  if (!districtName || !blockName || !schoolName) {
    throw new ApiError(400, "districtName, blockName and schoolName are required in the bulk template");
  }

  const cacheKey = `${districtName.toLowerCase()}|${blockName.toLowerCase()}|${schoolName.toLowerCase()}`;
  if (cache.has(cacheKey)) {
    return { ...row, ...cache.get(cacheKey) };
  }

  const district = await District.findOne({
    districtName: { $regex: `^${escapeRegex(districtName)}$`, $options: "i" },
    isActive: true,
  }).lean();

  if (!district) {
    throw new ApiError(400, `District not found: ${districtName}`);
  }

  const block = await Block.findOne({
    districtId: district._id,
    blockName: { $regex: `^${escapeRegex(blockName)}$`, $options: "i" },
    isActive: true,
  }).lean();

  if (!block) {
    throw new ApiError(400, `Block not found: ${blockName} in ${districtName}`);
  }

  const school = await School.findOne({
    districtId: district._id,
    blockId: block._id,
    schoolName: { $regex: `^${escapeRegex(schoolName)}$`, $options: "i" },
    isActive: true,
  }).lean();

  if (!school) {
    throw new ApiError(400, `School not found: ${schoolName} in ${blockName}, ${districtName}`);
  }

  const resolvedRegion = {
    districtId: String(district._id),
    blockDistrictId: String(block._id),
    schoolDistrictId: String(school._id),
    schoolEntry: "db",
    schoolNameManual: null,
  };

  cache.set(cacheKey, resolvedRegion);

  return {
    ...row,
    ...resolvedRegion,
  };
};

const normalizeDob = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) return value;

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }

  const text = String(value).trim();
  let match = text.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  return value;
};

const sanitize = (payload, examType, { bulk = false } = {}) => {
  const exam = getExam(examType);

  return {
    studentSrn: String(payload.studentSrn || payload.srn || "").trim(),
    name: String(payload.name || "").trim(),
    fatherName: String(payload.fatherName || payload.father || "").trim(),
    motherName: cleanString(payload.motherName || payload.mother),
    dob: normalizeDob(payload.dob ?? payload["dob (dd-mm-yyyy)"]),
    gender: cleanString(payload.gender),
    category: cleanString(payload.category),
    aadhar: cleanString(payload.aadhar),
    mobile: cleanString(payload.mobile),
    whatsapp: cleanString(payload.whatsapp),
    houseNumber: cleanString(payload.houseNumber),
    cityTownVillage: cleanString(payload.cityTownVillage),
    addressBlock: cleanString(payload.addressBlock),
    addressDistrict: cleanString(payload.addressDistrict),
    addressState: bulk ? null : "Haryana",

    districtId: payload.districtId || null,
    blockDistrictId: payload.blockDistrictId || null,
    schoolDistrictId: payload.schoolDistrictId || null,
    schoolEntry: payload.schoolEntry === "manual" ? "manual" : "db",
    schoolNameManual: cleanString(payload.schoolNameManual),

    previousClassAnnualExamPercentage:
      payload.previousClassAnnualExamPercentage === "" ||
      payload.previousClassAnnualExamPercentage === null ||
      payload.previousClassAnnualExamPercentage === undefined
        ? null
        : Number(payload.previousClassAnnualExamPercentage),

    classOfStudent: exam.classOfStudent,
  };
};

const validateStudent = async (data, examType, { bulk = false } = {}) => {
  const exam = getExam(examType);

  const required = [
    "studentSrn",
    "name",
    "fatherName",
    ...(bulk ? [] : ["motherName"]),
    "dob",
    "gender",
    "category",
    "mobile",
    "districtId",
    "blockDistrictId",
  ];

  const missing = required.filter((field) => !data[field]);
  if (missing.length) {
    throw new ApiError(400, `Missing required fields: ${missing.join(", ")}`);
  }

  if (!/^\d{10}$/.test(data.studentSrn)) {
    throw new ApiError(400, "SRN must be exactly 10 digits");
  }

  if (!/^\d{10}$/.test(data.mobile)) {
    throw new ApiError(400, "Mobile number must be exactly 10 digits");
  }

  if (data.aadhar && !/^\d{12}$/.test(data.aadhar)) {
    throw new ApiError(400, "Aadhar must be exactly 12 digits");
  }

  if (data.previousClassAnnualExamPercentage !== null) {
    if (
      Number.isNaN(data.previousClassAnnualExamPercentage) ||
      data.previousClassAnnualExamPercentage < 0 ||
      data.previousClassAnnualExamPercentage > 100
    ) {
      throw new ApiError(400, "Previous annual exam percentage must be between 0 and 100");
    }
  }

  if (data.schoolEntry === "db") {
    if (!data.schoolDistrictId) throw new ApiError(400, "School is required");

    const school = await School.findOne({
      _id: data.schoolDistrictId,
      districtId: data.districtId,
      blockId: data.blockDistrictId,
      isActive: true,
    });

    if (!school) throw new ApiError(400, "Selected school does not belong to the selected district and block");
  }

  if (data.schoolEntry === "manual" && !data.schoolNameManual) {
    throw new ApiError(400, "Manual school name is required");
  }

  return exam;
};

const getStoredFileKey = (fileMeta) => {
  if (!fileMeta) return null;
  if (fileMeta.key) return fileMeta.key;

  const endpoint = String(process.env.SPACES_ENDPOINT || "").replace(/\/+$/, "");
  const bucket = String(process.env.SPACES_BUCKET || "").replace(/^\/+|\/+$/g, "");
  const url = String(fileMeta.url || "");

  if (endpoint && bucket) {
    const prefix = `${endpoint}/${bucket}/`;
    if (url.startsWith(prefix)) return url.slice(prefix.length);
  }

  return null;
};

const saveFiles = async (files = {}) => {
  const result = {};

  if (files.studentImage?.[0]) {
    result.studentImage = await saveUploadedFile(
      files.studentImage[0],
      "pratibhakhoj/students/images"
    );
  }

  if (files.previousClassResult?.[0]) {
    result.previousClassResult = await saveUploadedFile(
      files.previousClassResult[0],
      "pratibhakhoj/students/previous-class-results"
    );
  }

  return result;
};

const replaceUploadedFiles = async (current, files = {}) => {
  const fileData = await saveFiles(files);
  const oldKeys = [];

  if (fileData.studentImage) {
    const oldKey = getStoredFileKey(current.studentImage);
    if (oldKey) oldKeys.push(oldKey);
  }

  if (fileData.previousClassResult) {
    const oldKey = getStoredFileKey(current.previousClassResult);
    if (oldKey) oldKeys.push(oldKey);
  }

  return { fileData, oldKeys };
};

const deleteOldFiles = async (keys = []) => {
  for (const key of [...new Set(keys.filter(Boolean))]) {
    try {
      await deleteFromSpaces(key);
    } catch (error) {
      console.error(`Unable to delete replaced Spaces object: ${key}`, error);
    }
  }
};

const BULK_VERIFICATION_REMARK =
  "Bulk upload is allowed to not be part of verificatin process as it is considered that the registrations done by officials are genuine.";

const createStudent = async (
  payload,
  {
    examType,
    userId = null,
    isBulkRegistered = false,
    verified = false,
    verificationRemark = null,
    verifiedByUserId = null,
    files = {},
  }
) => {
  const data = sanitize(payload, examType, { bulk: isBulkRegistered });
  await validateStudent(data, examType, { bulk: isBulkRegistered });

  const exists = await Student.findOne({
    studentSrn: data.studentSrn,
    examType: getExam(examType).code,
    isActive: true,
  });

  if (exists) {
    throw new ApiError(409, "This SRN is already registered. Use the acknowledgement page to edit or download the slip.");
  }

  const fileData = await saveFiles(files);
  const slipId = generateSlipId(data.name, data.studentSrn);

  const slipExists = await Student.exists({ slipId });
  if (slipExists) {
    throw new ApiError(409, "Unable to generate a unique acknowledgement slip ID. Please contact the administrator.");
  }

  return Student.create({
    ...data,
    ...fileData,
    examType: getExam(examType).code,
    examinationLevel: 1,
    slipId,
    isRegisteredBy: userId,
    isBulkRegistered,
    isVerified: verified,
    verificationStatus: verified ? "Verified" : "Pending",
    verifiedBy: verified ? verifiedByUserId : null,
    registrationFormVerificationRemark: verified ? verificationRemark : null,
  });
};

const regionStudentFilter = async (userId) => {
  const access = await UserRegionAccess.find({ userId }).lean();

  if (!access.length) return { _id: null };
  if (access.some((item) => item.scope === "global")) return {};

  const clauses = [];

  const districtIds = access
    .filter((item) => item.scope === "district")
    .map((item) => item.districtId)
    .filter(Boolean);

  const blockIds = access
    .filter((item) => item.scope === "block")
    .map((item) => item.blockId)
    .filter(Boolean);

  const schoolIds = access
    .filter((item) => item.scope === "school")
    .map((item) => item.schoolId)
    .filter(Boolean);

  if (districtIds.length) clauses.push({ districtId: { $in: districtIds } });
  if (blockIds.length) clauses.push({ blockDistrictId: { $in: blockIds } });
  if (schoolIds.length) clauses.push({ schoolDistrictId: { $in: schoolIds } });

  return clauses.length ? { $or: clauses } : { _id: null };
};

const ensureStudentInRegion = async (userId, student) => {
  const filter = await regionStudentFilter(userId);
  if (filter._id === null) throw new ApiError(403, "You do not have access to this student's region");

  const visible = await Student.exists({ _id: student._id, ...filter });
  if (!visible) throw new ApiError(403, "You do not have access to this student's region");
};

const ensurePayloadInRegion = async (userId, payload) => {
  const filter = await regionStudentFilter(userId);
  if (filter._id === null) throw new ApiError(403, "You do not have access to this student's region");

  const visible = await Student.exists({
    ...filter,
    districtId: payload.districtId,
    blockDistrictId: payload.blockDistrictId,
    ...(payload.schoolEntry === "db" && payload.schoolDistrictId
      ? { schoolDistrictId: payload.schoolDistrictId }
      : {}),
  });

  if (visible) return;

  const access = await UserRegionAccess.find({ userId }).lean();
  if (access.some((item) => item.scope === "global")) return;

  const districtAllowed = access.some(
    (item) => item.scope === "district" && String(item.districtId) === String(payload.districtId)
  );
  const blockAllowed = access.some(
    (item) => item.scope === "block" && String(item.blockId) === String(payload.blockDistrictId)
  );
  const schoolAllowed = payload.schoolEntry === "db" && access.some(
    (item) => item.scope === "school" && String(item.schoolId) === String(payload.schoolDistrictId)
  );

  if (!districtAllowed && !blockAllowed && !schoolAllowed) {
    throw new ApiError(403, "You do not have access to the selected district, block or school");
  }
};

const studentResponse = (student) => student;

const requireAllRegistrationDashboardAccess = async (req, examType) => {
  if (!(await hasAllRegistrationAccess(req.user, examType))) {
    throw new ApiError(403, "You do not have access to this all-registration dashboard");
  }
};

const normalizeObjectIdUpdateFields = (update) => {
  const normalized = { ...update };
  for (const field of ["districtId", "blockDistrictId", "schoolDistrictId"]) {
    if (normalized[field] === "") normalized[field] = null;
  }
  return normalized;
};

const STUDENT_DETAIL_LOG_FIELDS = [
  "name", "fatherName", "motherName", "dob", "gender", "category",
  "aadhar", "mobile", "whatsapp", "houseNumber", "cityTownVillage",
  "addressBlock", "addressDistrict", "addressState", "districtId",
  "blockDistrictId", "schoolDistrictId", "schoolEntry", "schoolNameManual",
  "previousClassAnnualExamPercentage", "previousClassResult", "studentImage",
  "classOfStudent", "rollNumber", "L1ShortlistOrWaitlist", "L2ShortlistOrWaitlist",
  "L3ShortlistOrWaitlist", "finalSelection",
];

const toAuditValue = (value) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (value?._bsontype === "ObjectId" || value?.constructor?.name === "ObjectId") return String(value);
  if (Array.isArray(value)) return value.map(toAuditValue);
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = toAuditValue(item);
    return result;
  }
  return value;
};

const collectStudentDetailChanges = (before, after) => {
  const changes = [];
  for (const field of STUDENT_DETAIL_LOG_FIELDS) {
    const oldValue = toAuditValue(before?.[field]);
    const newValue = toAuditValue(after?.[field]);
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ field, oldValue, newValue });
    }
  }
  return changes;
};

const createStudentUpdateLog = async ({ student, before, updatedBy, source }) => {
  const changes = collectStudentDetailChanges(before, student);
  if (!changes.length) return null;
  try {
    return await StudentLog.create({
      studentId: student._id,
      updatedBy: updatedBy || null,
      examType: student.examType,
      examinationLevel: student.examinationLevel || 1,
      action: "UPDATE",
      source,
      changedFields: changes.map((change) => change.field),
      changes,
    });
  } catch (error) {
    console.error("Unable to create StudentLog audit record", error);
    return null;
  }
};

const buildAllRegistrationFilter = (req) => {
  const examType = getExam(req.query.examType).code;
  const filter = {
    isActive: true,
    examinationLevel: 1,
    examType,
  };

  for (const [queryKey, field] of [
    ["districtId", "districtId"],
    ["blockDistrictId", "blockDistrictId"],
    ["schoolDistrictId", "schoolDistrictId"],
  ]) {
    if (req.query[queryKey]) {
      if (!mongoose.Types.ObjectId.isValid(req.query[queryKey])) {
        throw new ApiError(400, `Invalid ${queryKey}`);
      }
      filter[field] = req.query[queryKey];
    }
  }

  if (req.query.search?.trim()) {
    const regex = { $regex: escapeRegex(String(req.query.search).trim()), $options: "i" };
    filter.$or = [
      { studentSrn: regex },
      { name: regex },
      { fatherName: regex },
      { slipId: regex },
    ];
  }

  return { examType, filter };
};

export const allRegistrationsDashboard = asyncHandler(async (req, res) => {
  const { examType, filter } = buildAllRegistrationFilter(req);
  await requireAllRegistrationDashboardAccess(req, examType);

  const requestedLimit = Number(req.query.limit) || 5000;
  const limit = Math.min(Math.max(requestedLimit, 1), 5000);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const skip = (page - 1) * limit;

  const [students, total] = await Promise.all([
    Student.find(filter)
      .populate("districtId", "districtName")
      .populate("blockDistrictId", "blockName")
      .populate("schoolDistrictId", "schoolName")
      .populate("isRegisteredBy", "name contact")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Student.countDocuments(filter),
  ]);

  res.json(new ApiResponse(200, {
    examType,
    students,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }, "All Level 1 registrations fetched successfully"));
});

export const getAllRegistrationStudentForEdit = asyncHandler(async (req, res) => {
  const examType = getExam(req.query.examType).code;
  await requireAllRegistrationDashboardAccess(req, examType);

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, "Invalid student ID");
  const student = await Student.findOne({
    _id: req.params.id,
    examType,
    examinationLevel: 1,
    isActive: true,
  }).lean();

  if (!student) throw new ApiError(404, "Level 1 registration not found");
  if (student.isVerified || student.verificationStatus === "Verified") {
    throw new ApiError(403, "Verified registrations cannot be edited");
  }

  const responseStudent = { ...student };
  for (const field of ["studentImage", "previousClassResult"]) {
    const key = getStoredFileKey(student[field]);
    if (key) {
      try {
        responseStudent[field] = { ...student[field], previewUrl: await getSignedUrlForSpacesKey(key, 900) };
      } catch { /* keep stored metadata */ }
    }
  }

  res.json(new ApiResponse(200, responseStudent, "All-registration record fetched successfully"));
});

export const updateAllRegistrationStudent = asyncHandler(async (req, res) => {
  const examType = getExam(req.body.examType || req.query.examType).code;
  await requireAllRegistrationDashboardAccess(req, examType);

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, "Invalid student ID");

  const current = await Student.findOne({
    _id: req.params.id,
    examType,
    examinationLevel: 1,
    isActive: true,
  });

  if (!current) throw new ApiError(404, "Level 1 registration not found");
  if (current.isVerified || current.verificationStatus === "Verified") {
    throw new ApiError(403, "Verified registrations cannot be edited");
  }

  const data = sanitize(
    { ...current.toObject(), ...req.body, studentSrn: current.studentSrn },
    examType
  );
  await validateStudent(data, examType);

  const beforeUpdate = current.toObject();
  const { fileData, oldKeys } = await replaceUploadedFiles(current, req.files || {});
  const newlyUploadedKeys = Object.values(fileData).map((item) => item?.key).filter(Boolean);

  try {
    Object.assign(current, data, fileData);
    current.updatedBy = req.user._id;
    current.isVerified = false;
    current.verificationStatus = "Pending";
    current.verifiedBy = null;
    current.verifiedAt = null;
    current.registrationFormVerificationRemark = null;
    await current.save();
  } catch (error) {
    await deleteOldFiles(newlyUploadedKeys);
    throw error;
  }

  await deleteOldFiles(oldKeys);
  await createStudentUpdateLog({
    student: current,
    before: beforeUpdate,
    updatedBy: req.user._id,
    source: "ALL_REGISTRATIONS",
  });
  res.json(new ApiResponse(200, current, "All-registration record updated successfully"));
});

export const checkStudentBySrn = asyncHandler(async (req, res) => {
  const srn = String(req.params.srn || "").trim();
  const examType = getExam(req.query.examType).code;

  if (!/^\d{10}$/.test(srn)) throw new ApiError(400, "SRN must be exactly 10 digits");

  const student = await Student.findOne({
    studentSrn: srn,
    examType,
    isActive: true,
  }).lean();

  if (!student) {
    return res.json(
      new ApiResponse(200, {
        exists: false,
        registered: false,
        srn,
        examType,
      }, "SRN is available for registration")
    );
  }

  res.json(
    new ApiResponse(200, {
      exists: true,
      registered: true,
      srn,
      examType,
      student,
      canEdit: !student.isVerified,
    }, "Student registration found")
  );
});

export const checkOfficialStudentBySrn = asyncHandler(async (req, res) => {
  const srn = String(req.params.srn || "").trim();
  const examType = getExam(req.query.examType).code;

  if (!/^\d{10}$/.test(srn)) throw new ApiError(400, "SRN must be exactly 10 digits");

  const student = await Student.findOne({ studentSrn: srn, examType, isActive: true }).lean();
  if (!student) {
    return res.json(new ApiResponse(200, { exists: false, registered: false, srn, examType }, "SRN is available for registration"));
  }

  const owned = String(student.isRegisteredBy || "") === String(req.user._id);

  // An unverified registration can be taken over by another official,
  // but only when the student's region is inside the current user's access.
  // The ownership is transferred only when the user actually saves an update.
  if (!owned) {
    if (student.isVerified) {
      return res.json(new ApiResponse(200, {
        exists: true,
        registered: true,
        srn,
        examType,
        canEdit: false,
        takeover: false,
        student: null,
        message: "This SRN is already verified and cannot be taken over by another official."
      }, "SRN is already registered"));
    }

    await ensureStudentInRegion(req.user._id, student);
  }

  const responseStudent = { ...student };
  for (const field of ["studentImage", "previousClassResult"]) {
    const key = getStoredFileKey(student[field]);
    if (key) {
      try {
        responseStudent[field] = { ...student[field], previewUrl: await getSignedUrlForSpacesKey(key, 900) };
      } catch { /* keep stored metadata when preview signing fails */ }
    }
  }

  res.json(new ApiResponse(200, {
    exists: true,
    registered: true,
    srn,
    examType,
    canEdit: true,
    takeover: !owned,
    student: responseStudent,
    message: owned
      ? "Existing registration loaded for editing"
      : "Existing unverified registration loaded. Save the form to assign this registration to your account."
  }, "Official registration found"));
});

export const publicRegisterStudent = asyncHandler(async (req, res) => {
  const student = await createStudent(req.body, {
    examType: req.body.examType,
    files: req.files || {},
  });

  res.status(201).json(
    new ApiResponse(201, studentResponse(student), "Registration submitted successfully")
  );
});

export const getPublicRegistrationStatus = asyncHandler(async (req, res) => {
  const examType = getExam(req.query.examType).code;
  const student = await Student.findOne({
    studentSrn: req.params.srn,
    examType,
    isActive: true,
  }).select("studentSrn slipId examType isVerified verificationStatus registrationFormVerificationRemark").lean();

  if (!student) throw new ApiError(404, "Student registration not found");

  res.json(new ApiResponse(200, {
    ...student,
    canEdit: student.verificationStatus !== "Verified" && !student.isVerified,
  }, "Registration status fetched successfully"));
});

export const getStudentForEdit = asyncHandler(async (req, res) => {
  const examType = getExam(req.query.examType).code;
  const student = await Student.findOne({
    studentSrn: req.params.srn,
    examType,
    isActive: true,
  }).lean();

  if (!student) throw new ApiError(404, "Student registration not found");
  if (student.isVerified || student.verificationStatus === "Verified") {
    throw new ApiError(403, "Verified registrations cannot be edited");
  }

  const responseStudent = { ...student };

  for (const field of ["studentImage", "previousClassResult"]) {
    const key = getStoredFileKey(student[field]);

    if (key) {
      try {
        responseStudent[field] = {
          ...student[field],
          previewUrl: await getSignedUrlForSpacesKey(key, 900),
        };
      } catch (error) {
        console.error(`Unable to generate preview URL for ${field}`, error);
      }
    }
  }

  res.json(new ApiResponse(200, responseStudent, "Student fetched successfully"));
});

export const updatePublicStudent = asyncHandler(async (req, res) => {
  const examType = getExam(req.body.examType || req.query.examType).code;

  const current = await Student.findOne({
    studentSrn: req.params.srn,
    examType,
    isActive: true,
  });

  if (!current) throw new ApiError(404, "Student registration not found");
  if (current.isVerified) throw new ApiError(403, "Verified registrations can only be updated by an official");

  const data = sanitize(
    { ...current.toObject(), ...req.body, studentSrn: req.params.srn },
    examType
  );

  await validateStudent(data, examType);

  const beforeUpdate = current.toObject();
  const { fileData, oldKeys } = await replaceUploadedFiles(current, req.files || {});
  const newlyUploadedKeys = Object.values(fileData)
    .map((item) => item?.key)
    .filter(Boolean);

  try {
    Object.assign(current, data, fileData);
    // Any edit after a rejection/past verification creates a fresh verification cycle.
    current.isVerified = false;
    current.verificationStatus = "Pending";
    current.verifiedBy = null;
    current.verifiedAt = null;
    current.registrationFormVerificationRemark = null;
    await current.save();
  } catch (error) {
    await deleteOldFiles(newlyUploadedKeys);
    throw error;
  }

  await deleteOldFiles(oldKeys);
  await createStudentUpdateLog({
    student: current,
    before: beforeUpdate,
    updatedBy: null,
    source: "PUBLIC",
  });

  res.json(new ApiResponse(200, current, "Registration updated successfully"));
});

export const officialRegisterStudent = asyncHandler(async (req, res) => {
  const payload = sanitize(req.body, req.body.examType);
  await validateStudent(payload, req.body.examType);
  await ensurePayloadInRegion(req.user._id, payload);

  const student = await createStudent(req.body, {
    examType: req.body.examType,
    userId: req.user._id,
    verified: false,
    files: req.files || {},
  });

  res.status(201).json(
    new ApiResponse(201, studentResponse(student), "Student registered successfully and sent for verification")
  );
});

export const listOfficialStudents = asyncHandler(async (req, res) => {
  const {
    examType,
    classOfStudent,
    isVerified,
    search,
    page = 1,
    limit = 25,
  } = req.query;

  const regionFilter = await regionStudentFilter(req.user._id);
  const andFilters = [{ isActive: true, isRegisteredBy: req.user._id }];

  if (regionFilter._id === null) {
    andFilters.push({ _id: null });
  } else if (regionFilter.$or) {
    andFilters.push({ $or: regionFilter.$or });
  }

  if (examType) andFilters.push({ examType: getExam(examType).code });
  if (classOfStudent) andFilters.push({ classOfStudent: Number(classOfStudent) });
  if (req.query.districtId) andFilters.push({ districtId: req.query.districtId });
  if (req.query.blockDistrictId) andFilters.push({ blockDistrictId: req.query.blockDistrictId });
  if (req.query.schoolDistrictId) andFilters.push({ schoolDistrictId: req.query.schoolDistrictId });
  if (isVerified !== undefined) andFilters.push({ isVerified: isVerified === "true" });

  if (search) {
    const regex = { $regex: String(search), $options: "i" };
    andFilters.push({
      $or: [
        { studentSrn: regex },
        { name: regex },
        { slipId: regex },
      ],
    });
  }

  const filter = andFilters.length === 1 ? andFilters[0] : { $and: andFilters };

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const [students, total] = await Promise.all([
    Student.find(filter)
      .populate("districtId", "districtName")
      .populate("blockDistrictId", "blockName")
      .populate("schoolDistrictId", "schoolName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Student.countDocuments(filter),
  ]);

  res.json(
    new ApiResponse(200, {
      students,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    }, "Students fetched successfully")
  );
});

export const getOfficialStudentForEdit = asyncHandler(async (req, res) => {
  const examType = getExam(req.query.examType).code;
  const student = await Student.findOne({
    studentSrn: req.params.srn,
    examType,
    isActive: true,
    isRegisteredBy: req.user._id,
  }).lean();

  if (!student) throw new ApiError(404, "Your registration for this SRN was not found");
  const responseStudent = { ...student };
  for (const field of ["studentImage", "previousClassResult"]) {
    const key = getStoredFileKey(student[field]);
    if (key) {
      try {
        responseStudent[field] = { ...student[field], previewUrl: await getSignedUrlForSpacesKey(key, 900) };
      } catch { /* keep stored metadata */ }
    }
  }

  res.json(new ApiResponse(200, responseStudent, "Official registration fetched successfully"));
});

export const updateOfficialStudent = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, "Invalid student ID");
  }

  const existing = await Student.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Student not found");

  const ownedByCurrentUser =
    String(existing.isRegisteredBy || "") === String(req.user._id);

  if (!ownedByCurrentUser) {
    // Another official's registration may be taken over only while it is
    // still unverified. The region must also be inside the current user's
    // regionAccess.
    if (existing.isVerified) {
      throw new ApiError(
        403,
        "Verified registrations cannot be taken over by another official"
      );
    }

    await ensureStudentInRegion(req.user._id, existing);
  } else {
    await ensureStudentInRegion(req.user._id, existing);
  }

  const allowed = [
    "name",
    "fatherName",
    "motherName",
    "dob",
    "gender",
    "category",
    "aadhar",
    "mobile",
    "whatsapp",
    "houseNumber",
    "cityTownVillage",
    "addressBlock",
    "addressDistrict",
    "addressState",
    "districtId",
    "blockDistrictId",
    "schoolDistrictId",
    "schoolEntry",
    "schoolNameManual",
    "previousClassAnnualExamPercentage",
    "classOfStudent",
    "rollNumber",
    "L1ShortlistOrWaitlist",
    "L2ShortlistOrWaitlist",
    "L3ShortlistOrWaitlist",
    "finalSelection",
  ];

  const update = normalizeObjectIdUpdateFields(Object.fromEntries(
    Object.entries(req.body).filter(([key]) => allowed.includes(key))
  ));

  if (update.districtId || update.blockDistrictId || update.schoolDistrictId || update.schoolEntry) {
    const merged = {
      ...existing.toObject(),
      ...update,
      studentSrn: existing.studentSrn,
      classOfStudent: existing.classOfStudent,
    };

    await validateStudent(merged, existing.examType);
    await ensurePayloadInRegion(req.user._id, merged);
  } else {
    // Validate the existing location as well, so an owner cannot move a
    // registration outside the regionAccess assigned to the account.
    await ensurePayloadInRegion(req.user._id, {
      districtId: existing.districtId,
      blockDistrictId: existing.blockDistrictId,
      schoolDistrictId: existing.schoolDistrictId,
      schoolEntry: existing.schoolEntry,
    });
  }

  const beforeUpdate = existing.toObject();
  const { fileData, oldKeys } = await replaceUploadedFiles(existing, req.files || {});
  const newlyUploadedKeys = Object.values(fileData)
    .map((item) => item?.key)
    .filter(Boolean);

  let student;
  try {
    student = await Student.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...update,
          ...fileData,
          // Saving an edited registration always starts a fresh verification cycle.
          isVerified: false,
          verificationStatus: "Pending",
          verifiedBy: null,
          verifiedAt: null,
          registrationFormVerificationRemark: null,
          updatedBy: req.user._id,
          // If another official opened an unverified registration and
          // actually saved changes, ownership moves to the current user.
          isRegisteredBy: req.user._id,
        },
      },
      { new: true, runValidators: true }
    );
  } catch (error) {
    await deleteOldFiles(newlyUploadedKeys);
    throw error;
  }

  await deleteOldFiles(oldKeys);
  await createStudentUpdateLog({
    student,
    before: beforeUpdate,
    updatedBy: req.user._id,
    source: "OFFICIAL",
  });

  res.json(new ApiResponse(200, student, "Student updated successfully"));
});

export const deleteOfficialStudent = asyncHandler(async (req, res) => {
  const existing = await Student.findById(req.params.id);
  if (!existing) throw new ApiError(404, "Student not found");

  await ensureStudentInRegion(req.user._id, existing);

  const student = await Student.findByIdAndUpdate(
    req.params.id,
    { $set: { isActive: false } },
    { new: true }
  );

  res.json(new ApiResponse(200, student, "Student deleted successfully"));
});


const getVerificationPermission = async (userId, examType, districtId) => {
  const permission = await VerificationUser.findOne({
    userId,
    isActive: true,
    examType,
    region: districtId,
  }).lean();

  if (!permission) {
    throw new ApiError(403, "You are not authorized to verify this examination/region");
  }
  return permission;
};

const getVerificationAccess = async (userId, examType = null) => {
  const query = { userId, isActive: true };
  if (examType) query.examType = examType;
  const permissions = await VerificationUser.find(query).lean();
  if (!permissions.length) throw new ApiError(403, "You are not authorized for verification");
  return permissions;
};

const getVerificationRegionIds = (permissions) => [
  ...new Set(permissions.flatMap((permission) => (permission.region || []).map(String))),
];

const getVerificationExamTypes = (permissions) => [
  ...new Set(permissions.flatMap((permission) => permission.examType || [])),
];

const buildVerificationSearch = async (search, allowedDistrictIds) => {
  if (!search?.trim()) return null;
  const value = search.trim();
  const regex = { $regex: value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

  const [districts, blocks, schools] = await Promise.all([
    District.find({ _id: { $in: allowedDistrictIds }, districtName: regex, isActive: true }).select("_id").lean(),
    Block.find({ districtId: { $in: allowedDistrictIds }, blockName: regex, isActive: true }).select("_id").lean(),
    School.find({ districtId: { $in: allowedDistrictIds }, schoolName: regex, isActive: true }).select("_id").lean(),
  ]);

  return {
    $or: [
      { studentSrn: regex },
      { name: regex },
      { districtId: { $in: districts.map((item) => item._id) } },
      { blockDistrictId: { $in: blocks.map((item) => item._id) } },
      { schoolDistrictId: { $in: schools.map((item) => item._id) } },
    ],
  };
};

export const verifyStudent = asyncHandler(async (req, res) => {
  const status = String(req.body.status || "").trim().toLowerCase();
  const remark = String(req.body.remark || "").trim();

  if (!["verified", "rejected"].includes(status)) {
    throw new ApiError(400, "Status must be Verified or Rejected");
  }
  if (status === "rejected" && !remark) {
    throw new ApiError(400, "Remark is mandatory when rejecting a registration");
  }

  const existing = await Student.findById(req.params.id);
  if (!existing || !existing.isActive) throw new ApiError(404, "Student not found");

  const examType = getExam(existing.examType).code;
  await getVerificationPermission(req.user._id, examType, existing.districtId);

  if (existing.verificationStatus !== "Pending") {
    throw new ApiError(409, "Only Pending registrations can be verified or rejected");
  }

  const student = await Student.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        isVerified: status === "verified",
        verificationStatus: status === "verified" ? "Verified" : "Rejected",
        verifiedBy: req.user._id,
        verifiedAt: new Date(),
        registrationFormVerificationRemark: remark || null,
      },
    },
    { new: true, runValidators: true }
  );

  res.json(new ApiResponse(
    200,
    student,
    `Student ${status === "verified" ? "verified" : "rejected"} successfully`
  ));
});

export const verificationFilters = asyncHandler(async (req, res) => {
  const examType = getExam(req.query.examType).code;
  const permissions = await getVerificationAccess(req.user._id, examType);
  const districtIds = getVerificationRegionIds(permissions);

  const [districts, blocks, schools] = await Promise.all([
    District.find({ _id: { $in: districtIds }, isActive: true })
      .select("_id districtName")
      .sort({ districtName: 1 })
      .lean(),
    Block.find({ districtId: { $in: districtIds }, isActive: true })
      .select("_id districtId blockName")
      .sort({ blockName: 1 })
      .lean(),
    School.find({ districtId: { $in: districtIds }, isActive: true })
      .select("_id districtId blockId schoolName")
      .sort({ schoolName: 1 })
      .lean(),
  ]);

  res.json(new ApiResponse(200, { districts, blocks, schools }, "Verification filters fetched successfully"));
});

export const verificationSummary = asyncHandler(async (req, res) => {
  const requestedExam = req.query.examType ? getExam(req.query.examType).code : null;
  const permissions = await getVerificationAccess(req.user._id, requestedExam);
  const examTypes = requestedExam ? [requestedExam] : getVerificationExamTypes(permissions);
  const districtIds = getVerificationRegionIds(permissions);

  const base = {
    isActive: true,
    examType: { $in: examTypes },
    districtId: { $in: districtIds },
  };

  const [pending, verified, rejected] = await Promise.all([
    Student.countDocuments({ ...base, verificationStatus: "Pending" }),
    Student.countDocuments({ ...base, verificationStatus: "Verified", verifiedBy: req.user._id }),
    Student.countDocuments({ ...base, verificationStatus: "Rejected", verifiedBy: req.user._id }),
  ]);

  res.json(new ApiResponse(200, { pending, verified, rejected }, "Verification summary fetched successfully"));
});

export const verificationStudents = asyncHandler(async (req, res) => {
  const examType = getExam(req.query.examType).code;
  const permissions = await getVerificationAccess(req.user._id, examType);
  const allowedDistrictIds = getVerificationRegionIds(permissions);

  const filter = {
    isActive: true,
    examType,
    districtId: { $in: allowedDistrictIds },
  };

  const status = String(req.query.status || "Pending");
  if (["Pending", "Rejected", "Verified"].includes(status)) {
    filter.verificationStatus = status;
  }
  if (status === "Verified") filter.verifiedBy = req.user._id;
  if (status === "Rejected") filter.verifiedBy = req.user._id;

  if (req.query.districtId) {
    if (!allowedDistrictIds.includes(String(req.query.districtId))) {
      throw new ApiError(403, "You do not have verification access to this district");
    }
    filter.districtId = req.query.districtId;
  }

  if (req.query.blockDistrictId) {
    const block = await Block.findOne({
      _id: req.query.blockDistrictId,
      districtId: { $in: allowedDistrictIds },
      isActive: true,
    }).select("_id districtId").lean();
    if (!block) throw new ApiError(403, "You do not have verification access to this block");
    filter.blockDistrictId = block._id;
    if (req.query.districtId && String(block.districtId) !== String(req.query.districtId)) {
      throw new ApiError(400, "Selected block does not belong to selected district");
    }
  }

  if (req.query.schoolDistrictId) {
    const school = await School.findOne({
      _id: req.query.schoolDistrictId,
      districtId: { $in: allowedDistrictIds },
      isActive: true,
    }).select("_id districtId blockId").lean();
    if (!school) throw new ApiError(403, "You do not have verification access to this school");
    filter.schoolDistrictId = school._id;
    if (req.query.districtId && String(school.districtId) !== String(req.query.districtId)) {
      throw new ApiError(400, "Selected school does not belong to selected district");
    }
    if (req.query.blockDistrictId && String(school.blockId) !== String(req.query.blockDistrictId)) {
      throw new ApiError(400, "Selected school does not belong to selected block");
    }
  }

  const searchFilter = await buildVerificationSearch(req.query.search, allowedDistrictIds);
  if (searchFilter) filter.$or = searchFilter.$or;

  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const students = await Student.find(filter)
    .populate("districtId", "districtName")
    .populate("blockDistrictId", "blockName")
    .populate("schoolDistrictId", "schoolName")
    .populate("isRegisteredBy", "name contact")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  for (const student of students) {
    const key = getStoredFileKey(student.studentImage);
    if (key) {
      try {
        student.studentImage = {
          ...student.studentImage,
          previewUrl: await getSignedUrlForSpacesKey(key, 900),
        };
      } catch {
        // Keep stored metadata when preview signing is unavailable.
      }
    }
  }

  res.json(new ApiResponse(200, { students }, "Verification registrations fetched successfully"));
});

export const dashboard = asyncHandler(async (req, res) => {
  const match = {
    isActive: true,
    isRegisteredBy: req.user._id,
    ...(await regionStudentFilter(req.user._id)),
  };

  const [summary, byExamType, byClass] = await Promise.all([
    Student.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          verified: { $sum: { $cond: [{ $eq: ["$verificationStatus", "Verified"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$verificationStatus", "Pending"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$verificationStatus", "Rejected"] }, 1, 0] } },
        },
      },
    ]),
    Student.aggregate([
      { $match: match },
      { $group: { _id: "$examType", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Student.aggregate([
      { $match: match },
      { $group: { _id: "$classOfStudent", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.json(
    new ApiResponse(200, {
      summary: summary[0] || { total: 0, verified: 0, pending: 0, rejected: 0 },
      byExamType,
      byClass,
    }, "Registration dashboard fetched successfully")
  );
});

export const publicLevel1DistrictBlockDashboard = asyncHandler(async (req, res) => {
  const examType = getExam(req.params.examType).code;

  const [districts, blocks, registrationCounts] = await Promise.all([
    District.find({ isActive: true }).select("districtName districtId").sort({ districtName: 1 }).lean(),
    Block.find({ isActive: true }).select("districtId blockName blockId").sort({ blockName: 1 }).lean(),
    Student.aggregate([
      {
        $match: {
          isActive: true,
          examinationLevel: 1,
          examType,
          districtId: { $ne: null },
          blockDistrictId: { $ne: null },
        },
      },
      { $group: { _id: { districtId: "$districtId", blockId: "$blockDistrictId" }, count: { $sum: 1 } } },
    ]),
  ]);

  const counts = new Map(
    registrationCounts.map((item) => [
      `${String(item._id.districtId)}:${String(item._id.blockId)}`,
      item.count,
    ])
  );

  const blockRowsByDistrict = new Map();
  for (const block of blocks) {
    const districtKey = String(block.districtId);
    const row = {
      _id: block._id,
      blockName: block.blockName,
      count: counts.get(`${districtKey}:${String(block._id)}`) || 0,
    };
    if (!blockRowsByDistrict.has(districtKey)) blockRowsByDistrict.set(districtKey, []);
    blockRowsByDistrict.get(districtKey).push(row);
  }

  const result = districts.map((district) => {
    const districtKey = String(district._id);
    const districtBlocks = (blockRowsByDistrict.get(districtKey) || [])
      .sort((a, b) => b.count - a.count || a.blockName.localeCompare(b.blockName));
    const total = districtBlocks.reduce((sum, block) => sum + block.count, 0);

    return {
      _id: district._id,
      districtName: district.districtName,
      count: total,
      blocks: districtBlocks,
    };
  }).sort((a, b) => b.count - a.count || a.districtName.localeCompare(b.districtName));

  res.json(new ApiResponse(200, {
    examType,
    totalRegistrations: result.reduce((sum, district) => sum + district.count, 0),
    districts: result,
  }, "Level 1 district-block dashboard fetched successfully"));
});

export const publicLevel1BlockSchoolDashboard = asyncHandler(async (req, res) => {
  const examType = getExam(req.params.examType).code;

  const [blocks, schoolCounts] = await Promise.all([
    Block.find({ isActive: true }).select("districtId blockName blockId").sort({ blockName: 1 }).lean(),
    Student.aggregate([
      {
        $match: {
          isActive: true,
          examinationLevel: 1,
          examType,
          blockDistrictId: { $ne: null },
          schoolDistrictId: { $ne: null },
        },
      },
      {
        $group: {
          _id: { blockId: "$blockDistrictId", schoolId: "$schoolDistrictId" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const counts = new Map(
    schoolCounts.map((item) => [
      `${String(item._id.blockId)}:${String(item._id.schoolId)}`,
      item.count,
    ])
  );

  const schools = await School.find({ isActive: true }).select("schoolName blockId districtId").lean();
  const schoolMap = new Map(schools.map((school) => [String(school._id), school]));

  const rows = blocks.map((block) => {
    const blockSchools = schools
      .filter((school) => String(school.blockId) === String(block._id))
      .map((school) => ({
        _id: school._id,
        schoolName: school.schoolName,
        count: counts.get(`${String(block._id)}:${String(school._id)}`) || 0,
      }))
      .sort((a, b) => b.count - a.count || a.schoolName.localeCompare(b.schoolName));

    const count = blockSchools.reduce((sum, school) => sum + school.count, 0);
    return {
      _id: block._id,
      districtId: block.districtId,
      blockName: block.blockName,
      count,
      schools: blockSchools,
    };
  }).sort((a, b) => b.count - a.count || a.blockName.localeCompare(b.blockName));

  // Keep blocks that have no school registrations visible, including blocks whose
  // schools are not represented in the registration aggregation.
  res.json(new ApiResponse(200, {
    examType,
    totalRegistrations: rows.reduce((sum, block) => sum + block.count, 0),
    blocks: rows,
  }, "Level 1 block-school dashboard fetched successfully"));
});


const requireDashboardExportAccess = async (req, examType, view) => {
  const code = `${examType}_${view === "district-block" ? "DISTRICT_BLOCK" : "BLOCK_SCHOOL"}`;
  if (!(await hasEffectiveDashboardAccess(req.user, code))) {
    throw new ApiError(403, "You do not have export access for this dashboard");
  }
};

export const exportPublicLevel1Dashboard = asyncHandler(async (req, res) => {
  const examType = getExam(req.params.examType).code;
  const view = String(req.query.view || "district-block");
  if (!["district-block", "block-school"].includes(view)) {
    throw new ApiError(400, "Invalid dashboard export type");
  }

  await requireDashboardExportAccess(req, examType, view);

  let rows = [];
  let filename = "";

  if (view === "district-block") {
    const [districts, blocks, registrationCounts] = await Promise.all([
      District.find({ isActive: true }).select("districtName").sort({ districtName: 1 }).lean(),
      Block.find({ isActive: true }).select("districtId blockName").sort({ blockName: 1 }).lean(),
      Student.aggregate([
        { $match: { isActive: true, examinationLevel: 1, examType, districtId: { $ne: null }, blockDistrictId: { $ne: null } } },
        { $group: { _id: { districtId: "$districtId", blockId: "$blockDistrictId" }, count: { $sum: 1 } } },
      ]),
    ]);

    const counts = new Map(
      registrationCounts.map((item) => [`${String(item._id.districtId)}:${String(item._id.blockId)}`, item.count])
    );

    const districtMap = new Map(districts.map((d) => [String(d._id), d.districtName]));
    rows = blocks.map((block) => ({
      District: districtMap.get(String(block.districtId)) || "-",
      Block: block.blockName,
      Count: counts.get(`${String(block.districtId)}:${String(block._id)}`) || 0,
    })).sort((a, b) => b.Count - a.Count || a.District.localeCompare(b.District) || a.Block.localeCompare(b.Block))
      .map((row, index) => ({ "#": index + 1, ...row }));

    filename = `${examType}_district_block_report.xlsx`;
  } else {
    const [blocks, schools, schoolCounts] = await Promise.all([
      Block.find({ isActive: true }).select("districtId blockName").lean(),
      School.find({ isActive: true }).select("districtId blockId schoolName").lean(),
      Student.aggregate([
        { $match: { isActive: true, examinationLevel: 1, examType, blockDistrictId: { $ne: null }, schoolDistrictId: { $ne: null } } },
        { $group: { _id: { blockId: "$blockDistrictId", schoolId: "$schoolDistrictId" }, count: { $sum: 1 } } },
      ]),
    ]);

    const districtIds = [...new Set(blocks.map((b) => String(b.districtId)).filter(Boolean))];
    const districts = await District.find({ _id: { $in: districtIds } }).select("districtName").lean();
    const districtMap = new Map(districts.map((d) => [String(d._id), d.districtName]));
    const counts = new Map(
      schoolCounts.map((item) => [`${String(item._id.blockId)}:${String(item._id.schoolId)}`, item.count])
    );
    const blockMap = new Map(blocks.map((b) => [String(b._id), b]));

    rows = schools.map((school) => {
      const block = blockMap.get(String(school.blockId));
      return {
        District: districtMap.get(String(school.districtId)) || "-",
        Block: block?.blockName || "-",
        School: school.schoolName,
        Count: counts.get(`${String(school.blockId)}:${String(school._id)}`) || 0,
      };
    }).sort((a, b) => b.Count - a.Count || a.District.localeCompare(b.District) || a.Block.localeCompare(b.Block) || a.School.localeCompare(b.School))
      .map((row, index) => ({ "#": index + 1, ...row }));

    filename = `${examType}_block_school_report.xlsx`;
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  worksheet["!cols"] = Object.keys(rows[0] || {}).map((key) => ({ wch: Math.max(8, key.length + 4) }));
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(buffer.length));
  res.send(buffer);
});

export const publicLevel1SchoolDashboard = asyncHandler(async (req, res) => {
  const examType = getExam(req.params.examType).code;
  const { districtId, blockId, schoolId } = req.query;

  const districts = await District.find({ isActive: true }).select("districtName").sort({ districtName: 1 }).lean();

  if (!districtId || !blockId || !schoolId) {
    return res.json(new ApiResponse(200, {
      examType,
      districts,
      selected: null,
      students: [],
      total: 0,
    }, "Select district, block and school to view registrations"));
  }

  const school = await School.findOne({
    _id: schoolId,
    districtId,
    blockId,
    isActive: true,
  }).lean();

  if (!school) throw new ApiError(400, "Selected school does not belong to the selected district and block");

  const [district, block, students] = await Promise.all([
    District.findOne({ _id: districtId, isActive: true }).select("districtName").lean(),
    Block.findOne({ _id: blockId, districtId, isActive: true }).select("blockName").lean(),
    Student.find({
      isActive: true,
      examinationLevel: 1,
      examType,
      districtId,
      blockDistrictId: blockId,
      schoolDistrictId: schoolId,
    })
      .select("studentSrn name fatherName studentImage districtId blockDistrictId schoolDistrictId")
      .sort({ name: 1, studentSrn: 1 })
      .limit(5000)
      .lean(),
  ]);

  const output = [];
  for (const student of students) {
    const key = getStoredFileKey(student.studentImage);
    let previewUrl = student.studentImage?.url || null;
    if (key) {
      try {
        previewUrl = await getSignedUrlForSpacesKey(key, 900);
      } catch (error) {
        console.error("Unable to sign public dashboard student image", error);
      }
    }

    output.push({
      _id: student._id,
      studentSrn: student.studentSrn,
      name: student.name,
      fatherName: student.fatherName,
      districtName: district?.districtName || "-",
      blockName: block?.blockName || "-",
      schoolName: school.schoolName,
      studentImage: previewUrl,
    });
  }

  res.json(new ApiResponse(200, {
    examType,
    selected: {
      districtId,
      blockId,
      schoolId,
      districtName: district?.districtName || "-",
      blockName: block?.blockName || "-",
      schoolName: school.schoolName,
    },
    students: output,
    total: output.length,
  }, "Level 1 school dashboard fetched successfully"));
});

export const downloadAcknowledgement = asyncHandler(async (req, res) => {
  const student = await Student.findOne({
    slipId: req.params.slipId,
    isActive: true,
  }).lean();

  if (!student) throw new ApiError(404, "Acknowledgement slip not found");

  const exam = getExam(student.examType);
  const [district, block, school] = await Promise.all([
    student.districtId ? District.findById(student.districtId).lean() : null,
    student.blockDistrictId ? Block.findById(student.blockDistrictId).lean() : null,
    student.schoolDistrictId ? School.findById(student.schoolDistrictId).lean() : null,
  ]);

  await createL1AcknowledgementSlip({
    student,
    exam,
    district,
    block,
    school,
    res,
    download: String(req.query.download || "") === "1",
  });
});

export const bulkDownloadAcknowledgements = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String).filter(Boolean) : [];
  const examType = req.body?.examType ? getExam(req.body.examType).code : null;
  const allRegistrations = req.body?.allRegistrations === true;
  if (!ids.length) throw new ApiError(400, "Select at least one student");
  if (ids.length > 100) throw new ApiError(400, "You can download a maximum of 100 acknowledgement slips at once");
  if (allRegistrations && !examType) throw new ApiError(400, "examType is required for all-registration downloads");
  if (allRegistrations) await requireAllRegistrationDashboardAccess(req, examType);

  const filter = {
    _id: { $in: ids.filter((id) => mongoose.Types.ObjectId.isValid(id)) },
    isActive: true,
    ...(allRegistrations ? {} : { isRegisteredBy: req.user._id }),
    ...(examType ? { examType } : {}),
  };
  const students = await Student.find(filter).lean();
  if (!students.length) throw new ApiError(404, "No selected registrations were found");

  const districtIds = [...new Set(students.map((s) => String(s.districtId)).filter(Boolean))];
  const blockIds = [...new Set(students.map((s) => String(s.blockDistrictId)).filter(Boolean))];
  const schoolIds = [...new Set(students.map((s) => String(s.schoolDistrictId)).filter(Boolean))];
  const [districts, blocks, schools] = await Promise.all([
    District.find({ _id: { $in: districtIds } }).lean(),
    Block.find({ _id: { $in: blockIds } }).lean(),
    School.find({ _id: { $in: schoolIds } }).lean(),
  ]);
  const districtMap = new Map(districts.map((item) => [String(item._id), item]));
  const blockMap = new Map(blocks.map((item) => [String(item._id), item]));
  const schoolMap = new Map(schools.map((item) => [String(item._id), item]));

  const files = [];
  for (const student of students) {
    const exam = getExam(student.examType);
    const pdf = await createL1AcknowledgementSlip({
      student,
      exam,
      district: districtMap.get(String(student.districtId)),
      block: blockMap.get(String(student.blockDistrictId)),
      school: schoolMap.get(String(student.schoolDistrictId)),
    });
    files.push({ name: `${student.studentSrn}_${student.slipId}_ack.pdf`, data: pdf });
  }

  const zip = createZip(files);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="student_acknowledgements.zip"');
  res.setHeader("Content-Length", String(zip.length));
  res.send(zip);
});

export const generateBulkTemplate = asyncHandler(async (req, res) => {
  const {
    districtId,
    blockId,
    schoolDistrictId,
    schoolEntry = "db",
    schoolNameManual = "",
    classOfStudent,
    count = 10,
  } = req.body;

  if (!districtId || !blockId || !classOfStudent) {
    throw new ApiError(400, "District, block and class are required");
  }

  if (!schoolDistrictId) throw new ApiError(400, "School is required");

  const district = await District.findOne({ _id: districtId, isActive: true }).lean();
  const block = await Block.findOne({ _id: blockId, districtId, isActive: true }).lean();
  const school = await School.findOne({
    _id: schoolDistrictId,
    districtId,
    blockId,
    isActive: true,
  }).lean();

  if (!district) throw new ApiError(404, "District not found");
  if (!block) throw new ApiError(404, "Block not found");
  if (!school) throw new ApiError(404, "School not found");

  const payload = {
    districtId: district._id,
    blockDistrictId: block._id,
    schoolDistrictId: school._id,
    schoolEntry: "db",
    schoolNameManual: null,
  };

  await ensurePayloadInRegion(req.user._id, payload);

  const templateColumns = [
    "studentSrn",
    "name",
    "fatherName",
    "dob (dd-mm-yyyy)",
    "gender",
    "category",
    "mobile",
    "houseNumber",
    "addressBlock",
    "addressDistrict",
    "districtName",
    "blockName",
    "schoolName",
    "previousClassAnnualExamPercentage",
    "class",
  ];

  const rows = Array.from(
    { length: Math.min(Math.max(Number(count) || 10, 1), 500) },
    () => ({
      studentSrn: "",
      name: "",
      fatherName: "",
      "dob (dd-mm-yyyy)": "",
      gender: "",
      category: "",
      mobile: "",
      houseNumber: "",
      addressBlock: "",
      addressDistrict: "",
      districtName: district.districtName,
      blockName: block.blockName,
      schoolName: school.schoolName,
      previousClassAnnualExamPercentage: "",
      class: Number(classOfStudent),
    })
  );

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: templateColumns });
  worksheet["!cols"] = templateColumns.map((header) => ({ wch: Math.max(16, header.length + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Student Registrations");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="student-registration-template.xlsx"');
  res.send(buffer);
});

export const bulkRegisterStudents = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "Excel file is required");

  const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const examType = getExam(req.body.examType).code;
  const created = [];
  const updated = [];
  const errors = [];
  // Avoid resolving the same district/block/school combination repeatedly
  // when a template contains many students from the same school.
  const regionCache = new Map();

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const row = rows[index];
      const resolvedRow = await resolveBulkRegion(row, regionCache);
      const payload = sanitize(resolvedRow, examType, { bulk: true });
      await validateStudent(payload, examType, { bulk: true });
      await ensurePayloadInRegion(req.user._id, payload);

      const existing = await Student.findOne({
        studentSrn: payload.studentSrn,
        examType,
        isActive: true,
      });

      if (existing) {
        if (String(existing.isRegisteredBy || "") !== String(req.user._id)) {
          throw new ApiError(409, "This SRN is already registered by another user and cannot be updated from bulk upload");
        }
        if (existing.isVerified) {
          throw new ApiError(409, "This registration is already verified and cannot be updated from bulk upload");
        }

        const beforeUpdate = existing.toObject();
        const merged = { ...beforeUpdate, ...payload, examType };
        await validateStudent(merged, examType, { bulk: true });
        const updatedStudent = await Student.findByIdAndUpdate(existing._id, {
          $set: {
            ...payload,
            updatedBy: req.user._id,
            isRegisteredBy: req.user._id,
            isBulkRegistered: true,
            // Bulk registrations are considered genuine and therefore bypass
            // the manual verification workflow. This applies ONLY to bulk uploads.
            isVerified: true,
            verificationStatus: "Verified",
            verifiedBy: null,
            verifiedAt: new Date(),
            registrationFormVerificationRemark: BULK_VERIFICATION_REMARK,
          },
        }, { new: true, runValidators: true });
        await createStudentUpdateLog({
          student: updatedStudent,
          before: beforeUpdate,
          updatedBy: req.user._id,
          source: "BULK",
        });
        updated.push({ row: index + 2, id: existing._id, slipId: existing.slipId });
        continue;
      }

      // IMPORTANT: createStudent must receive the RESOLVED row, not the raw
      // Excel row. The raw row contains districtName/blockName/schoolName;
      // resolvedRow contains the Mongo ObjectIds generated by the backend.
      const student = await createStudent(resolvedRow, {
        examType,
        userId: req.user._id,
        isBulkRegistered: true,
        verified: true,
        verifiedByUserId: null,
        verificationRemark: BULK_VERIFICATION_REMARK,
      });
      created.push({ row: index + 2, id: student._id, slipId: student.slipId });
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
    }
  }

  res.status(201).json(
    new ApiResponse(201, {
      created,
      updated,
      errors,
      totalRows: rows.length,
    }, "Bulk registration processed")
  );
});
