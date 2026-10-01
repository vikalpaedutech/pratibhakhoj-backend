import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema(
  {
    schoolCode: { type: String, trim: true, index: true, sparse: true },
    schoolName: { type: String, required: true, trim: true },
    districtId: { type: Schema.Types.ObjectId, ref: "District", required: true, index: true },
    blockId: { type: Schema.Types.ObjectId, ref: "Block", required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schema.index({ schoolName: 1, districtId: 1, blockId: 1 }, { unique: true });

export const School = db.models.School || db.model("School", schema, "schools");
