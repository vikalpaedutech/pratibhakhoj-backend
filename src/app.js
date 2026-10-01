import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import authRouter from "./routes/portal/auth.routes.js";
import regionRouter from "./routes/portal/region.routes.js";
import schoolRouter from "./routes/portal/school.routes.js";
import studentRouter from "./routes/portal/student.routes.js";
import verificationUserRouter from "./routes/portal/verificationUser.routes.js";
import adminUserRouter from "./routes/portal/adminUser.routes.js";
import adminRegionRouter from "./routes/portal/adminRegion.routes.js";
import adminAccessRouter from "./routes/portal/adminAccess.routes.js";
import adminDashboardAccessRouter from "./routes/portal/adminDashboardAccess.routes.js";
import dashboardAccessRouter from "./routes/portal/dashboardAccess.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const allowedOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:5174,http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "Accept"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "PratibhaKhoj backend is healthy",
    data: { service: "pratibhakhoj", timestamp: new Date().toISOString() },
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/regions", regionRouter);
app.use("/api/v1/schools", schoolRouter);
app.use("/api/v1/students", studentRouter);
app.use("/api/v1/verification-users", verificationUserRouter);
app.use("/api/v1/admin/users", adminUserRouter);
app.use("/api/v1/admin/regions", adminRegionRouter);
app.use("/api/v1/admin/user-region-access", adminAccessRouter);
app.use("/api/v1/admin/dashboard-access", adminDashboardAccessRouter);
app.use("/api/v1/dashboard-access", dashboardAccessRouter);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: "Route not found",
    data: null,
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);

  if (err?.message?.startsWith("CORS blocked")) {
    return res.status(403).json({ success: false, statusCode: 403, message: err.message, data: null });
  }

  if (
    err?.name === "MulterError" ||
    err?.message?.startsWith("Student image") ||
    err?.message?.startsWith("Previous class annual result") ||
    err?.message?.startsWith("Unexpected upload field")
  ) {
    return res.status(400).json({ success: false, statusCode: 400, message: err.message, data: null });
  }

  if (err?.code === 11000) {
    const fields = Object.keys(err.keyPattern || {});
    return res.status(409).json({
      success: false,
      statusCode: 409,
      message: `Duplicate value for: ${fields.join(", ") || "unique field"}`,
      data: null,
    });
  }

  const statusCode = Number(err?.statusCode) || 500;
  return res.status(statusCode).json({
    success: false,
    statusCode,
    message: err?.message || "Internal server error",
    data: null,
    errors: err?.errors || [],
  });
});

export default app;
