import { Router } from "express";
import {
  checkStudentBySrn,
  checkOfficialStudentBySrn,
  getOfficialStudentForEdit,
  publicRegisterStudent,
  getStudentForEdit,
  getPublicRegistrationStatus,
  updatePublicStudent,
  officialRegisterStudent,
  listOfficialStudents,
  updateOfficialStudent,
  deleteOfficialStudent,
  verifyStudent,
  verificationStudents,
  verificationFilters,
  verificationSummary,
  dashboard,
  downloadAcknowledgement,
  generateBulkTemplate,
  bulkRegisterStudents,
  bulkDownloadAcknowledgements,
  publicLevel1DistrictBlockDashboard,
  publicLevel1BlockSchoolDashboard,
  publicLevel1SchoolDashboard,
  exportPublicLevel1Dashboard,
  allRegistrationsDashboard,
  getAllRegistrationStudentForEdit,
  updateAllRegistrationStudent,
} from "../../controllers/portal/student.controllers.js";
import { verifyJWT, optionalJWT } from "../../middlewares/auth/auth.middlewares.js";
import { requireLevel1DashboardAccess, setDashboardView } from "../../middlewares/auth/dashboardAccess.middlewares.js";
import { studentUpload, bulkUpload } from "../../middlewares/upload/student.upload.js";

const router = Router();

router.get("/check/:srn", checkStudentBySrn);
router.get("/public-level1-dashboard/:examType", optionalJWT, setDashboardView("district-block"), requireLevel1DashboardAccess, publicLevel1DistrictBlockDashboard);
router.get("/public-level1-block-school-dashboard/:examType", optionalJWT, setDashboardView("block-school"), requireLevel1DashboardAccess, publicLevel1BlockSchoolDashboard);
router.get("/public-level1-school-dashboard/:examType", optionalJWT, setDashboardView("school"), requireLevel1DashboardAccess, publicLevel1SchoolDashboard);
router.get("/public-level1-dashboard/:examType/export", verifyJWT, exportPublicLevel1Dashboard);
router.get("/official/check/:srn", verifyJWT, checkOfficialStudentBySrn);
router.get("/official/:srn", verifyJWT, getOfficialStudentForEdit);
router.get("/public/status/:srn", getPublicRegistrationStatus);
router.get("/public/:srn", getStudentForEdit);
router.get("/acknowledgement/:slipId", downloadAcknowledgement);

router.post(
  "/public-register",
  studentUpload.fields([
    { name: "studentImage", maxCount: 1 },
    { name: "previousClassResult", maxCount: 1 },
  ]),
  publicRegisterStudent
);

router.put(
  "/public/:srn",
  studentUpload.fields([
    { name: "studentImage", maxCount: 1 },
    { name: "previousClassResult", maxCount: 1 },
  ]),
  updatePublicStudent
);

router.post(
  "/official-register",
  verifyJWT,
  studentUpload.fields([
    { name: "studentImage", maxCount: 1 },
    { name: "previousClassResult", maxCount: 1 },
  ]),
  officialRegisterStudent
);

router.get("/", verifyJWT, listOfficialStudents);
router.get("/dashboard", verifyJWT, dashboard);
router.get("/all-registrations/:examType", verifyJWT, allRegistrationsDashboard);
router.get("/all-registrations/record/:id", verifyJWT, getAllRegistrationStudentForEdit);

router.patch(
  "/all-registrations/:id",
  verifyJWT,
  studentUpload.fields([
    { name: "studentImage", maxCount: 1 },
    { name: "previousClassResult", maxCount: 1 },
  ]),
  updateAllRegistrationStudent
);

router.patch(
  "/:id",
  verifyJWT,
  studentUpload.fields([
    { name: "studentImage", maxCount: 1 },
    { name: "previousClassResult", maxCount: 1 },
  ]),
  updateOfficialStudent
);

router.delete("/:id", verifyJWT, deleteOfficialStudent);
router.get("/verification/filters", verifyJWT, verificationFilters);
router.get("/verification/summary", verifyJWT, verificationSummary);
router.get("/verification", verifyJWT, verificationStudents);
router.patch("/:id/verification", verifyJWT, verifyStudent);

router.post("/bulk/template", verifyJWT, generateBulkTemplate);
router.post("/bulk/acknowledgements", verifyJWT, bulkDownloadAcknowledgements);
router.post("/bulk", verifyJWT, bulkUpload.single("file"), bulkRegisterStudents);

export default router;
