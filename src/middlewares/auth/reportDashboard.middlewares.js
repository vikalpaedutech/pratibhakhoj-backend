import { ApiError } from "../../utils/api-error.js";
import { hasEffectiveDashboardAccess } from "../../services/portal/dashboardAccess.services.js";

export const requireReportDashboard = (code) => async (req, _res, next) => {
  try {
    if (!(await hasEffectiveDashboardAccess(req.user, code))) throw new ApiError(403, "You do not have access to this dashboard");
    next();
  } catch (error) { next(error); }
};
