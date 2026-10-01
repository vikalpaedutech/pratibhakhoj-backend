import { Schema } from "mongoose";
import { db } from "../../db/index.js";
import { DASHBOARD_ACCESS_CODES } from "./userDashboardAccess.models.js";

const schema = new Schema({
  roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true, unique: true, index: true },
  dashboards: { type: [String], enum: DASHBOARD_ACCESS_CODES, default: [] },
}, { timestamps: true });

export const RoleDashboardAccess = db.models.RoleDashboardAccess || db.model("RoleDashboardAccess", schema, "roledashboardaccesses");
