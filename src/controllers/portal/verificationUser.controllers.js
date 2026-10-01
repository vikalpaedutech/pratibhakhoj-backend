import { VerificationUser } from "../../models/portal/verificationUser.models.js";
import { User } from "../../models/portal/user.models.js";
import { Role } from "../../models/portal/role.models.js";
import { District } from "../../models/portal/district.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";

const validateExam = (items) => {
  if (!Array.isArray(items) || items.some((x) => !["MB", "HS100"].includes(x))) {
    throw new ApiError(400, "examType must contain only MB or HS100");
  }
};


export const listVerificationCandidates = asyncHandler(async (req, res) => {
  const { roleId = "", search = "" } = req.query;
  const userQuery = { isActive: true };
  if (roleId) userQuery.roleId = roleId;

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    const regex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    userQuery.$or = [
      { name: regex },
      { contact: regex },
      { userId: regex },
    ];
  }

  const users = await User.find(userQuery)
    .populate("roleId", "name code")
    .select("name contact userId roleId isActive")
    .sort({ name: 1 })
    .lean();

  const ids = users.map((user) => user._id);
  const assignments = ids.length
    ? await VerificationUser.find({ userId: { $in: ids }, isActive: true })
        .populate("region", "districtName districtId")
        .lean()
    : [];

  const assignmentMap = new Map(assignments.map((row) => [String(row.userId), row]));
  const rows = users.map((user) => ({
    user,
    verificationAccess: assignmentMap.get(String(user._id)) || null,
  }));

  res.json(new ApiResponse(200, rows, "Verification candidates fetched successfully"));
});

export const listVerificationUsers = asyncHandler(async (_req, res) => {
  const rows = await VerificationUser.find({ isActive: true })
    .populate("userId", "name contact roleId isActive isVerified")
    .populate("region", "districtName districtId")
    .sort({ createdAt: -1 })
    .lean();
  res.json(new ApiResponse(200, rows, "Verification users fetched successfully"));
});

export const createVerificationUser = asyncHandler(async (req, res) => {
  const { userId, examType = [], region = [] } = req.body;
  if (!userId) throw new ApiError(400, "userId is required");
  validateExam(examType);
  if (!Array.isArray(region) || !region.length) throw new ApiError(400, "At least one district is required");

  const user = await User.findById(userId);
  if (!user || !user.isActive) throw new ApiError(404, "Active user not found");

  const districts = await District.countDocuments({ _id: { $in: region }, isActive: true });
  if (districts !== region.length) throw new ApiError(400, "One or more districts are invalid");

  const row = await VerificationUser.findOneAndUpdate(
    { userId },
    { $set: { examType: [...new Set(examType)], region: [...new Set(region)], isActive: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json(new ApiResponse(200, row, "Verification user assigned successfully"));
});

export const removeVerificationUser = asyncHandler(async (req, res) => {
  const row = await VerificationUser.findByIdAndUpdate(
    req.params.id, { $set: { isActive: false } }, { new: true }
  );
  if (!row) throw new ApiError(404, "Verification user assignment not found");
  res.json(new ApiResponse(200, row, "Verification access removed successfully"));
});
