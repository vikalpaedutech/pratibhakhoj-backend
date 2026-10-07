import crypto from "crypto";
import jwt from "jsonwebtoken";
import { User } from "../../models/portal/user.models.js";
import { Role } from "../../models/portal/role.models.js";
import { UserRegionAccess } from "../../models/portal/userRegionAccess.models.js";
import { VerificationUser } from "../../models/portal/verificationUser.models.js";
import { DASHBOARD_ACCESS_CODES } from "../../models/portal/userDashboardAccess.models.js";
import { getEffectiveDashboardAccess } from "../../services/portal/dashboardAccess.services.js";
import { District } from "../../models/portal/district.models.js";
import { Block } from "../../models/portal/block.models.js";
import { School } from "../../models/portal/school.models.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { hashOtp } from "../../utils/portal.utils.js";
import { getEffectivePermissionCodes } from "../../services/portal/permission.service.js";
import { createEmailVerificationToken, hashEmailVerificationToken, sendVerificationEmail } from "../../services/portal/email.service.js";

const ROLE_SCOPE = {
  ACI: "district",
  CENTER_COORDINATOR: "block",
  HKRN: "block",
  ABRC: "block",
  PRINCIPAL: "school",
  TEACHER: "school",
  SCHOOL_STAFF: "school",
  VIKALPA_STAFF: "global",
};

const safeUser = (user) => {
  const data = user.toObject();
  delete data.password;
  delete data.refreshToken;
  delete data.otp;
  delete data.registrationTokenHash;
  delete data.registrationTokenExpiresAt;
  return data;
};

const issueTokens = async (user) => {
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });
  return { accessToken, refreshToken };
};

const sendOtp = async (user) => {
  const otp = user.generateOtp();
  await user.save({ validateBeforeSave: false });
  return otp;
};

const roleScope = (role) => ROLE_SCOPE[role.code];

const normalizeRegions = (role, regions = []) => {
  const scope = roleScope(role);
  if (!scope) throw new ApiError(400, "This designation cannot be self-selected");

  if (scope === "global") return [{ scope: "global", districtId: null, blockId: null, schoolId: null }];
  if (!Array.isArray(regions) || regions.length === 0) {
    throw new ApiError(400, "Please select your region access");
  }

  const normalized = regions.map((item) => ({
    scope,
    districtId: item?.districtId || null,
    blockId: scope === "block" || scope === "school" ? item?.blockId || null : null,
    schoolId: scope === "school" ? item?.schoolId || null : null,
  }));

  const unique = new Map();
  for (const item of normalized) {
    const key = `${item.scope}:${item.districtId || ""}:${item.blockId || ""}:${item.schoolId || ""}`;
    unique.set(key, item);
  }
  return [...unique.values()];
};

const validateRegions = async (role, regions) => {
  const normalized = normalizeRegions(role, regions);
  const scope = roleScope(role);

  if (scope === "global") return normalized;

  for (const region of normalized) {
    if (scope === "district") {
      const ok = region.districtId && await District.exists({ _id: region.districtId, isActive: true });
      if (!ok) throw new ApiError(400, "One or more selected districts are invalid");
    }

    if (scope === "block") {
      const ok = region.districtId && region.blockId && await Block.exists({
        _id: region.blockId,
        districtId: region.districtId,
        isActive: true,
      });
      if (!ok) throw new ApiError(400, "One or more selected blocks are invalid");
    }

    if (scope === "school") {
      const ok = region.districtId && region.blockId && region.schoolId && await School.exists({
        _id: region.schoolId,
        districtId: region.districtId,
        blockId: region.blockId,
        isActive: true,
      });
      if (!ok) throw new ApiError(400, "The selected school is invalid");
    }
  }

  return normalized;
};

const replaceRegionAccess = async (userId, regions) => {
  await UserRegionAccess.deleteMany({ userId });
  if (regions.length) {
    await UserRegionAccess.insertMany(regions.map((region) => ({ userId, ...region })));
  }
};

const createRegistrationToken = (contact) => jwt.sign(
  { contact, purpose: "official-registration-password" },
  process.env.ACCESS_TOKEN_SECRET,
  { expiresIn: "15m" }
);

