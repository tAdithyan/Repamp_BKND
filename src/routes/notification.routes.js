import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { listNotificationsController, readAllNotificationsController, readNotificationController, registerPushDeviceController, unregisterPushDeviceController } from "../controllers/notification.controller.js";

const router = Router();
router.get("/", protect, listNotificationsController);
router.post('/devices', protect, registerPushDeviceController);
router.delete('/devices/:deviceId', protect, unregisterPushDeviceController);
router.patch("/read-all", protect, readAllNotificationsController);
router.patch("/:id/read", protect, readNotificationController);
export default router;
