import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: String,
  isActive: { type: Boolean, default: true },
  isSelfSelectable: { type: Boolean, default: true },
}, { timestamps: true });

export const Role = db.models.Role || db.model("Role", schema, "roles");
