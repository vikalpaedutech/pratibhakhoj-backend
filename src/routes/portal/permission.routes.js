import { Router } from "express";
import {
  listPermissions,
  getRolePermissions,
  replaceRolePermissions,
  getUserPermissions,
  replaceUserPermissions,
} from "../../controllers/portal/permission.controllers.js";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/auth/admin.middlewares.js";

const router = Router();
router.use(verifyJWT, requireAdmin);
router.get("/", listPermissions);
router.get("/roles/:roleId", getRolePermissions);
router.put("/roles/:roleId", replaceRolePermissions);
router.get("/users/:userId", getUserPermissions);
router.put("/users/:userId", replaceUserPermissions);

export default router;
