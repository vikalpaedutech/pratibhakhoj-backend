import { ExaminationCenter } from "../../models/portal/examinationCenter.models.js";
import { SchoolPreference } from "../../models/portal/schoolPreference.models.js";
import { District } from "../../models/portal/district.models.js";
import { Block } from "../../models/portal/block.models.js";
import { School } from "../../models/portal/school.models.js";
import { BlockCenterRequirement } from "../../models/portal/blockCenterRequirement.models.js";
import { BlockSchoolCenterPreference } from "../../models/portal/blockSchoolCenterPreference.models.js";
import { UserRegionAccess } from "../../models/portal/userRegionAccess.models.js";
import { Role } from "../../models/portal/role.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";


const assertDistrictRegionAccess = async (req, districtId) => {
  const role = await Role.findById(req.user.roleId).select("code").lean();
  if (role?.code === "ADMIN") return;
  const access = await UserRegionAccess.find({ userId: req.user._id }).lean();
  if (access.some(row => row.scope === "global")) return;
  const allowedDistricts = new Set(access.filter(row => row.scope === "district" && row.districtId).map(row => String(row.districtId)));
  const blockIds = access.filter(row => row.scope === "block" && row.blockId).map(row => row.blockId);
  const schoolIds = access.filter(row => row.scope === "school" && row.schoolId).map(row => row.schoolId);
  const [blockDistricts, schoolDistricts] = await Promise.all([
    blockIds.length ? Block.find({ _id: { $in: blockIds }, isActive: true }).distinct("districtId") : [],
    schoolIds.length ? School.find({ _id: { $in: schoolIds }, isActive: true }).distinct("districtId") : [],
  ]);
  [...blockDistricts, ...schoolDistricts].forEach(id => allowedDistricts.add(String(id)));
  if (!allowedDistricts.has(String(districtId))) throw new ApiError(403, "You do not have access to this district.");
};

const centerPayload = async (body) => {
  const district = await District.findOne({ _id: body.districtId, isActive: true }).lean();
  const block = await Block.findOne({ _id: body.blockId, districtId: body.districtId, isActive: true }).lean();
  if (!district || !block) throw new ApiError(400, "Valid district and block are required");
  const payload = {
    examinationCenter: String(body.examinationCenter || "").trim(),
    examinationCenterCode: String(body.examinationCenterCode || "").trim().toUpperCase(),
    districtName: district.districtName, districtId: district._id,
    blockName: block.blockName, blockId: block._id,
    examinationCenterCapacity: Number(body.examinationCenterCapacity),
    adjustments: null, examType: body.examType || "",
    examLevel: "1", paperCount: null,
  };
  if (!payload.examinationCenter || !payload.examinationCenterCode || !Number.isFinite(payload.examinationCenterCapacity) || payload.examinationCenterCapacity < 1) {
    throw new ApiError(400, "Center name, unique code and capacity (minimum 1) are required");
  }
  return payload;
};

export const listExaminationCenters = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  for (const key of ["districtId", "blockId"]) if (req.query[key]) filter[key] = req.query[key];
  if (req.query.search) filter.$or = ["examinationCenter", "examinationCenterCode"].map((key) => ({ [key]: { $regex: req.query.search, $options: "i" } }));
  const rows = await ExaminationCenter.find(filter).sort({ districtName: 1, blockName: 1, examinationCenter: 1 }).lean();
  res.json(new ApiResponse(200, rows, "Examination centers fetched"));
});

export const createExaminationCenter = asyncHandler(async (req, res) => {
  const row = await ExaminationCenter.create(await centerPayload(req.body));
  res.status(201).json(new ApiResponse(201, row, "Examination center created"));
});

