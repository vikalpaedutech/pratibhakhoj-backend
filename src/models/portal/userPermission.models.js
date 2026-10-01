import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    permissionId: { type: Schema.Types.ObjectId, ref: "Permission", required: true, index: true },
    isAllowed: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schema.index({ userId: 1, permissionId: 1 }, { unique: true });

export const UserPermission =
  db.models.UserPermission || db.model("UserPermission", schema, "userpermissions");
