import { Router } from "express";
import {
  getRegistrationRoles,
  registerUser,
  resendOtp,
  verifyOtp,
  createPassword,
  loginUser,
  currentUser,
  logoutUser,
} from "../../controllers/portal/auth.controllers.js";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";

const router = Router();

router.get("/roles", getRegistrationRoles);
router.post("/register", registerUser);
router.post("/resend-otp", resendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/create-password", createPassword);
router.post("/login", loginUser);
router.get("/current-user", verifyJWT, currentUser);
router.post("/logout", verifyJWT, logoutUser);

export default router;