const verifyRegistrationToken = (token) => {
  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    if (payload?.purpose !== "official-registration-password") throw new Error("Invalid purpose");
    return payload;
  } catch {
    throw new ApiError(400, "Registration session expired. Please verify your mobile number again.");
  }
};

export const getRegistrationRoles = asyncHandler(async (_req, res) => {
  const roles = await Role.find({ isActive: true, isSelfSelectable: true })
    .select("_id name code description")
    .sort({ name: 1 })
    .lean();

  res.json(new ApiResponse(200, roles, "Registration roles fetched successfully"));
});

export const registerUser = asyncHandler(async (req, res) => {
  const { name, contact, email, roleId, regions = [] } = req.body;

  if (!name || !contact || !email || !roleId) {
    throw new ApiError(400, "Name, email, designation and mobile number are required");
  }
  if (!/^\d{10}$/.test(String(contact))) {
    throw new ApiError(400, "Mobile number must be exactly 10 digits");
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new ApiError(400, "Enter a valid email address");
  }

  const [existing, role, emailOwner] = await Promise.all([
    User.findOne({ contact: String(contact) }),
    Role.findOne({ _id: roleId, isActive: true, isSelfSelectable: true }),
    User.findOne({ email: normalizedEmail }).select("_id contact isVerified"),
  ]);

  if (!role) throw new ApiError(400, "Invalid designation");
  if (emailOwner && String(emailOwner.contact) !== String(contact)) {
    throw new ApiError(409, "This email address is already associated with another account.");
  }
  if (existing?.isVerified) {
    throw new ApiError(409, "This mobile number is already registered. Please login.");
  }

  const normalizedRegions = await validateRegions(role, regions);

  let user = existing;
  if (!user) {
    user = new User({
      userId: `USR-${Date.now().toString(36).toUpperCase()}`,
      name: String(name).trim(),
      contact: String(contact),
      email: normalizedEmail,
      roleId: role._id,
      isVerified: false,
      isActive: false,
    });
  } else {
    user.name = String(name).trim();
    user.email = normalizedEmail;
    user.roleId = role._id;
    user.isVerified = false;
    user.isActive = false;
    user.otp = undefined;
    user.registrationTokenHash = undefined;
    user.registrationTokenExpiresAt = undefined;
  }

  const verificationToken = createEmailVerificationToken();
  user.emailVerificationTokenHash = hashEmailVerificationToken(verificationToken);
  user.emailVerificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  await replaceRegionAccess(user._id, normalizedRegions);

  const allowedOrigins = String(process.env.FRONTEND_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  const requestOrigin = String(req.get("origin") || "").trim().replace(/\/$/, "");
  const refererOrigin = (() => {
    try { return new URL(req.get("referer") || "").origin; } catch { return ""; }
  })();
  const frontendOrigin = (requestOrigin && (!allowedOrigins.length || allowedOrigins.includes(requestOrigin)))
    ? requestOrigin
    : (refererOrigin && (!allowedOrigins.length || allowedOrigins.includes(refererOrigin)) ? refererOrigin : allowedOrigins[0]);

  if (!frontendOrigin) {
    throw new ApiError(500, "Unable to determine the frontend URL for email verification. Configure FRONTEND_ORIGINS.");
  }

  const verificationUrl = `${frontendOrigin}/official/verify-email?token=${encodeURIComponent(verificationToken)}`;
  try {
    await sendVerificationEmail({ to: normalizedEmail, verificationUrl, name: user.name });
  } catch (error) {
    console.error("Verification email send failed:", error.message);
    throw new ApiError(502, "Unable to send the verification email. Please verify the email settings and try again.");
  }

  res.status(existing ? 200 : 201).json(
    new ApiResponse(
      existing ? 200 : 201,
      { contact: user.contact, email: user.email, verificationSent: true },
      "Verification link sent to your email address. Please check your inbox to continue."
    )
  );
});

export const resendVerificationEmail = asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Enter a valid email address");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "No registration was found for this email address.");
  if (user.isVerified) throw new ApiError(400, "This email address is already verified. Please login.");

  const verificationToken = createEmailVerificationToken();
  user.emailVerificationTokenHash = hashEmailVerificationToken(verificationToken);
  user.emailVerificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  const allowedOrigins = String(process.env.FRONTEND_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  const requestOrigin = String(req.get("origin") || "").trim().replace(/\/$/, "");
  const frontendOrigin = requestOrigin && (!allowedOrigins.length || allowedOrigins.includes(requestOrigin)) ? requestOrigin : allowedOrigins[0];
  if (!frontendOrigin) throw new ApiError(500, "Unable to determine the frontend URL for email verification. Configure FRONTEND_ORIGINS.");

  try {
    await sendVerificationEmail({
      to: user.email,
      verificationUrl: `${frontendOrigin}/official/verify-email?token=${encodeURIComponent(verificationToken)}`,
      name: user.name,
    });
  } catch (error) {
    console.error("Verification email resend failed:", error.message);
    throw new ApiError(502, "Unable to send the verification email. Please try again later.");
  }

  res.json(new ApiResponse(200, { email: user.email, verificationSent: true }, "Verification link sent again."));
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const token = String(req.query.token || req.body.token || "").trim();
  if (!token) throw new ApiError(400, "Verification link is missing.");

  const tokenHash = hashEmailVerificationToken(token);
  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationTokenExpiresAt: { $gt: new Date() },
  });

  if (!user) throw new ApiError(400, "This verification link is invalid or has expired. Please request a new verification email.");
  if (user.isVerified) throw new ApiError(400, "This account is already verified. Please login.");

  const registrationToken = createRegistrationToken(user.contact);
  user.registrationTokenHash = crypto.createHash("sha256").update(registrationToken).digest("hex");
  user.registrationTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  user.isVerified = false;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationTokenExpiresAt = undefined;
  await user.save({ validateBeforeSave: false });

  res.json(new ApiResponse(200, { contact: user.contact, email: user.email, registrationToken }, "Email verified. Create your password to finish registration."));
});

