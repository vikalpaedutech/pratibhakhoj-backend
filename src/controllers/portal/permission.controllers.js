import { Permission } from "../../models/portal/permission.models.js";
import { UserPermission } from "../../models/portal/userPermission.models.js";
import { RolePermission } from "../../models/portal/rolePermission.models.js";
import { User } from "../../models/portal/user.models.js";
import { Role } from "../../models/portal/role.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getEffectivePermissionCodes, getPermissionIdsFromCodes } from "../../services/portal/permission.service.js";

const normalizeAssignments = (items) => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (typeof item === "string") return { code: item, isAllowed: true };
      return { code: item?.code, isAllowed: item?.isAllowed !== false };
    })
    .filter((item) => item.code);
};

const replaceAssignments = async ({ model, ownerField, ownerId, assignments }) => {
  const result = await getPermissionIdsFromCodes(assignments.map((item) => item.code));

  if (result.invalid.length) {
    throw new ApiError(400, `Invalid permission code(s): ${result.invalid.join(", ")}`);
  }

  await model.deleteMany({ [ownerField]: ownerId });

  if (!assignments.length) return;

  const permissionMap = new Map(result.permissions.map((item) => [item.code, item._id]));
  const unique = new Map();

  for (const item of assignments) {
    const code = String(item.code).trim().toUpperCase();
    const permissionId = permissionMap.get(code);
    if (permissionId) unique.set(String(permissionId), { [ownerField]: ownerId, permissionId, isAllowed: item.isAllowed !== false });
  }

  if (unique.size) await model.insertMany([...unique.values()]);
};

export const listPermissions = asyncHandler(async (_req, res) => {
  const permissions = await Permission.find({ isActive: true }).sort({ module: 1, name: 1 }).lean();
  res.json(new ApiResponse(200, permissions, "Permissions fetched successfully"));
});

export const getRolePermissions = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.roleId).select("_id name code").lean();
  if (!role) throw new ApiError(404, "Role not found");

  const rows = await RolePermission.find({ roleId: role._id }).populate("permissionId", "code name module description").lean();
  res.json(new ApiResponse(200, {
    role,
    permissions: rows.filter((row) => row.permissionId).map((row) => ({ ...row.permissionId, isAllowed: row.isAllowed !== false })),
  }, "Role permissions fetched successfully"));
});

export const replaceRolePermissions = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.roleId).select("_id name code").lean();
  if (!role) throw new ApiError(404, "Role not found");

  const assignments = normalizeAssignments(req.body?.permissions);
  await replaceAssignments({ model: RolePermission, ownerField: "roleId", ownerId: role._id, assignments });

  res.json(new ApiResponse(200, await getEffectivePermissionCodes(null, role._id), "Role permissions updated successfully"));
});

export const getUserPermissions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId)
    .select("_id name contact userId roleId")
    .populate("roleId", "name code")
    .lean();

  if (!user) throw new ApiError(404, "User not found");

  const rows = await UserPermission.find({ userId: user._id })
    .populate("permissionId", "code name module description")
    .lean();

  res.json(new ApiResponse(200, {
    user,
    permissions: rows.filter((row) => row.permissionId).map((row) => ({ ...row.permissionId, isAllowed: row.isAllowed !== false })),
    effectivePermissions: await getEffectivePermissionCodes(user._id, user.roleId?._id || user.roleId),
  }, "User permissions fetched successfully"));
});

export const replaceUserPermissions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).select("_id roleId").lean();
  if (!user) throw new ApiError(404, "User not found");

  const assignments = normalizeAssignments(req.body?.permissions);
  await replaceAssignments({ model: UserPermission, ownerField: "userId", ownerId: user._id, assignments });

  res.json(new ApiResponse(200, await getEffectivePermissionCodes(user._id, user.roleId), "User permissions updated successfully"));
});
