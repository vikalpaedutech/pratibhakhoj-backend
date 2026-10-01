import { Router } from "express";
import { getUserAccess,replaceUserAccess } from "../../controllers/portal/adminAccess.controllers.js";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/auth/admin.middlewares.js";
const router=Router();router.use(verifyJWT,requireAdmin);router.get("/:userId",getUserAccess);router.put("/:userId",replaceUserAccess);export default router;
