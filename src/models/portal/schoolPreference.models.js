import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema({
  blockId: { type: Schema.Types.ObjectId, ref: "Block", required: true, index: true },
  schoolId: { type: Schema.Types.ObjectId, ref: "School", default: null, index: true },
  schoolCode: { type: String, trim: true, default: "" },
  schoolName: { type: String, required: true, trim: true },
  isManualSchool: { type: Boolean, default: false },
  examinationCenter: { type: Schema.Types.ObjectId, ref: "ExaminationCenter", required: true, index: true },
  examinationCenterCode: { type: String, required: true, trim: true },
  examinationCenterName: { type: String, required: true, trim: true },
  expectedRegistrationCount8: { type: Number, min: 0, default: 0 },
  expectedRegistrationCount10: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

schema.index({ examinationCenter: 1, schoolId: 1 }, { unique: true, partialFilterExpression: { schoolId: { $type: "objectId" } } });
export const SchoolPreference = db.models.SchoolPreference || db.model("SchoolPreference", schema, "schoolPreference");
