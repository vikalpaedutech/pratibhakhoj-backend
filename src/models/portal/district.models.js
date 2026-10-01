import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema({
  districtId: { type: String, trim: true, default: null, unique: true, sparse: true },
  districtName: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const District = db.models.District || db.model("District", schema, "districts");
