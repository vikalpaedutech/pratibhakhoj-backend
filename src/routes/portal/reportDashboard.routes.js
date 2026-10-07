import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";
import { requireReportDashboard } from "../../middlewares/auth/reportDashboard.middlewares.js";
import { registrationsByUsers, exportRegistrationsByUsers, verificationByUsers, exportVerificationByUsers, schoolVisitDashboard, exportSchoolVisitDashboard } from "../../controllers/portal/reportDashboard.controllers.js";

const router = Router();
router.use(verifyJWT);
router.get("/registrations-by-users", requireReportDashboard("REGISTRATIONS_BY_USERS"), registrationsByUsers);
router.get("/registrations-by-users/export", requireReportDashboard("REGISTRATIONS_BY_USERS"), exportRegistrationsByUsers);
router.get("/verification-by-users", requireReportDashboard("VERIFICATION_BY_USERS"), verificationByUsers);
router.get("/verification-by-users/export", requireReportDashboard("VERIFICATION_BY_USERS"), exportVerificationByUsers);
router.get("/school-visits", requireReportDashboard("SCHOOL_VISIT_DASHBOARD"), schoolVisitDashboard);
router.get("/school-visits/export", requireReportDashboard("SCHOOL_VISIT_DASHBOARD"), exportSchoolVisitDashboard);
export default router;
