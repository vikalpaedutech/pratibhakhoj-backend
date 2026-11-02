import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema({
  examinationCenter: { type: String, required: true, trim: true },
  examinationCenterCode: { type: String, required: true, trim: true, uppercase: true },
  districtName: { type: String, required: true, trim: true },
  districtId: { type: Schema.Types.ObjectId, ref: "District", required: true, index: true },
  blockName: { type: String, required: true, trim: true },
  blockId: { type: Schema.Types.ObjectId, ref: "Block", required: true, index: true },
  examinationCenterCapacity: { type: Number, required: true, min: 1 },
  adjustments: { type: Schema.Types.Mixed, default: null },
  examType: { type: String, trim: true, default: "" },
  examLevel: { type: String, trim: true, default: "" },
  paperCount: { type: Number, min: 0, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.index({ examinationCenterCode: 1 }, { unique: true });
export const ExaminationCenter = db.models.ExaminationCenter || db.model("ExaminationCenter", schema, "examinationcenters");