export const resendOtp = asyncHandler(async (req, res) => {
  const contact = String(req.body.contact || "").trim();
  if (!/^\d{10}$/.test(contact)) throw new ApiError(400, "Valid 10 digit mobile number is required");

  const user = await User.findOne({ contact });
  if (!user) throw new ApiError(404, "You have not registered. Please create your account first.");
  if (user.isVerified) throw new ApiError(400, "This mobile number is already verified");

  const otp = await sendOtp(user);
  res.json(new ApiResponse(200, { otp, contact }, "Verification OTP generated"));
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const contact = String(req.body.contact || "").trim();
  const otp = String(req.body.otp || "").trim();

  if (!/^\d{10}$/.test(contact) || !/^\d{6}$/.test(otp)) {
    throw new ApiError(400, "Valid mobile number and 6 digit OTP are required");
  }

  const user = await User.findOne({ contact });
  if (!user) throw new ApiError(404, "You have not registered. Please create your account first.");
  if (user.isVerified) throw new ApiError(400, "This mobile number is already verified. Please login.");

  if (!user.otp?.expiresAt || user.otp.expiresAt < new Date()) {
    throw new ApiError(400, "OTP expired. Please request a new OTP.");
  }
  if (user.otp.attempts >= 5) throw new ApiError(429, "Too many invalid OTP attempts. Please request a new OTP.");

  if (hashOtp(otp) !== user.otp.codeHash) {
    user.otp.attempts += 1;
    await user.save({ validateBeforeSave: false });
    throw new ApiError(400, "Invalid OTP");
  }

  const registrationToken = createRegistrationToken(user.contact);
  user.registrationTokenHash = crypto.createHash("sha256").update(registrationToken).digest("hex");
  user.registrationTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  user.otp = undefined;
  await user.save({ validateBeforeSave: false });

  res.json(new ApiResponse(200, { contact, registrationToken }, "Mobile number verified. Create your password to finish registration."));
});

