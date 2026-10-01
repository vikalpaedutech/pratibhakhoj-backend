import { Router } from "express";
import { getUserDashboardAccess, replaceUserDashboardAccess, getRoleDashboardAccess, replaceRoleDashboardAccess } from "../../controllers/portal/adminDashboardAccess.controllers.js";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/auth/admin.middlewares.js";

const router = Router();
router.use(verifyJWT, requireAdmin);
router.get("/role/:roleId", getRoleDashboardAccess);
router.put("/role/:roleId", replaceRoleDashboardAccess);
router.get("/:userId", getUserDashboardAccess);
router.put("/:userId", replaceUserDashboardAccess);
export default router;
