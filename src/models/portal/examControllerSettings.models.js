import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const helplineSchema = new Schema({
  label: { type: String, trim: true, default: "Helpline" },
  number: { type: String, trim: true, required: true },
  order: { type: Number, default: 0 },
}, { _id: true });

const schema = new Schema({
  key: { type: String, unique: true, default: "global", index: true },
  helplines: { type: [helplineSchema], default: () => [
    { label: "Helpline 1", number: "7982109215", order: 1 },
    { label: "Helpline 2", number: "7982108494", order: 2 },
    { label: "Helpline 3", number: "7982109054", order: 3 },
  ] },
  examActive: { type: Boolean, default: true },
  landingMessage: { type: String, trim: true, default: "Registrations coming soon" },
}, { timestamps: true });

export const ExamControllerSettings = db.models.ExamControllerSettings || db.model("ExamControllerSettings", schema, "exam_controller_settings");
