import { Router } from "express";

import {
  getDistrictByCode,
  getDistricts,
  getPRIs,
  getPRIsByDistrict,
  getURBs,
  getURBsByDistrict,
} from "../controllers/location.controller.js";
import { protectLocation } from "../middlewares/auth.middleware.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Locations
 *   description: District, Panchayati Raj Institution (PRI), and urban local-body lookup APIs
 *
 * components:
 *   schemas:
 *     DistrictLocation:
 *       type: object
 *       properties:
 *         districtCode:
 *           type: integer
 *           example: 7
 *         districtName:
 *           type: string
 *           example: Ernakulam
 *     PRILocation:
 *       type: object
 *       properties:
 *         priId:
 *           type: string
 *           example: PRI_101
 *         districtCode:
 *           type: integer
 *           example: 7
 *         localbodyname:
 *           type: string
 *           example: Alangad Grama Panchayat
 *     UrbanLocation:
 *       type: object
 *       properties:
 *         urbId:
 *           type: string
 *           example: URB_12
 *         districtCode:
 *           type: integer
 *           example: 7
 *         localbodyname:
 *           type: string
 *           example: Kochi Municipal Corporation
 */

/**
 * @swagger
 * /locations/districts:
 *   get:
 *     summary: List districts
 *     description: Returns districts. Use q to search by name or serviceableOnly=true to list only districts enabled by administrators.
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: District-name search text
 *         example: erna
 *       - in: query
 *         name: serviceableOnly
 *         required: false
 *         schema:
 *           type: boolean
 *         description: Return only districts currently enabled for REPAMP service
 *     responses:
 *       200:
 *         description: Districts fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DistrictLocation'
 *       401:
 *         description: Missing, invalid, or expired authentication token
 *       500:
 *         description: Internal server error
 */
router.get("/districts", protectLocation, getDistricts);

/**
 * @swagger
 * /locations/districts/{code}:
 *   get:
 *     summary: Get a district by code
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: integer
 *         description: District code
 *         example: 7
 *     responses:
 *       200:
 *         description: District fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DistrictLocation'
 *       401:
 *         description: Missing, invalid, or expired authentication token
 *       404:
 *         description: District not found
 *       500:
 *         description: Internal server error
 */
router.get("/districts/:code", protectLocation, getDistrictByCode);

/**
 * @swagger
 * /locations/pris:
 *   get:
 *     summary: List PRI local bodies
 *     description: Returns PRI local bodies, optionally filtered by district code and name.
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: code
 *         required: false
 *         schema:
 *           type: integer
 *         description: District code
 *         example: 7
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: Local-body-name search text
 *         example: alangad
 *     responses:
 *       200:
 *         description: PRI local bodies fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PRILocation'
 *       401:
 *         description: Missing, invalid, or expired authentication token
 *       500:
 *         description: Internal server error
 */
router.get("/pris", protectLocation, getPRIs);

/**
 * @swagger
 * /locations/pris/{code}:
 *   get:
 *     summary: List PRI local bodies by district
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: integer
 *         description: District code
 *         example: 7
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: Local-body-name search text
 *     responses:
 *       200:
 *         description: PRI local bodies fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PRILocation'
 *       401:
 *         description: Missing, invalid, or expired authentication token
 *       404:
 *         description: No PRI local bodies found for the district
 *       500:
 *         description: Internal server error
 */
router.get("/pris/:code", protectLocation, getPRIsByDistrict);

/**
 * @swagger
 * /locations/urbans:
 *   get:
 *     summary: List urban local bodies
 *     description: Returns urban local bodies, optionally filtered by district code and name.
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: code
 *         required: false
 *         schema:
 *           type: integer
 *         description: District code
 *         example: 7
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: Local-body-name search text
 *         example: kochi
 *     responses:
 *       200:
 *         description: Urban local bodies fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UrbanLocation'
 *       401:
 *         description: Missing, invalid, or expired authentication token
 *       500:
 *         description: Internal server error
 */
router.get("/urbans", protectLocation, getURBs);

/**
 * @swagger
 * /locations/urbans/{code}:
 *   get:
 *     summary: List urban local bodies by district
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: integer
 *         description: District code
 *         example: 7
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: Local-body-name search text
 *     responses:
 *       200:
 *         description: Urban local bodies fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UrbanLocation'
 *       401:
 *         description: Missing, invalid, or expired authentication token
 *       404:
 *         description: No urban local bodies found for the district
 *       500:
 *         description: Internal server error
 */
router.get("/urbans/:code", protectLocation, getURBsByDistrict);

export default router;

