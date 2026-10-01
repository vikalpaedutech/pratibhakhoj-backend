import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema({
  districtId: { type: Schema.Types.ObjectId, ref: "District", required: true, index: true },
  blockId: { type: String, trim: true, default: null, index: true },
  blockName: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.index({ districtId: 1, blockId: 1 }, { unique: true });

export const Block = db.models.Block || db.model("Block", schema, "blocks");
