import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const changeSchema = new Schema(
  {
    field: { type: String, required: true, trim: true },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const schema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    examType: {
      type: String,
      enum: ["MB", "HS100"],
      required: true,
      index: true,
    },
    examinationLevel: { type: Number, enum: [1, 2, 3], default: 1, index: true },
    action: {
      type: String,
      enum: ["UPDATE"],
      default: "UPDATE",
      index: true,
    },
    source: {
      type: String,
      enum: ["OFFICIAL", "ALL_REGISTRATIONS", "BULK", "PUBLIC"],
      default: "OFFICIAL",
      index: true,
    },
    changedFields: { type: [String], default: [] },
    changes: { type: [changeSchema], default: [] },
  },
  { timestamps: true }
);

schema.index({ studentId: 1, createdAt: -1 });
schema.index({ updatedBy: 1, createdAt: -1 });
schema.index({ examType: 1, examinationLevel: 1, createdAt: -1 });

export const StudentLog =
  db.models.StudentLog || db.model("StudentLog", schema, "studentlogs");
