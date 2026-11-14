import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema({
  blockId: { type: Schema.Types.ObjectId, ref: "Block", required: true, index: true },
  schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
  preference1: { type: Schema.Types.ObjectId, ref: "ExaminationCenter", default: null },
  preference2: { type: Schema.Types.ObjectId, ref: "ExaminationCenter", default: null },
}, { timestamps: true });

schema.index({ blockId: 1, schoolId: 1 }, { unique: true });
export const BlockSchoolCenterPreference = db.models.BlockSchoolCenterPreference || db.model("BlockSchoolCenterPreference", schema, "blockSchoolCenterPreferences");
