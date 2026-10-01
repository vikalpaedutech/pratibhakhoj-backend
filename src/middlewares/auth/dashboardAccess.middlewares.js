import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { hasEffectiveDashboardAccess } from "../../services/portal/dashboardAccess.services.js";

const getDashboardCode = (examType, view) => {
  const exam = String(examType || "").toUpperCase();
  const normalizedView = String(view || "district-block").toLowerCase();
  const suffix = {
    "district-block": "DISTRICT_BLOCK",
    "block-school": "BLOCK_SCHOOL",
    school: "SCHOOL",
  }[normalizedView];
  return suffix ? `${exam}_${suffix}` : null;
};

export const requireLevel1DashboardAccess = asyncHandler(async (req, _res, next) => {
  if (!req.user) return next();
  const code = getDashboardCode(req.params.examType, req.dashboardView || req.query.view);
  if (!code) throw new ApiError(400, "Invalid Level 1 dashboard");
  if (!(await hasEffectiveDashboardAccess(req.user, code))) {
    throw new ApiError(403, "You do not have access to this Level 1 dashboard");
  }
  next();
});

export const setDashboardView = (view) => (req, _res, next) => {
  req.dashboardView = view;
  next();
};
