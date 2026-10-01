import { District } from "../../models/portal/district.models.js";
import { Block } from "../../models/portal/block.models.js";
import { School } from "../../models/portal/school.models.js";
import { UserRegionAccess } from "../../models/portal/userRegionAccess.models.js";
import { ApiResponse } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

const uniqueIds = (values) => [...new Set(values.filter(Boolean).map(String))];

const getAccess = async (userId) => {
  const access = await UserRegionAccess.find({ userId }).lean();

  const blockIds = uniqueIds(
    access.filter((item) => item.scope === "block").map((item) => item.blockId)
  );
  const schoolIds = uniqueIds(
    access.filter((item) => item.scope === "school").map((item) => item.schoolId)
  );

  const [blocks, schools] = await Promise.all([
    blockIds.length
      ? Block.find({ _id: { $in: blockIds }, isActive: true }).select("_id districtId").lean()
      : [],
    schoolIds.length
      ? School.find({ _id: { $in: schoolIds }, isActive: true }).select("_id districtId blockId").lean()
      : [],
  ]);

  const blockMap = new Map(blocks.map((item) => [String(item._id), item]));
  const schoolMap = new Map(schools.map((item) => [String(item._id), item]));

  return access.map((item) => {
    const resolved = { ...item };

    if (item.scope === "block" && item.blockId) {
      const block = blockMap.get(String(item.blockId));
      if (block) {
        resolved.districtId = resolved.districtId || block.districtId;
      }
    }

    if (item.scope === "school" && item.schoolId) {
      const school = schoolMap.get(String(item.schoolId));
      if (school) {
        resolved.districtId = resolved.districtId || school.districtId;
        resolved.blockId = resolved.blockId || school.blockId;
      }
    }

    return resolved;
  });
};

const isGlobal = (access) => access.some((item) => item.scope === "global");

const getAccessibleDistrictFilter = async (access) => {
  if (isGlobal(access)) return { isActive: true };

  const ids = uniqueIds(
    access
      .filter((item) => ["district", "block", "school"].includes(item.scope))
      .map((item) => item.districtId)
  );

  return ids.length
    ? { _id: { $in: ids }, isActive: true }
    : { _id: null };
};

export const getDistricts = asyncHandler(async (req, res) => {
  const filter = req.user
    ? await getAccessibleDistrictFilter(await getAccess(req.user._id))
    : { isActive: true };

  const districts = await District.find(filter)
    .sort({ districtName: 1 })
    .lean();

  res.json(new ApiResponse(200, districts, "Districts fetched successfully"));
});

export const getBlocks = asyncHandler(async (req, res) => {
  const { districtId } = req.query;
  if (!districtId) throw new ApiError(400, "districtId is required");

  const blocks = await Block.find({ districtId, isActive: true })
    .sort({ blockName: 1 })
    .lean();

  res.json(new ApiResponse(200, blocks, "Blocks fetched successfully"));
});

export const getSchools = asyncHandler(async (req, res) => {
  const filter = { isActive: true };

  if (req.query.districtId) filter.districtId = req.query.districtId;
  if (req.query.blockId) filter.blockId = req.query.blockId;

  const schools = await School.find(filter)
    .sort({ schoolName: 1 })
    .lean();

  res.json(new ApiResponse(200, schools, "Schools fetched successfully"));
});

export const getMyRegions = asyncHandler(async (req, res) => {
  const regions = await getAccess(req.user._id);
  res.json(new ApiResponse(200, regions, "User region access fetched successfully"));
});

export const getMyDistricts = asyncHandler(async (req, res) => {
  const access = await getAccess(req.user._id);
  const districts = await District.find(await getAccessibleDistrictFilter(access))
    .sort({ districtName: 1 })
    .lean();

  res.json(new ApiResponse(200, districts, "Accessible districts fetched successfully"));
});

export const getMyBlocks = asyncHandler(async (req, res) => {
  const { districtId } = req.query;
  if (!districtId) throw new ApiError(400, "districtId is required");

  const access = await getAccess(req.user._id);
  if (isGlobal(access)) {
    const blocks = await Block.find({ districtId, isActive: true }).sort({ blockName: 1 }).lean();
    return res.json(new ApiResponse(200, blocks, "Accessible blocks fetched successfully"));
  }

  const districtAllowed = access.some(
    (item) =>
      item.scope === "district" &&
      String(item.districtId) === String(districtId)
  );

  if (districtAllowed) {
    const blocks = await Block.find({ districtId, isActive: true }).sort({ blockName: 1 }).lean();
    return res.json(new ApiResponse(200, blocks, "Accessible blocks fetched successfully"));
  }

  const blockIds = uniqueIds(
    access
      .filter(
        (item) =>
          item.scope === "block" &&
          String(item.districtId) === String(districtId)
      )
      .map((item) => item.blockId)
  );

  const schoolIds = uniqueIds(
    access
      .filter(
        (item) =>
          item.scope === "school" &&
          String(item.districtId) === String(districtId)
      )
      .map((item) => item.schoolId)
  );

  if (schoolIds.length) {
    const schoolBlocks = await School.find({
      _id: { $in: schoolIds },
      districtId,
      isActive: true,
    }).distinct("blockId");

    blockIds.push(...schoolBlocks.map(String));
  }

  const blocks = blockIds.length
    ? await Block.find({
        _id: { $in: uniqueIds(blockIds) },
        districtId,
        isActive: true,
      }).sort({ blockName: 1 }).lean()
    : [];

  res.json(new ApiResponse(200, blocks, "Accessible blocks fetched successfully"));
});

export const getMySchools = asyncHandler(async (req, res) => {
  const { districtId, blockId } = req.query;
  if (!districtId || !blockId) {
    throw new ApiError(400, "districtId and blockId are required");
  }

  const access = await getAccess(req.user._id);
  if (isGlobal(access)) {
    const schools = await School.find({
      districtId,
      blockId,
      isActive: true,
    }).sort({ schoolName: 1 }).lean();
    return res.json(new ApiResponse(200, schools, "Accessible schools fetched successfully"));
  }

  const districtAllowed = access.some(
    (item) =>
      item.scope === "district" &&
      String(item.districtId) === String(districtId)
  );

  if (districtAllowed) {
    const schools = await School.find({
      districtId,
      blockId,
      isActive: true,
    }).sort({ schoolName: 1 }).lean();
    return res.json(new ApiResponse(200, schools, "Accessible schools fetched successfully"));
  }

  const blockAllowed = access.some(
    (item) =>
      item.scope === "block" &&
      String(item.districtId) === String(districtId) &&
      String(item.blockId) === String(blockId)
  );

  if (blockAllowed) {
    const schools = await School.find({
      districtId,
      blockId,
      isActive: true,
    }).sort({ schoolName: 1 }).lean();
    return res.json(new ApiResponse(200, schools, "Accessible schools fetched successfully"));
  }

  const schoolIds = uniqueIds(
    access
      .filter(
        (item) =>
          item.scope === "school" &&
          String(item.districtId) === String(districtId) &&
          String(item.blockId) === String(blockId)
      )
      .map((item) => item.schoolId)
  );

  const schools = schoolIds.length
    ? await School.find({
        _id: { $in: schoolIds },
        districtId,
        blockId,
        isActive: true,
      }).sort({ schoolName: 1 }).lean()
    : [];

  res.json(new ApiResponse(200, schools, "Accessible schools fetched successfully"));
});