export const bulkCreateExaminationCenters = asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body?.centers) ? req.body.centers : [];
  if (!rows.length) throw new ApiError(400, "centers array is required");
  if (rows.length > 2000) throw new ApiError(400, "Maximum 2000 centers per upload");
  const prepared = [];
  for (let i = 0; i < rows.length; i++) {
    try { prepared.push(await centerPayload(rows[i])); }
    catch (e) { throw new ApiError(400, `Row ${i + 1}: ${e.message}`); }
  }
  const operations = prepared.map((item) => ({
    updateOne: {
      filter: { examinationCenterCode: item.examinationCenterCode },
      update: { $set: item, $setOnInsert: { isActive: true } },
      upsert: true,
    },
  }));
  const result = await ExaminationCenter.bulkWrite(operations, { ordered: true });
  res.status(201).json(new ApiResponse(201, {
    inserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    matched: result.matchedCount || 0,
  }, "Bulk centers imported"));
});

export const updateExaminationCenter = asyncHandler(async (req, res) => {
  const update = await centerPayload(req.body);
  const row = await ExaminationCenter.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  if (!row) throw new ApiError(404, "Examination center not found");
  await SchoolPreference.updateMany({ examinationCenter: row._id }, { $set: { examinationCenterCode: row.examinationCenterCode, examinationCenterName: row.examinationCenter } });
  res.json(new ApiResponse(200, row, "Examination center updated"));
});

export const disableExaminationCenter = asyncHandler(async (req, res) => {
  const row = await ExaminationCenter.findByIdAndUpdate(req.params.id, { $set: { isActive: false } }, { new: true });
  if (!row) throw new ApiError(404, "Examination center not found");
  res.json(new ApiResponse(200, row, "Examination center disabled"));
});

export const listSchoolPreferences = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.districtId) filter["school.districtId"] = req.query.districtId;
  if (req.query.blockId) filter["school.blockId"] = req.query.blockId;
  const rows = await SchoolPreference.find().populate({ path: "schoolId", select: "schoolCode schoolName districtId blockId", populate: [{ path: "districtId", select: "districtName" }, { path: "blockId", select: "blockName" }] }).populate("examinationCenter", "examinationCenter examinationCenterCode").lean();
  const search = String(req.query.search || "").trim().toLowerCase();
  const result = rows.filter((r) => {
    const s = r.schoolId || {};
    if (req.query.districtId && String(s.districtId?._id || s.districtId) !== String(req.query.districtId)) return false;
    if (req.query.blockId && String(s.blockId?._id || s.blockId) !== String(req.query.blockId)) return false;
    if (search && ![r.schoolName, r.schoolCode, s.schoolName, s.schoolCode].some((v) => String(v || "").toLowerCase().includes(search))) return false;
    return true;
  });
  res.json(new ApiResponse(200, result, "School preferences fetched"));
});

export const saveSchoolPreferences = asyncHandler(async (req, res) => {
  const { examinationCenterId, schoolIds, visibleSchoolIds = schoolIds } = req.body || {};
  if (!examinationCenterId || !Array.isArray(schoolIds) || !Array.isArray(visibleSchoolIds)) throw new ApiError(400, "examinationCenterId, schoolIds and visibleSchoolIds are required");
  const center = await ExaminationCenter.findOne({ _id: examinationCenterId, isActive: true }).lean();
  if (!center) throw new ApiError(404, "Examination center not found");
  const schools = await School.find({ _id: { $in: schoolIds }, isActive: true }).lean();
  if (schools.length !== new Set(schoolIds.map(String)).size) throw new ApiError(400, "One or more selected schools are invalid");
  if (visibleSchoolIds.length) {
    await SchoolPreference.deleteMany({ examinationCenter: center._id, schoolId: { $in: visibleSchoolIds, $nin: schoolIds } });
  }
  const ops = schools.map((school) => ({
    updateOne: {
      filter: { schoolId: school._id },
      update: { $set: { schoolId: school._id, schoolCode: school.schoolCode || "", schoolName: school.schoolName, examinationCenter: center._id, examinationCenterCode: center.examinationCenterCode, examinationCenterName: center.examinationCenter } },
      upsert: true,
    },
  }));
  if (ops.length) await SchoolPreference.bulkWrite(ops);
  res.json(new ApiResponse(200, { saved: schools.length, examinationCenter: center }, "School center preferences saved"));
});


