import { School } from "../../models/portal/school.models.js";
import { District } from "../../models/portal/district.models.js";
import { Block } from "../../models/portal/block.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const listSchools = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.districtId) filter.districtId = req.query.districtId;
  if (req.query.blockId) filter.blockId = req.query.blockId;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive !== "false";

  const schools = await School.find(filter)
    .populate("districtId", "districtName")
    .populate("blockId", "blockName")
    .sort({ schoolName: 1 })
    .lean();

  res.json(new ApiResponse(200, schools, "Schools fetched successfully"));
});

export const createSchool = asyncHandler(async (req, res) => {
  const { schoolCode, schoolName, districtId, blockId } = req.body;

  if (!schoolName || !districtId || !blockId) {
    throw new ApiError(400, "schoolName, districtId and blockId are required");
  }

  const [district, block] = await Promise.all([
    District.exists({ _id: districtId, isActive: true }),
    Block.exists({ _id: blockId, districtId, isActive: true }),
  ]);

  if (!district || !block) {
    throw new ApiError(400, "District/block mapping is invalid");
  }

  const school = await School.create({
    schoolCode: schoolCode?.trim() || null,
    schoolName: schoolName.trim(),
    districtId,
    blockId,
  });

  res.status(201).json(new ApiResponse(201, school, "School created successfully"));
});

export const updateSchool = asyncHandler(async (req, res) => {
  const allowed = ["schoolCode", "schoolName", "districtId", "blockId", "isActive"];
  const update = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => allowed.includes(key))
  );

  const existing = await School.findById(req.params.id);
  if (!existing) throw new ApiError(404, "School not found");

  const districtId = update.districtId || existing.districtId;
  const blockId = update.blockId || existing.blockId;

  if (!(await Block.exists({ _id: blockId, districtId, isActive: true }))) {
    throw new ApiError(400, "District/block mapping is invalid");
  }

  const school = await School.findByIdAndUpdate(
    req.params.id,
    { $set: update },
    { new: true, runValidators: true }
  );

  res.json(new ApiResponse(200, school, "School updated successfully"));
});

export const deleteSchool = asyncHandler(async (req, res) => {
  const school = await School.findByIdAndUpdate(
    req.params.id,
    { $set: { isActive: false } },
    { new: true }
  );

  if (!school) throw new ApiError(404, "School not found");

  res.json(new ApiResponse(200, school, "School disabled successfully"));
});
