import { DASHBOARD_ACCESS_CODES } from "../../models/portal/userDashboardAccess.models.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getEffectiveDashboardAccess } from "../../services/portal/dashboardAccess.services.js";

export const getMyDashboardAccess = asyncHandler(async (req, res) => {
  const access = await getEffectiveDashboardAccess(req.user);
  res.json(new ApiResponse(200, access === null ? DASHBOARD_ACCESS_CODES : access, "Dashboard access fetched"));
});
