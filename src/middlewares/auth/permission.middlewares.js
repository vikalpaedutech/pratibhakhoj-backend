import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getEffectivePermissionCodes } from "../../services/portal/permission.service.js";
import { Role } from "../../models/portal/role.models.js";

export const requirePermission = (code) => asyncHandler(async (req, _res, next) => {
  const role = await Role.findById(req.user.roleId).select("code").lean();
  if (role?.code === "ADMIN") return next();
  const permissions = await getEffectivePermissionCodes(req.user._id, req.user.roleId);
  if (!permissions.includes(code)) throw new ApiError(403, "You do not have access to this feature");
  next();
});
