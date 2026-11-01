import { Router } from "express";
import { listAgentDetails } from '../controllers/agent-details.controller.js';
import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";
import { addShiftLocation, getActiveShift, listActiveAgentShifts, recordShiftActivity, startShift, stopShift } from "../controllers/shift.controller.js";

const router = Router();
router.get('/agents', protect, authorize(['PERM_COLLECTION_READ']), listAgentDetails);
router.get("/", protect, authorize(["PERM_MAP_READ"]), listActiveAgentShifts);
router.get("/active", protect, getActiveShift);
router.post("/start", protect, startShift);
router.post("/:id/location", protect, addShiftLocation);
router.post("/:id/heartbeat", protect, recordShiftActivity);
router.patch("/:id/stop", protect, stopShift);
export default router;
