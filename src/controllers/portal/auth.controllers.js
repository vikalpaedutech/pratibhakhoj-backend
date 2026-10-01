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
  const { name, contact, roleId, regions = [] } = req.body;

  if (!name || !contact || !roleId) {
    throw new ApiError(400, "Name, designation and mobile number are required");
  }
  if (!/^\d{10}$/.test(String(contact))) {
    throw new ApiError(400, "Mobile number must be exactly 10 digits");
  }

  const [existing, role] = await Promise.all([
    User.findOne({ contact: String(contact) }),
    Role.findOne({ _id: roleId, isActive: true, isSelfSelectable: true }),
  ]);

  if (!role) throw new ApiError(400, "Invalid designation");
  const normalizedRegions = await validateRegions(role, regions);

  if (existing?.isVerified) {
    throw new ApiError(409, "This mobile number is already registered. Please login.");
  }

  let user = existing;
  if (!user) {
    user = new User({
      userId: `USR-${Date.now().toString(36).toUpperCase()}`,
      name: String(name).trim(),
      contact: String(contact),
      roleId: role._id,
      isVerified: false,
      isActive: false,
    });
  } else {
    user.name = String(name).trim();
    user.roleId = role._id;
    user.isVerified = false;
    user.isActive = false;
    user.otp = undefined;
    user.registrationTokenHash = undefined;
    user.registrationTokenExpiresAt = undefined;
  }

  await user.save({ validateBeforeSave: false });
  await replaceRegionAccess(user._id, normalizedRegions);

  const otp = await sendOtp(user);

  res.status(existing ? 200 : 201).json(
    new ApiResponse(
      existing ? 200 : 201,
      { contact: user.contact, otp, otpRequired: true },
      existing
        ? "This account is not verified yet. A new OTP has been generated."
        : "Registration details saved. Verify your mobile number to continue."
    )
  );
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
    throw new ApiError(403, "You need to verify your number before login.", [
      { code: "MOBILE_NOT_VERIFIED", contact: user.contact },
    ]);
  }
  if (!user.isActive) throw new ApiError(403, "Your account is inactive. Please contact the administrator.");
  if (!user.password || !(await user.isPasswordCorrect(password))) throw new ApiError(401, "Invalid credentials.");

  const tokens = await issueTokens(user);
  const [role, regions, verificationAccess, effectiveDashboardAccess] = await Promise.all([
    Role.findById(user.roleId).select("_id name code description").lean(),
    UserRegionAccess.find({ userId: user._id }).lean(),
    VerificationUser.find({ userId: user._id, isActive: true }).lean(),
    getEffectiveDashboardAccess(user),
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
    .json(new ApiResponse(200, { user: safeUser(user), role, regions, verificationAccess, dashboardAccess: effectiveDashboardAccess === null ? DASHBOARD_ACCESS_CODES : effectiveDashboardAccess, ...tokens }, "Login successful"));
});

export const currentUser = asyncHandler(async (req, res) => {
  const [role, regions, verificationAccess, effectiveDashboardAccess] = await Promise.all([
    Role.findById(req.user.roleId).select("_id name code description").lean(),
    UserRegionAccess.find({ userId: req.user._id }).lean(),
    VerificationUser.find({ userId: req.user._id, isActive: true }).lean(),
    getEffectiveDashboardAccess(req.user),
  ]);
  res.json(new ApiResponse(200, { user: safeUser(req.user), role, regions, verificationAccess, dashboardAccess: effectiveDashboardAccess === null ? DASHBOARD_ACCESS_CODES : effectiveDashboardAccess }, "Current user fetched successfully"));
});

export const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } });
  res.clearCookie("accessToken").clearCookie("refreshToken");
  res.json(new ApiResponse(200, {}, "Logged out successfully"));
});
