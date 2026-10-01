import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema(
  {
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true, index: true },
    permissionId: { type: Schema.Types.ObjectId, ref: "Permission", required: true, index: true },
    isAllowed: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schema.index({ roleId: 1, permissionId: 1 }, { unique: true });

export const RolePermission =
  db.models.RolePermission || db.model("RolePermission", schema, "rolepermissions");