export const createPassword = asyncHandler(async (req, res) => {
  const token = String(req.body.registrationToken || "");
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  if (!token) throw new ApiError(400, "Registration session is missing");
  if (password.length < 6) throw new ApiError(400, "Password must contain at least 6 characters");
  if (password !== confirmPassword) throw new ApiError(400, "Passwords do not match");

  const payload = verifyRegistrationToken(token);
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    contact: payload.contact,
    registrationTokenHash: tokenHash,
    registrationTokenExpiresAt: { $gt: new Date() },
  });

  if (!user) throw new ApiError(400, "Registration session expired. Please verify your mobile number again.");

  user.password = password;
  user.isVerified = true;
  user.isActive = true;
  user.registrationTokenHash = undefined;
  user.registrationTokenExpiresAt = undefined;
  await user.save();

  res.json(new ApiResponse(200, { user: safeUser(user) }, "Account created successfully"));
});

export const loginUser = asyncHandler(async (req, res) => {
  const identifier = String(req.body.contact || req.body.identifier || "").trim();
  const password = String(req.body.password || "");

  if (!identifier || !password) {
    throw new ApiError(400, "Mobile number/admin user ID and password are required");
  }

  const isContactLogin = /^\d{10}$/.test(identifier);
  let user = null;

  if (isContactLogin) {
    // Both officials and admins can login using their registered contact number.
    user = await User.findOne({ contact: identifier });
  } else {
    // A non-mobile identifier is accepted only as an ADMIN userId.
    user = await User.findOne({ userId: identifier });
    if (user) {
      const adminRole = await Role.findById(user.roleId).select("code").lean();
      if (adminRole?.code !== "ADMIN") {
        throw new ApiError(400, "Please enter a valid 10 digit mobile number or admin user ID");
      }
    }
  }

  if (!user) {
    throw new ApiError(404, "You have not registered. Please create your account first.");
  }

  if (!user.isVerified) {
    throw new ApiError(403, "You need to verify your email before login.", [
      { code: "EMAIL_NOT_VERIFIED", contact: user.contact, email: user.email },
    ]);
  }
  if (!user.isActive) throw new ApiError(403, "Your account is inactive. Please contact the administrator.");
  if (!user.password || !(await user.isPasswordCorrect(password))) throw new ApiError(401, "Invalid credentials.");

  const tokens = await issueTokens(user);
  const [role, regions, verificationAccess, effectiveDashboardAccess, effectivePermissions] = await Promise.all([
    Role.findById(user.roleId).select("_id name code description").lean(),
    UserRegionAccess.find({ userId: user._id }).lean(),
    VerificationUser.find({ userId: user._id, isActive: true }).lean(),
    getEffectiveDashboardAccess(user),
    getEffectivePermissionCodes(user._id, user.roleId),
  ]);

  res
    .cookie("accessToken", tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    })
    .cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 10 * 24 * 60 * 60 * 1000,
    })
    .json(new ApiResponse(200, { user: safeUser(user), role, regions, verificationAccess, dashboardAccess: effectiveDashboardAccess === null ? DASHBOARD_ACCESS_CODES : effectiveDashboardAccess, permissions: effectivePermissions, schoolVisitAccess: effectivePermissions.includes("SCHOOL_VISIT_ACCESS") || role?.code === "ADMIN", ...tokens }, "Login successful"));
});

export const currentUser = asyncHandler(async (req, res) => {
  const [role, regions, verificationAccess, effectiveDashboardAccess, effectivePermissions] = await Promise.all([
    Role.findById(req.user.roleId).select("_id name code description").lean(),
    UserRegionAccess.find({ userId: req.user._id }).lean(),
    VerificationUser.find({ userId: req.user._id, isActive: true }).lean(),
    getEffectiveDashboardAccess(req.user),
    getEffectivePermissionCodes(req.user._id, req.user.roleId),
  ]);
  res.json(new ApiResponse(200, { user: safeUser(req.user), role, regions, verificationAccess, dashboardAccess: effectiveDashboardAccess === null ? DASHBOARD_ACCESS_CODES : effectiveDashboardAccess, permissions: effectivePermissions, schoolVisitAccess: effectivePermissions.includes("SCHOOL_VISIT_ACCESS") || role?.code === "ADMIN" }, "Current user fetched successfully"));
});

export const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } });
  res.clearCookie("accessToken").clearCookie("refreshToken");
  res.json(new ApiResponse(200, {}, "Logged out successfully"));
});
