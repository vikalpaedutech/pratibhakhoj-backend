import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema({
  districtId: { type: Schema.Types.ObjectId, ref: "District", required: true, index: true },
  blockId: { type: Schema.Types.ObjectId, ref: "Block", required: true, unique: true, index: true },
  blockName: { type: String, required: true, trim: true },
  districtName: { type: String, required: true, trim: true },
  numberOfSchools: { type: Number, required: true, min: 0 },
  expectedRegistrationCount8: { type: Number, required: true, min: 0, default: 0 },
  expectedRegistrationCount10: { type: Number, required: true, min: 0, default: 0 },
  totalCentersRequired: { type: Number, required: true, min: 0, default: 0 },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

export const BlockCenterRequirement = db.models.BlockCenterRequirement || db.model("BlockCenterRequirement", schema, "blockCenterRequirements");
