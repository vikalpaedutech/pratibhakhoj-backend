import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const attachmentSchema = new Schema({
  key: { type: String, required: true },
  fileName: { type: String, required: true },
  originalName: { type: String, default: "" },
  mimeType: { type: String, default: "application/pdf" },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
  districtId: { type: Schema.Types.ObjectId, ref: "District", required: true, index: true },
  blockId: { type: Schema.Types.ObjectId, ref: "Block", required: true, index: true },
  visitDate: { type: Date, required: true, index: true },
  description: { type: String, default: "", trim: true },
  status: { type: String, enum: ["PLANNED", "VISITED"], default: "PLANNED", index: true },
  attachment: { type: attachmentSchema, default: null },
}, { timestamps: true });

schema.index({ userId: 1, visitDate: 1, schoolId: 1 }, { unique: true });
schema.index({ visitDate: 1, status: 1, districtId: 1, blockId: 1 });

export const SchoolVisit = db.models.SchoolVisit || db.model("SchoolVisit", schema, "schoolvisits");
