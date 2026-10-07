import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const activitySchema = new Schema({
  activity: { type: String, required: true, trim: true },
  status: { type: String, enum: ["Yes", "No", ""], default: "" },
  remarks: { type: String, default: "", trim: true },
}, { _id: false });

const programmeStatusSchema = new Schema({
  programme: { type: String, required: true, trim: true },
  eligibleClass: { type: String, required: true, trim: true },
  totalStudents: { type: Number, default: null, min: 0 },
  studentsAbove60: { type: Number, default: null, min: 0 },
  studentsBelow60: { type: Number, default: null, min: 0 },
  studentsPresent: { type: Number, default: null, min: 0 },
  studentsAbsent: { type: Number, default: null, min: 0 },
  registrationsCompleted: { type: Number, default: null, min: 0 },
  registrationsPending: { type: Number, default: null, min: 0 },
}, { _id: false });

const pendingSchema = new Schema({
  programme: { type: String, required: true, trim: true },
  pendingRegistrations: { type: Number, default: null, min: 0 },
  reasonRemarks: { type: String, default: "", trim: true },
  committedDate: { type: Date, default: null },
}, { _id: false });

const schema = new Schema({
  schoolVisitId: { type: Schema.Types.ObjectId, ref: "SchoolVisit", required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  schoolName: { type: String, default: "", trim: true },
  schoolCode: { type: String, default: "", trim: true },
  block: { type: String, default: "", trim: true },
  district: { type: String, default: "", trim: true },
  dateOfSLCVisit: { type: Date, default: null },
  centreCoordinator: { type: String, default: "", trim: true },
  awarenessCampaignActivities: { type: [activitySchema], default: [] },
  studentRegistrationStatus: { type: [programmeStatusSchema], default: [] },
  pendingRegistrationFollowUp: { type: [pendingSchema], default: [] },
  centreCoordinatorName: { type: String, default: "", trim: true },
  schoolHeadName: { type: String, default: "", trim: true },
  submittedAt: { type: Date, default: null },
}, { timestamps: true });

export const VisitForm = db.models.VisitForm || db.model("VisitForm", schema, "visitforms");
