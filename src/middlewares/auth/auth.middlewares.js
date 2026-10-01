import jwt from "jsonwebtoken";
import { User } from "../../models/portal/user.models.js";
import { ApiError } from "../../utils/api-error.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const verifyJWT = asyncHandler(async (req, _res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) throw new ApiError(401, "Unauthorized");

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decoded._id).select(
      "-password -refreshToken -otp"
    );

    if (!user || !user.isActive) {
      throw new ApiError(401, "Invalid access token");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Invalid access token");
  }
});


// Allows public endpoints to remain public while still applying authenticated
// access rules when a logged-in user is making the request.
export const optionalJWT = asyncHandler(async (req, _res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decoded._id).select(
      "-password -refreshToken -otp -registrationTokenHash -registrationTokenExpiresAt"
    );

    if (user?.isActive) req.user = user;
  } catch {
    // Keep the endpoint public for anonymous visitors. The client-side session
    // will handle an expired/invalid token separately.
  }

  next();
});
