import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    examType: { type: [String], enum: ["MB", "HS100"], default: [] },
    region: { type: [Schema.Types.ObjectId], ref: "District", default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const VerificationUser =
  db.models.VerificationUser ||
  db.model("VerificationUser", schema, "verificationusers");
