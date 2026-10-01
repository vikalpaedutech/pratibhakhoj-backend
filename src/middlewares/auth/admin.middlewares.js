import { Role } from "../../models/portal/role.models.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const requireAdmin = asyncHandler(async (req, _res, next) => {
  const role = await Role.findById(req.user.roleId).lean();

  if (!role || role.code !== "ADMIN") {
    throw new ApiError(403, "Administrator access required");
  }

  next();
});
