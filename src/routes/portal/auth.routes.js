import { Router } from "express";
import {
  getRegistrationRoles,
  registerUser,
  resendOtp,
  verifyOtp,
  resendVerificationEmail,
  verifyEmail,
  createPassword,
  loginUser,
  requestPasswordReset,
  resetPassword,
  currentUser,
  logoutUser,
} from "../../controllers/portal/auth.controllers.js";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";

const router = Router();

router.get("/roles", getRegistrationRoles);
router.post("/register", registerUser);
router.post("/resend-otp", resendOtp);
router.post("/resend-verification-email", resendVerificationEmail);
router.post("/verify-otp", verifyOtp);
router.get("/verify-email", verifyEmail);
router.post("/create-password", createPassword);
router.post("/login", loginUser);
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.get("/current-user", verifyJWT, currentUser);
router.post("/logout", verifyJWT, logoutUser);

export default router;
