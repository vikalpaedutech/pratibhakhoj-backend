import { Schema } from "mongoose";
import { db } from "../../db/index.js";

export const DASHBOARD_ACCESS_CODES = [
  "MB_DISTRICT_BLOCK",
  "MB_BLOCK_SCHOOL",
  "MB_SCHOOL",
  "HS100_DISTRICT_BLOCK",
  "HS100_BLOCK_SCHOOL",
  "HS100_SCHOOL",
  "MB_ALL_REGISTRATIONS",
  "HS100_ALL_REGISTRATIONS",
];

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    dashboards: { type: [String], enum: DASHBOARD_ACCESS_CODES, default: [] },
  },
  { timestamps: true }
);

export const UserDashboardAccess =
  db.models.UserDashboardAccess ||
  db.model("UserDashboardAccess", schema, "userdashboardaccesses");
