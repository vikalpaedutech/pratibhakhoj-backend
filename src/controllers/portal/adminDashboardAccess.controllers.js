import { User } from "../../models/portal/user.models.js";
import { Role } from "../../models/portal/role.models.js";
import { UserDashboardAccess, DASHBOARD_ACCESS_CODES } from "../../models/portal/userDashboardAccess.models.js";
import { RoleDashboardAccess } from "../../models/portal/roleDashboardAccess.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";

const normalizeDashboards = (value) => {
  const dashboards = Array.isArray(value) ? [...new Set(value.map(String))] : [];
  const invalid = dashboards.filter((code) => !DASHBOARD_ACCESS_CODES.includes(code));
  if (invalid.length) throw new ApiError(400, `Invalid dashboard access: ${invalid.join(", ")}`);
  return dashboards;
};

export const getUserDashboardAccess = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).select("_id name contact roleId").lean();
  if (!user) throw new ApiError(404, "User not found");
  const [access, roleAccess] = await Promise.all([
    UserDashboardAccess.findOne({ userId: user._id }).lean(),
    RoleDashboardAccess.findOne({ roleId: user.roleId }).lean(),
  ]);
  res.json(new ApiResponse(200, {
    user,
    dashboards: access?.dashboards || [],
    roleDashboards: roleAccess?.dashboards || [],
    effectiveDashboards: [...new Set([...(roleAccess?.dashboards || []), ...(access?.dashboards || [])])],
    availableDashboards: DASHBOARD_ACCESS_CODES,
  }, "Dashboard access fetched"));
});

export const replaceUserDashboardAccess = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).select("_id");
  if (!user) throw new ApiError(404, "User not found");
  const dashboards = normalizeDashboards(req.body?.dashboards);
  if (!dashboards.length) await UserDashboardAccess.deleteOne({ userId: user._id });
  else await UserDashboardAccess.findOneAndUpdate({ userId: user._id }, { $set: { dashboards } }, { upsert: true, new: true });
  res.json(new ApiResponse(200, dashboards, "Dashboard access updated"));
});

export const getRoleDashboardAccess = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.roleId).select("_id name code isActive").lean();
  if (!role) throw new ApiError(404, "Role not found");
  const access = await RoleDashboardAccess.findOne({ roleId: role._id }).lean();
  res.json(new ApiResponse(200, { role, dashboards: access?.dashboards || [], availableDashboards: DASHBOARD_ACCESS_CODES }, "Role dashboard access fetched"));
});

export const replaceRoleDashboardAccess = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.roleId).select("_id code").lean();
  if (!role) throw new ApiError(404, "Role not found");
  if (role.code === "ADMIN") throw new ApiError(400, "Admin already has unrestricted dashboard access");
  const dashboards = normalizeDashboards(req.body?.dashboards);
  if (!dashboards.length) await RoleDashboardAccess.deleteOne({ roleId: role._id });
  else await RoleDashboardAccess.findOneAndUpdate({ roleId: role._id }, { $set: { dashboards } }, { upsert: true, new: true });
  res.json(new ApiResponse(200, dashboards, "Role dashboard access updated"));
});
