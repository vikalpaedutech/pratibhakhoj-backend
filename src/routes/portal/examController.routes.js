import { Router } from "express";
import { publicExamSettings, adminGetExamSettings, updateExamSettings } from "../../controllers/portal/examController.controllers.js";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/auth/admin.middlewares.js";

const router = Router();
router.get("/public", publicExamSettings);
router.get("/admin", verifyJWT, requireAdmin, adminGetExamSettings);
router.put("/admin", verifyJWT, requireAdmin, updateExamSettings);
export default router;
