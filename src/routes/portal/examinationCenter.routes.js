import { Router } from "express";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";
import { requireAdmin } from "../../middlewares/auth/admin.middlewares.js";
import { requirePermission } from "../../middlewares/auth/permission.middlewares.js";
import {
  listExaminationCenters, createExaminationCenter, bulkCreateExaminationCenters,
  updateExaminationCenter, disableExaminationCenter, listSchoolPreferences, saveSchoolPreferences,
  listBlockCenterRequirements, saveBlockCenterRequirement, listBlockExaminationCenters,
  createBlockExaminationCenter, getCenterSchoolPreferences, updateBlockExaminationCenter,
  listBlockSchoolCenterPreferences, saveBlockSchoolCenterPreference, removeBlockExaminationCenter,
} from "../../controllers/portal/examinationCenter.controllers.js";

const router = Router();
router.use(verifyJWT);
router.get("/", requirePermission("SCHOOL_CENTER_PREFERENCE"), listExaminationCenters);
router.get("/requirements", requirePermission("SCHOOL_CENTER_PREFERENCE"), listBlockCenterRequirements);
router.put("/blocks/:blockId/requirements", requirePermission("SCHOOL_CENTER_PREFERENCE"), saveBlockCenterRequirement);
router.get("/blocks/:blockId/centers", requirePermission("SCHOOL_CENTER_PREFERENCE"), listBlockExaminationCenters);
router.get("/blocks/:blockId/schools", requirePermission("SCHOOL_CENTER_PREFERENCE"), listBlockSchoolCenterPreferences);
router.put("/blocks/:blockId/schools/:schoolId/preferences", requirePermission("SCHOOL_CENTER_PREFERENCE"), saveBlockSchoolCenterPreference);
router.post("/blocks/:blockId/centers", requirePermission("SCHOOL_CENTER_PREFERENCE"), createBlockExaminationCenter);
router.delete("/blocks/:blockId/centers/:centerId", requirePermission("SCHOOL_CENTER_PREFERENCE"), removeBlockExaminationCenter);
router.get("/centers/:centerId/schools", requirePermission("SCHOOL_CENTER_PREFERENCE"), getCenterSchoolPreferences);
router.put("/centers/:centerId", requirePermission("SCHOOL_CENTER_PREFERENCE"), updateBlockExaminationCenter);
router.post("/", requireAdmin, createExaminationCenter);
router.post("/bulk", requireAdmin, bulkCreateExaminationCenters);
router.patch("/:id", requireAdmin, updateExaminationCenter);
router.delete("/:id", requireAdmin, disableExaminationCenter);
router.get("/school-preferences", requirePermission("SCHOOL_CENTER_PREFERENCE"), listSchoolPreferences);
router.put("/school-preferences", requirePermission("SCHOOL_CENTER_PREFERENCE"), saveSchoolPreferences);
export default router;