export const listBlockCenterRequirements = asyncHandler(async (req, res) => {
  // Query parameters must contain the district's MongoDB ID, never a
  // populated district object (which becomes "[object Object]" in a URL).
  const districtId = String(req.query.districtId || "").trim();
  if (!districtId) throw new ApiError(400, "districtId is required");
  if (!/^[a-f\d]{24}$/i.test(districtId)) {
    throw new ApiError(400, "Invalid districtId. Please select a valid district.");
  }
  const blocks = await Block.find({ districtId, isActive: true }).sort({ blockName: 1 }).lean();
  const requirements = await BlockCenterRequirement.find({ districtId }).lean();
  const byBlock = new Map(requirements.map((r) => [String(r.blockId), r]));
  const rows = await Promise.all(blocks.map(async (block) => {
    const requirement = byBlock.get(String(block._id));
    return {
      blockId: block._id, blockName: block.blockName, districtId,
      numberOfSchools: requirement ? requirement.numberOfSchools : "",
      expectedRegistrationCount8: requirement ? requirement.expectedRegistrationCount8 : "",
      expectedRegistrationCount10: requirement ? requirement.expectedRegistrationCount10 : "",
      totalCentersRequired: requirement ? requirement.totalCentersRequired : "",
      isSubmitted: Boolean(requirement),
    };
  }));
  res.json(new ApiResponse(200, rows, "Block center requirements fetched"));
});

export const saveBlockCenterRequirement = asyncHandler(async (req, res) => {
  const block = await Block.findOne({ _id: req.params.blockId, isActive: true }).populate("districtId", "districtName").lean();
  if (!block) throw new ApiError(404, "Block not found");
  await assertDistrictRegionAccess(req, block.districtId?._id || block.districtId);
  const values = {
    numberOfSchools: Number(req.body.numberOfSchools),
    expectedRegistrationCount8: Number(req.body.expectedRegistrationCount8),
    expectedRegistrationCount10: Number(req.body.expectedRegistrationCount10),
    totalCentersRequired: Number(req.body.totalCentersRequired),
  };
  if (Object.values(values).some((v) => !Number.isInteger(v) || v < 0)) throw new ApiError(400, "All block values must be valid non-negative whole numbers");
  const row = await BlockCenterRequirement.findOneAndUpdate(
    { blockId: block._id },
    { $set: { ...values, blockId: block._id, districtId: block.districtId._id, blockName: block.blockName, districtName: block.districtId.districtName, updatedBy: req.user._id } },
    { upsert: true, new: true, runValidators: true }
  );
  res.json(new ApiResponse(200, row, "Block details saved"));
});

