import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    module: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const Permission = db.models.Permission || db.model("Permission", schema, "permissions");
