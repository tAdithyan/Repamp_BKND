import { Router } from "express";

import {
    getAllPickupsController,
    getPickupByIdController,
    getPickupByCustomerIdController,
    getPickupForAgentsController,
    getPickupsByStatusController,
    createPickupController,
    updatePickupController,
    cancelPickupController,
    deletePickupController,
    completePickupController,
    requestCompletionOtpController,
} from "../controllers/pickups.controller.js";

import { protect } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";
import { createReceiptLinkController, viewReceiptHtmlController } from "../controllers/receipt.controller.js";
import { downloadPdfController, setPdfDocumentType } from "../controllers/commonPdf.controller.js";
import { previewPickupRoute } from "../controllers/bin-route.controller.js";
import { performance } from "node:perf_hooks";

const router = Router();

// Diagnostic timing for the authenticated pickup-details request. Do not log
// pickup IDs, user IDs, headers, or response bodies.
const timePickupDetailsRequest = (_req, res, next) => {
    const startedAt = performance.now();
    _req.pickupDetailsStartedAt = startedAt;
    res.once("finish", () => {
        console.info(JSON.stringify({
            event: "pickup_details_http",
            durationMs: Number((performance.now() - startedAt).toFixed(1)),
            status: res.statusCode,
            responseBytes: Number(res.getHeader("content-length")) || null,
        }));
    });
    next();
};

router.post("/:id/route-preview", protect, authorize(["PERM_PICKUP_READ"]), previewPickupRoute);

router.get("/:id/receipt.pdf", setPdfDocumentType("pickup-receipt"), downloadPdfController);
router.get("/:id/receipt.html", viewReceiptHtmlController);
router.post("/:id/receipt-link", protect, createReceiptLinkController);

/**
 * @swagger
 * tags:
 *   name: Pickups
 *   description: Waste pickup management APIs
 */

/**
 * @swagger
 * /pickups:
 *   get:
 *     summary: Get all pickups
 *     tags: [Pickups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pickups fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Permission denied
 */
router
    .route("/")
    .get(
        protect,
        authorize(["PERM_PICKUP_READ"]),
        getAllPickupsController
    )

    /**
     * @swagger
     * /pickups:
     *   post:
     *     summary: Create a pickup
     *     tags: [Pickups]
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - customerId
     *               - operatorId
     *               - wasteType
     *               - pickupLocation
     *             properties:
     *               customerId:
     *                 type: string
     *                 example: 6a79dcf8e8c407eefea8f79b
     *               operatorId:
     *                 type: string
     *                 example: 6a79dcf8e8c407eefea8f80
     *               wasteType:
     *                 type: string
     *                 example: Plastic
     *               preferredDate:
     *                 type: string
     *                 format: date-time
     *                 description: Customer's preferred pickup date
     *                 example: 2026-08-27T00:00:00.000Z
     *               weight:
     *                 type: number
     *                 description: Actual measured weight; defaults to 0 when the pickup is requested
     *                 default: 0
     *                 example: 25.5
     *               pickupLocation:
     *                 type: object
     *                 properties:
     *                   coordinates:
     *                     type: array
     *                     items:
     *                       type: number
     *                     example: [76.5207, 10.5276]
     *               amount:
     *                 type: number
     *                 example: 250
     *               notes:
     *                 type: string
     *                 example: Pickup from main gate
     *     responses:
     *       201:
     *         description: Pickup created successfully
     *       401:
     *         description: Authentication required
     *       403:
     *         description: Permission denied
     */
    .post(
        protect,
        authorize(["PERM_PICKUP_CREATE"]),
        createPickupController
    );


/**
 * @swagger
 * /pickups/customer/{id}:
 *   get:
 *     summary: Get pickups by customer
 *     tags: [Pickups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 6a79dcf8e8c407eefea8f79b
 *     responses:
 *       200:
 *         description: Customer pickups fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Permission denied
 */
router.get(
    "/customer/:id",
    protect,
    authorize(["PERM_PICKUP_READ"]),
    getPickupByCustomerIdController
);


/**
 * @swagger
 * /pickups/operator/{id}:
 *   get:
 *     summary: Get pickups assigned to an operator
 *     tags: [Pickups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 6a79dcf8e8c407eefea8f80
 *     responses:
 *       200:
 *         description: Operator pickups fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Permission denied
 */
router.get(
    "/operator/:id",
    protect,
    authorize(["PERM_PICKUP_READ"]),
    getPickupForAgentsController
);


/**
 * @swagger
 * /pickups/status/{status}:
 *   get:
 *     summary: Get pickups by status
 *     tags: [Pickups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum:
 *             - scheduled
 *             - assigned
 *             - in_progress
 *             - completed
 *             - cancelled
 *             - failed
 *             - expired
 *     responses:
 *       200:
 *         description: Pickups fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Permission denied
 */
router.get(
    "/status/:status",
    protect,
    authorize(["PERM_PICKUP_READ"]),
    getPickupsByStatusController
);


/**
 * @swagger
 * /pickups/{id}:
 *   get:
 *     summary: Get pickup by ID
 *     tags: [Pickups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 6a79dcf8e8c407eefea8f79b
 *     responses:
 *       200:
 *         description: Pickup fetched successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Pickup not found
 */
router.get(
    "/:id",
    timePickupDetailsRequest,
    protect,
    authorize(["PERM_PICKUP_READ"]),
    getPickupByIdController
);


/**
 * @swagger
 * /pickups/{id}:
 *   put:
 *     summary: Update pickup
 *     tags: [Pickups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 6a79dcf8e8c407eefea8f79b
 *     responses:
 *       200:
 *         description: Pickup updated successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Permission denied
 */
router.put(
    "/:id",
    protect,
    authorize(["PERM_PICKUP_UPDATE"]),
    updatePickupController
);


/**
 * @swagger
 * /pickups/{id}/cancel:
 *   patch:
 *     summary: Cancel pickup
 *     tags: [Pickups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 6a79dcf8e8c407eefea8f79b
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cancellationReason:
 *                 type: string
 *                 example: Customer requested cancellation
 *     responses:
 *       200:
 *         description: Pickup cancelled successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Permission denied
 */
router.post('/:id/completion-otp', protect, authorize(['PERM_PICKUP_COMPLETE', 'PERM_PICKUP_UPDATE']), requestCompletionOtpController);

router.patch(
    "/:id/cancel",
    protect,
    authorize(["PERM_PICKUP_CANCEL"]),
    cancelPickupController
);


/**
 * @swagger
 * /pickups/{id}/complete:
 *   patch:
 *     summary: Complete pickup
 *     tags: [Pickups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 6a79dcf8e8c407eefea8f79b
 *     responses:
 *       200:
 *         description: Pickup completed successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Permission denied
 */
router.patch(
    "/:id/complete",
    protect,
    authorize(["PERM_PICKUP_COMPLETE", "PERM_PICKUP_UPDATE"]),
    completePickupController
);


/**
 * @swagger
 * /pickups/{id}:
 *   delete:
 *     summary: Delete pickup
 *     tags: [Pickups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 6a79dcf8e8c407eefea8f79b
 *     responses:
 *       200:
 *         description: Pickup deleted successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Permission denied
 */
router.delete(
    "/:id",
    protect,
    authorize(["PERM_PICKUP_DELETE"]),
    deletePickupController
);

export default router;
