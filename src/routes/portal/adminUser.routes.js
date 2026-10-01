import { Router } from "express";
import { listUsers, createUser, listRoles, updateUser } from "../../controllers/portal/adminUser.controllers.js";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/auth/admin.middlewares.js";
const router=Router();
router.use(verifyJWT,requireAdmin);
router.get("/",listUsers); router.post("/",createUser); router.get("/roles",listRoles); router.patch("/:id",updateUser);
export default router;
