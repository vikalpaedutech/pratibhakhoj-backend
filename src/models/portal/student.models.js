import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const levelFields = (prefix) => ({
  [`${prefix}AdmitCardDownloaded`]: { type: Boolean, default: false },
  [`${prefix}ExaminationDistrict`]: { type: Schema.Types.ObjectId, ref: "District", default: null },
  [`${prefix}ExaminationBlock`]: { type: Schema.Types.ObjectId, ref: "Block", default: null },
  [`${prefix}ExaminationCenter`]: { type: Schema.Types.ObjectId, default: null },
  [`${prefix}ExaminationDate`]: { type: Date, default: null },
  [`${prefix}ResultChecked`]: { type: Boolean, default: false },
  [`${prefix}ResultDownloaded`]: { type: Boolean, default: false },
  [`${prefix}CertificateDownloaded`]: { type: Boolean, default: false },
  [`${prefix}CertificateAvailable`]: { type: Boolean, default: false },
  [`${prefix}DistrictRank`]: { type: Number, default: null },
  [`${prefix}StateRank`]: { type: Number, default: null },
  [`${prefix}BlockRank`]: { type: Number, default: null },
  [`${prefix}Qualified`]: { type: Boolean, default: false },
  [`isPresentIn${prefix}Examination`]: { type: Boolean, default: false },
  [`${prefix}ExaminationRoomNumber`]: { type: String, trim: true, default: null },
});

const schema = new Schema(
  {
    studentSrn: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{10}$/,
      index: true,
    },
    rollNumber: { type: String, default: null, trim: true },
    name: { type: String, required: true, trim: true },
    fatherName: { type: String, required: true, trim: true },
    motherName: { type: String, trim: true, default: null },
    dob: { type: Date, required: true },
    gender: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    aadhar: { type: String, trim: true, default: null },
    mobile: { type: String, required: true, trim: true },
    whatsapp: { type: String, trim: true, default: null },

    houseNumber: { type: String, trim: true, default: null },
    cityTownVillage: { type: String, trim: true, default: null },
    addressBlock: { type: String, trim: true, default: null },
    addressDistrict: { type: String, trim: true, default: null },
    addressState: { type: String, trim: true, default: "Haryana" },

    districtId: { type: Schema.Types.ObjectId, ref: "District", required: true, index: true },
    blockDistrictId: { type: Schema.Types.ObjectId, ref: "Block", required: true, index: true },
    schoolDistrictId: { type: Schema.Types.ObjectId, ref: "School", default: null, index: true },
    schoolEntry: { type: String, enum: ["db", "manual"], default: "db" },
    schoolNameManual: { type: String, trim: true, default: null },

    previousClassAnnualExamPercentage: { type: Number, min: 0, max: 100, default: null },
    previousClassResult: {
      originalName: { type: String, default: null },
      fileName: { type: String, default: null },
      mimeType: { type: String, default: null },
      key: { type: String, default: null },
      url: { type: String, default: null },
      localPath: { type: String, default: null },
    },

    classOfStudent: { type: Number, enum: [8, 10], required: true },
    studentImage: {
      originalName: { type: String, default: null },
      fileName: { type: String, default: null },
      mimeType: { type: String, default: null },
      key: { type: String, default: null },
      url: { type: String, default: null },
    },

    isRegisteredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    isBulkRegistered: { type: Boolean, default: false },

    isVerified: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ["Pending", "Verified", "Rejected"],
      default: "Pending",
      index: true,
    },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null, index: true },
    registrationFormVerificationRemark: { type: String, trim: true, default: null },

    slipId: { type: String, required: true, unique: true, index: true },

    examType: { type: String, enum: ["MB", "HS100"], required: true, index: true },
    examinationLevel: { type: Number, enum: [1, 2, 3], default: 1 },

    L1ShortlistOrWaitlist: { type: String, enum: ["Shortlisted", "Waitinglist", null], default: null },
    L2ShortlistOrWaitlist: { type: String, enum: ["Shortlisted", "Waitinglist", null], default: null },
    L3ShortlistOrWaitlist: { type: String, enum: ["Shortlisted", "Waitinglist", null], default: null },
    finalSelection: { type: Boolean, default: false },

    ...levelFields("L1"),
    ...levelFields("L2"),
    ...levelFields("L3"),

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schema.index({ studentSrn: 1, examType: 1 }, { unique: true });
schema.index({ examType: 1, classOfStudent: 1, isVerified: 1 });
schema.index({ districtId: 1, blockDistrictId: 1, schoolDistrictId: 1 });

export const Student = db.models.Student || db.model("Student", schema, "students");
