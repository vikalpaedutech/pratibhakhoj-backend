import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import app from "./app.js";
import connectDb from "./db/index.js";
import { seedData } from "./services/portal/seed.service.js";

const port = Number(process.env.PORT || 8200);

const startServer = async () => {
  try {
    await connectDb();
    await seedData();

    app.listen(port, () => {
      console.log(`PratibhaKhoj backend running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
};

startServer();
