import { Router } from "express";
import {
  listVerificationUsers,
  listVerificationCandidates,
  createVerificationUser,
  removeVerificationUser,
} from "../../controllers/portal/verificationUser.controllers.js";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/auth/admin.middlewares.js";

const router = Router();
router.get("/candidates", verifyJWT, requireAdmin, listVerificationCandidates);
router.get("/", verifyJWT, requireAdmin, listVerificationUsers);
router.post("/", verifyJWT, requireAdmin, createVerificationUser);
router.delete("/:id", verifyJWT, requireAdmin, removeVerificationUser);
export default router;
