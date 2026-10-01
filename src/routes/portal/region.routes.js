import { Router } from "express";
import {
  getDistricts,
  getBlocks,
  getSchools,
  getMyRegions,
  getMyDistricts,
  getMyBlocks,
  getMySchools,
} from "../../controllers/portal/region.controllers.js";
import { verifyJWT } from "../../middlewares/auth/auth.middlewares.js";

const router = Router();

router.get("/districts", getDistricts);
router.get("/blocks", getBlocks);
router.get("/schools", getSchools);

router.get("/my-access", verifyJWT, getMyRegions);
router.get("/my-districts", verifyJWT, getMyDistricts);
router.get("/my-blocks", verifyJWT, getMyBlocks);
router.get("/my-schools", verifyJWT, getMySchools);

export default router;
