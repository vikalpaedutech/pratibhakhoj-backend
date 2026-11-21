/**
 * Run once after deploying the program-wise preference schema.
 * This replaces the old { blockId, schoolId } unique index with
 * { blockId, schoolId, program }, allowing independent MB and HS100 rows.
 *
 * Usage: node scripts/migrate-block-school-preference-index.js
 * (Adjust the script path to your backend working directory.)
 */
import "dotenv/config";
import mongoose from "mongoose";
import { db } from "../src/db/index.js";
import connectDb from "../src/db/index.js";

const run = async () => {
  await connectDb();
  const collection = db.collection("blockSchoolCenterPreferences");
  // Existing records predate the program field; preserve them as MB preferences.
  await collection.updateMany(
    { $or: [{ program: { $exists: false } }, { program: null }, { program: "" }] },
    { $set: { program: "MB" } }
  );
  const indexes = await collection.indexes();
  const legacy = indexes.find(index =>
    index.unique &&
    index.key?.blockId === 1 &&
    index.key?.schoolId === 1 &&
    Object.keys(index.key).length === 2
  );
  if (legacy) await collection.dropIndex(legacy.name);
  await collection.createIndex(
    { blockId: 1, schoolId: 1, program: 1 },
    { unique: true, name: "blockId_1_schoolId_1_program_1" }
  );
  console.log("Program-wise school preference index migration completed.");
  await mongoose.disconnect();
};

run().catch(async error => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
