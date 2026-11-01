import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  checkLocationServiceability,
  getDistrictServiceability,
  patchDistrictServiceability,
  getRadiusServiceAreas,
  postRadiusServiceArea,
  patchRadiusServiceArea,
  deleteRadiusServiceArea
} from "../controllers/serviceArea.controller.js";

const router = Router();
const administratorOnly = (req, _res, next) =>
  ["ROL_1", "ROL_2", "SuperAdmin", "Admin"].includes(req.user?.role)
    ? next()
    : next(
        Object.assign(
          new Error("Only administrators can manage district serviceability."),
          { statusCode: 403 },
        ),
      );
const checksByIp = new Map();
const limitPublicChecks = (req, _res, next) => {
  const now = Date.now(),
    key = req.ip || "unknown",
    current = checksByIp.get(key);
  if (!current || current.resetAt <= now)
    checksByIp.set(key, { count: 1, resetAt: now + 60000 });
  else if (++current.count > 40)
    return next(
      Object.assign(
        new Error("Too many location checks. Please try again shortly."),
        { statusCode: 429 },
      ),
    );
  if (checksByIp.size > 5000)
    for (const [ip, item] of checksByIp)
      if (item.resetAt <= now) checksByIp.delete(ip);
  next();
};

/**
 * @swagger
 * /service-areas/check-location:
 *   post:
 *     summary: Identify a Kerala district from GPS and check serviceability
 *     tags: [Service Areas]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number, minimum: -90, maximum: 90, example: 10.5276 }
 *               longitude: { type: number, minimum: -180, maximum: 180, example: 76.2144 }
 *     responses:
 *       200: { description: Location district and serviceability result }
 *       400: { description: Invalid coordinates }
 *       503: { description: District boundary data is not configured }
 */
router.post("/check-location", limitPublicChecks, checkLocationServiceability);
/**
 * @swagger
 * /service-areas/districts:
 *   get:
 *     summary: List district serviceability settings
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Supported Kerala districts and their service status }
 *       401: { description: Authentication required }
 *       403: { description: Administrator access required }
 */
router.get("/districts", protect, administratorOnly, getDistrictServiceability);
/**
 * @swagger
 * /service-areas/districts/{id}/status:
 *   patch:
 *     summary: Enable or disable service in one district
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isServiceable]
 *             properties:
 *               isServiceable: { type: boolean }
 *     responses:
 *       200: { description: District status updated }
 *       400: { description: Invalid status }
 *       403: { description: Administrator access required }
 *       404: { description: Supported district not found }
 */
router.patch(
  "/districts/:id/status",
  protect,
  administratorOnly,
  patchDistrictServiceability,
);

/**
 * @swagger
 * /service-areas/radii:
 *   get:
 *     summary: List point-radius service areas
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Radius service areas and active status }
 *       403: { description: Administrator access required }
 *   post:
 *     summary: Add a service radius around a map point
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, latitude, longitude, radiusMeters]
 *             properties:
 *               name: { type: string, example: Kochi Depot }
 *               latitude: { type: number, example: 9.9312 }
 *               longitude: { type: number, example: 76.2673 }
 *               radiusMeters: { type: number, minimum: 100, maximum: 100000, example: 5000 }
 *     responses:
 *       201: { description: Radius service area created }
 *       400: { description: Invalid name, coordinates, or radius }
 *       403: { description: Administrator access required }
 */
router.get("/radii", protect, administratorOnly, getRadiusServiceAreas);
router.post("/radii", protect, administratorOnly, postRadiusServiceArea);
/**
 * @swagger
 * /service-areas/radii/{id}/status:
 *   patch:
 *     summary: Activate or deactivate a radius service area
 *     tags: [Service Areas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Radius service area updated }
 *       403: { description: Administrator access required }
 *       404: { description: Radius service area not found }
 */
router.patch(
  "/radii/:id/status",
  protect,
  administratorOnly,
  patchRadiusServiceArea,
);
router.delete("/radii/:id", protect, administratorOnly, deleteRadiusServiceArea);

export default router;
