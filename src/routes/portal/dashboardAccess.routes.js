import { Router } from "express";
import { getMyDashboardAccess } from "../../controllers/portal/dashboardAccess.controllers.js";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";

const router = Router();
router.use(verifyJWT);
router.get("/me", getMyDashboardAccess);
export default router;