export const listBlockExaminationCenters = asyncHandler(async (req, res) => {
  const block = await Block.findById(req.params.blockId).select("districtId").lean();
  if (!block) throw new ApiError(404, "Block not found");
  await assertDistrictRegionAccess(req, block.districtId);
  const rows = await ExaminationCenter.find({ blockId: req.params.blockId, isActive: true }).sort({ createdAt: 1 }).lean();
  const counts = await SchoolPreference.aggregate([
    { $match: { examinationCenter: { $in: rows.map((r) => r._id) } } },
    { $group: { _id: "$examinationCenter", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((x) => [String(x._id), x.count]));
  const preferenceCounts = await BlockSchoolCenterPreference.aggregate([
    { $match: { $or: [{ preference1: { $in: rows.map(r => r._id) } }, { preference2: { $in: rows.map(r => r._id) } }] } },
    { $project: { schoolId: 1, centers: { $setUnion: [["$preference1", "$preference2"], []] } } },
    { $unwind: "$centers" },
    { $match: { centers: { $in: rows.map(r => r._id) } } },
    { $group: { _id: "$centers", schools: { $addToSet: "$schoolId" } } },
    { $project: { count: { $size: "$schools" } } },
  ]);
  const preferenceCountMap = new Map(preferenceCounts.map(x => [String(x._id), x.count]));
  res.json(new ApiResponse(200, rows.map((r) => ({ ...r, totalPreferredSchools: Math.max(countMap.get(String(r._id)) || 0, preferenceCountMap.get(String(r._id)) || 0) })), "Block examination centers fetched"));
});

const normalizeCenterSchools = async (blockId, schools = []) => {
  if (!Array.isArray(schools)) throw new ApiError(400, "schools must be an array");
  const result = [];
  const ids = schools.filter((x) => !x.isManual && x.schoolId).map((x) => x.schoolId);
  const found = ids.length ? await School.find({ _id: { $in: ids }, blockId, isActive: true }).lean() : [];
  const schoolMap = new Map(found.map((x) => [String(x._id), x]));
  for (let i = 0; i < schools.length; i++) {
    const item = schools[i];
    const count8 = Number(item.expectedRegistrationCount8 || 0);
    const count10 = Number(item.expectedRegistrationCount10 || 0);
    if (!Number.isInteger(count8) || count8 < 0 || !Number.isInteger(count10) || count10 < 0) throw new ApiError(400, `School row ${i + 1}: expected counts must be non-negative whole numbers`);
    if (item.isManual) {
      const schoolName = String(item.schoolName || "").trim();
      const schoolCode = String(item.schoolCode || "").trim();
      if (!schoolName || !schoolCode) throw new ApiError(400, `School row ${i + 1}: manual school name and code are required`);
      result.push({ blockId, schoolName, schoolCode, isManualSchool: true, expectedRegistrationCount8: count8, expectedRegistrationCount10: count10 });
    } else {
      const school = schoolMap.get(String(item.schoolId));
      if (!school) throw new ApiError(400, `School row ${i + 1}: select a valid school from this block`);
      result.push({ blockId, schoolId: school._id, schoolName: school.schoolName, schoolCode: school.schoolCode || "", isManualSchool: false, expectedRegistrationCount8: count8, expectedRegistrationCount10: count10 });
    }
  }
  return result;
};

export const createBlockExaminationCenter = asyncHandler(async (req, res) => {
  const block = await Block.findOne({ _id: req.params.blockId, isActive: true }).populate("districtId", "districtName").lean();
  if (!block) throw new ApiError(404, "Block not found");
  await assertDistrictRegionAccess(req, block.districtId._id);
  const requirement = await BlockCenterRequirement.findOne({ blockId: block._id }).lean();
  if (!requirement) throw new ApiError(400, "Submit block details before creating center preferences");
  const currentCenters = await ExaminationCenter.countDocuments({ blockId: block._id, isActive: true });
  if (currentCenters >= requirement.totalCentersRequired) throw new ApiError(400, `Required center limit reached (${requirement.totalCentersRequired}) for this block`);
  const payload = await centerPayload({ ...req.body, districtId: block.districtId._id, blockId: block._id });
  const schoolRows = await normalizeCenterSchools(block._id, req.body.schools || []);
  const center = await ExaminationCenter.create(payload);
  if (schoolRows.length) await SchoolPreference.insertMany(schoolRows.map((row) => ({ ...row, examinationCenter: center._id, examinationCenterCode: center.examinationCenterCode, examinationCenterName: center.examinationCenter })));
  res.status(201).json(new ApiResponse(201, { ...center.toObject(), totalPreferredSchools: schoolRows.length }, "Center and school preferences created"));
});

export const getCenterSchoolPreferences = asyncHandler(async (req, res) => {
  const center = await ExaminationCenter.findById(req.params.centerId).lean();
  if (!center) throw new ApiError(404, "Examination center not found");
  await assertDistrictRegionAccess(req, center.districtId);
  const schools = await SchoolPreference.find({ examinationCenter: center._id }).populate("schoolId", "schoolName schoolCode").lean();
  res.json(new ApiResponse(200, { center, schools }, "Center school preferences fetched"));
});

export const updateBlockExaminationCenter = asyncHandler(async (req, res) => {
  const center = await ExaminationCenter.findOne({ _id: req.params.centerId, isActive: true }).lean();
  if (!center) throw new ApiError(404, "Examination center not found");
  const block = await Block.findById(center.blockId).populate("districtId", "districtName").lean();
  await assertDistrictRegionAccess(req, block.districtId?._id || block.districtId);
  const payload = await centerPayload({ ...req.body, districtId: block.districtId._id, blockId: block._id });
  const schoolRows = await normalizeCenterSchools(block._id, req.body.schools || []);
  const updated = await ExaminationCenter.findByIdAndUpdate(center._id, { $set: payload }, { new: true, runValidators: true });
  await SchoolPreference.deleteMany({ examinationCenter: center._id });
  if (schoolRows.length) await SchoolPreference.insertMany(schoolRows.map((row) => ({ ...row, examinationCenter: center._id, examinationCenterCode: updated.examinationCenterCode, examinationCenterName: updated.examinationCenter })));
  res.json(new ApiResponse(200, { ...updated.toObject(), totalPreferredSchools: schoolRows.length }, "Center and school preferences updated"));
});


export const removeBlockExaminationCenter = asyncHandler(async (req, res) => {
  const { blockId, centerId } = req.params;
  const center = await ExaminationCenter.findOne({ _id: centerId, blockId, isActive: true });
  if (!center) throw new ApiError(404, "Examination center not found in this block");
  // Clear both preference slots everywhere before deactivating the center.
  // Clear each preference slot independently.
  await BlockSchoolCenterPreference.updateMany({ blockId, preference1: center._id }, { $set: { preference1: null } });
  await BlockSchoolCenterPreference.updateMany({ blockId, preference2: center._id }, { $set: { preference2: null } });
  await SchoolPreference.deleteMany({ examinationCenter: center._id });
  center.isActive = false;
  await center.save();
  res.json(new ApiResponse(200, { centerId: center._id }, "Examination center removed and school preferences cleared"));
});

export const listBlockSchoolCenterPreferences = asyncHandler(async (req, res) => {
  const block = await Block.findOne({ _id: req.params.blockId, isActive: true }).lean();
  if (!block) throw new ApiError(404, "Block not found");
  await assertDistrictRegionAccess(req, block.districtId);
  const [schools, centers, saved] = await Promise.all([
    School.find({ blockId: block._id, isActive: true }).sort({ schoolName: 1 }).lean(),
    ExaminationCenter.find({ blockId: block._id, isActive: true }).sort({ createdAt: 1 }).lean(),
    BlockSchoolCenterPreference.find({ blockId: block._id }).lean(),
  ]);
  const savedMap = new Map(saved.map(row => [String(row.schoolId), row]));
  const rows = schools.map(school => {
    const pref = savedMap.get(String(school._id));
    return { ...school, preference1: pref?.preference1 || "", preference2: pref?.preference2 || "" };
  });
  res.json(new ApiResponse(200, { block, schools: rows, centers }, "Block school preferences fetched"));
});

export const saveBlockSchoolCenterPreference = asyncHandler(async (req, res) => {
  const { preference1 = null, preference2 = null } = req.body || {};
  const block = await Block.findOne({ _id: req.params.blockId, isActive: true }).lean();
  if (!block) throw new ApiError(404, "Block not found");
  await assertDistrictRegionAccess(req, block.districtId);
  const school = await School.findOne({ _id: req.params.schoolId, blockId: block._id, isActive: true }).lean();
  if (!school) throw new ApiError(404, "School not found in this block");
  if (preference1 && preference2 && String(preference1) === String(preference2)) throw new ApiError(400, "Preference 1 and Preference 2 must be different centers");
  const ids = [preference1, preference2].filter(Boolean);
  const centers = ids.length ? await ExaminationCenter.find({ _id: { $in: ids }, blockId: block._id, isActive: true }).lean() : [];
  if (centers.length !== new Set(ids.map(String)).size) throw new ApiError(400, "Select valid examination centers from this block");
  const row = await BlockSchoolCenterPreference.findOneAndUpdate(
    { blockId: block._id, schoolId: school._id },
    { $set: { blockId: block._id, schoolId: school._id, preference1, preference2 } },
    { upsert: true, new: true, runValidators: true }
  );
  res.json(new ApiResponse(200, row, "School preferences saved"));
});
