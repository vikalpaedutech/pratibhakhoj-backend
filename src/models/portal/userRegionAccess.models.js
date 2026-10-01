import { Schema } from "mongoose";
import { db } from "../../db/index.js";

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scope: { type: String, enum: ["global", "district", "block", "school"], required: true },
    districtId: { type: Schema.Types.ObjectId, ref: "District", default: null, index: true },
    blockId: { type: Schema.Types.ObjectId, ref: "Block", default: null, index: true },
    schoolId: { type: Schema.Types.ObjectId, ref: "School", default: null, index: true },
  },
  { timestamps: true }
);

schema.index(
  { userId: 1, scope: 1, districtId: 1, blockId: 1, schoolId: 1 },
  { unique: true }
);

export const UserRegionAccess =
  db.models.UserRegionAccess ||
  db.model("UserRegionAccess", schema, "userregionaccesses");
