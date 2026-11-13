import { Router } from "express";
import {
  listAttendanceSheetDistricts,
  downloadAttendanceSheetDlc,
} from "../../controllers/portal/attendanceSheet.controllers.js";

const router = Router();

// Public endpoints: the attendance sheet is intentionally available without login.
router.get("/districts", listAttendanceSheetDistricts);
router.get("/download", downloadAttendanceSheetDlc);

export default router;
