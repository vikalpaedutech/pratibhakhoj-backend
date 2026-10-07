import { Router } from "express";
import multer from "multer";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";
import { requirePermission } from "../../middlewares/auth/permission.middlewares.js";
import {
  listVisits,
  exportVisits,
  createVisit,
  getVisitDetails,
  saveVisitForm,
  downloadVisitPdf,
  downloadBlankVisitPdf,
  uploadSignedVisit,
  viewSignedVisit,
} from "../../controllers/portal/schoolVisit.controllers.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

router.use(verifyJWT, requirePermission("SCHOOL_VISIT_ACCESS"));
router.get("/", listVisits);
router.get("/template", downloadBlankVisitPdf);
router.get("/export", exportVisits);
router.post("/", createVisit);
router.get("/:id", getVisitDetails);
router.put("/:id/form", saveVisitForm);
router.get("/:id/pdf", downloadVisitPdf);
router.post("/:id/upload", upload.single("file"), uploadSignedVisit);
router.get("/:id/attachment", viewSignedVisit);

export default router;
