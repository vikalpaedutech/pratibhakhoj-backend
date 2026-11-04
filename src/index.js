import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import app from "./app.js";
import connectDb from "./db/index.js";
import { seedData } from "./services/portal/seed.service.js";
import { db } from "./db/index.js";

const port = Number(process.env.PORT || 8080 );

//8200

const startServer = async () => {
  try {
    await connectDb();
    // Replace the legacy globally-unique schoolId index with the new
    // center + school compound index. This preserves all existing documents.
    try { await db.collection("schoolPreference").dropIndex("schoolId_1"); } catch (error) {
      if (error.codeName !== "IndexNotFound" && error.code !== 27) console.warn("School preference index migration:", error.message);
    }
    await seedData();

    app.listen(port,"0.0.0.0", () => {
      console.log(`PratibhaKhoj backend running at ${port}`);
    });
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
};

startServer();
