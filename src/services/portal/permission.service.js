import { Permission } from "../../models/portal/permission.models.js";
import { UserPermission } from "../../models/portal/userPermission.models.js";
import { RolePermission } from "../../models/portal/rolePermission.models.js";
import { User } from "../../models/portal/user.models.js";

export const getEffectivePermissionContext = async (userId, roleId = null) => {
  const user = roleId ? null : await User.findById(userId).select("roleId").lean();
  const resolvedRoleId = roleId || user?.roleId;

  const [roleRows, userRows] = await Promise.all([
    resolvedRoleId
      ? RolePermission.find({ roleId: resolvedRoleId })
          .populate({ path: "permissionId", match: { isActive: true }, select: "code" })
          .lean()
      : [],
    UserPermission.find({ userId })
      .populate({ path: "permissionId", match: { isActive: true }, select: "code" })
      .lean(),
  ]);

  const effective = new Set();
  const overrides = new Set();

  for (const row of roleRows) {
    const code = row.permissionId?.code;
    if (!code) continue;
    overrides.add(code);
    if (row.isAllowed !== false) effective.add(code);
    else effective.delete(code);
  }

  // User-level assignment has precedence over role-level assignment.
  for (const row of userRows) {
    const code = row.permissionId?.code;
    if (!code) continue;
    overrides.add(code);
    if (row.isAllowed !== false) effective.add(code);
    else effective.delete(code);
  }

  return {
    permissions: [...effective].sort(),
    overrides: [...overrides].sort(),
  };
};

export const getEffectivePermissionCodes = async (userId, roleId = null) => {
  const context = await getEffectivePermissionContext(userId, roleId);
  return context.permissions;
};

export const getPermissionIdsFromCodes = async (codes = []) => {
  const normalized = [
    ...new Set(
      (Array.isArray(codes) ? codes : [])
        .map((code) => String(code).trim().toUpperCase())
        .filter(Boolean)
    ),
  ];

  if (!normalized.length) return { permissions: [], invalid: [] };

  const permissions = await Permission.find({ code: { $in: normalized }, isActive: true })
    .select("_id code name module description")
    .lean();

  const found = new Set(permissions.map((item) => item.code));
  const invalid = normalized.filter((code) => !found.has(code));

  return { permissions, invalid };
};
