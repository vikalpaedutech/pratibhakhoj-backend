import { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "../../db/index.js";

const userSchema = new Schema(
  {
    userId: { type: String, unique: true, sparse: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    contact: { type: String, required: true, unique: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true, sparse: true, unique: true, index: true },
    password: { type: String, required: false, minlength: 6 },
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true, index: true },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    otp: {
      codeHash: String,
      expiresAt: Date,
      attempts: { type: Number, default: 0 },
    },
    refreshToken: String,
    registrationTokenHash: { type: String, index: true },
    registrationTokenExpiresAt: Date,
    emailVerificationTokenHash: { type: String, index: true },
    emailVerificationTokenExpiresAt: Date,
    profileImage: {
      url: String,
      localPath: String,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.isPasswordCorrect = function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { _id: this._id, userId: this.userId, contact: this.contact },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d" }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "10d" }
  );
};

userSchema.methods.generateOtp = function () {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  this.otp = {
    codeHash: crypto.createHash("sha256").update(code).digest("hex"),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
  };
  return code;
};

export const User = db.models.User || db.model("User", userSchema, "users");
