import ApiResponse from "../utils/apiResponse.js";
import ApiError from "../utils/apiError.js";
import { performance } from "node:perf_hooks";
import { requestPickupOtp } from '../services/pickupOtp.service.js';

export const requestCompletionOtpController = async (req, res, next) => {
    try {
        const result = await requestPickupOtp(req.params.id, req.user);
        res.json(new ApiResponse(200, result, result.deliveryMode === 'console' ? 'Pickup OTP generated; check the backend console' : 'OTP sent to the customer'));
    } catch (error) { next(error); }
};

import {
    getAllPickups,
    getPickupById,
    getPickupByCustomerId,
    getPickupForAgents,
    getpickupsByStatus,
    createPickup,
    updatePickup,
    cancelPickup,
    deletePickup,
    completePickup,
} from "../services/pickup.service.js";

// ----------------------------------------
// Get all pickups
// GET /pickups
// ----------------------------------------
export const getAllPickupsController = async (req, res, next) => {
    try {
        const pickups = await getAllPickups(req.user, {
            page: req.query.page,
            limit: req.query.limit,
            status: req.query.status,
            search: req.query.search,
            preferredDate: req.query.preferredDate,
        });

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    pickups,
                    "Pickups fetched successfully"
                )
            );
    } catch (error) {
        next(error);
    }
};

// ----------------------------------------
// Get pickup by ID
// GET /pickups/:id
// ----------------------------------------
export const getPickupByIdController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const serviceStartedAt = performance.now();
        const pickup = await getPickupById(id, req.user);
        console.info(JSON.stringify({
            event: "pickup_details_query_and_population",
            durationMs: Number((performance.now() - serviceStartedAt).toFixed(1)),
            authAndPermissionMs: req.pickupDetailsStartedAt
                ? Number((serviceStartedAt - req.pickupDetailsStartedAt).toFixed(1))
                : null,
            found: Boolean(pickup),
        }));

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    pickup,
                    "Pickup fetched successfully"
                )
            );
    } catch (error) {
        next(error);
    }
};

// ----------------------------------------
// Get pickups by customer
// GET /pickups/customer/:id
// ----------------------------------------
export const getPickupByCustomerIdController = async (
    req,
    res,
    next
) => {
    try {
        const { id } = req.params;

        const pickups = await getPickupByCustomerId(id);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    pickups,
                    "Customer pickups fetched successfully"
                )
            );
    } catch (error) {
        next(error);
    }
};

// ----------------------------------------
// Get pickups by operator
// GET /pickups/operator/:id
// ----------------------------------------
export const getPickupForAgentsController = async (
    req,
    res,
    next
) => {
    try {
        const { id } = req.params;

        const pickups = await getPickupForAgents(id);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    pickups,
                    "Operator pickups fetched successfully"
                )
            );
    } catch (error) {
        next(error);
    }
};

// ----------------------------------------
// Get pickups by status
// GET /pickups/status/:status
// ----------------------------------------
export const getPickupsByStatusController = async (
    req,
    res,
    next
) => {
    try {
        const { status } = req.params;

        const pickups = await getpickupsByStatus(status);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    pickups,
                    "Pickups fetched successfully by status"
                )
            );
    } catch (error) {
        next(error);
    }
};

// ----------------------------------------
// Create pickup
// POST /pickups
// ----------------------------------------
export const createPickupController = async (req, res, next) => {
    try {
        const customerId = req.user?._id;
        if (!customerId) throw new ApiError(401, "Unauthorized");

        const pickup = await createPickup({ ...req.body, customerId });

        return res
            .status(201)
            .json(
                new ApiResponse(
                    201,
                    pickup,
                    "Pickup created successfully"
                )
            );
    } catch (error) {
        next(error);
    }
};

// ----------------------------------------
// Update pickup
// PATCH /pickups/:id
// ----------------------------------------
export const updatePickupController = async (req, res, next) => {
    try {
        const { id } = req.params;

        const pickup = await updatePickup(id, req.body);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    pickup,
                    "Pickup updated successfully"
                )
            );
    } catch (error) {
        next(error);
    }
};

// ----------------------------------------
// Cancel pickup
// PATCH /pickups/:id/cancel
// ----------------------------------------
export const cancelPickupController = async (req, res, next) => {
    try {
        const { id } = req.params;

        const pickup = await cancelPickup(id, req.body);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    pickup,
                    "Pickup cancelled successfully"
                )
            );
    } catch (error) {
        next(error);
    }
};

// ----------------------------------------
// Complete pickup
// PATCH /pickups/:id/complete
// ----------------------------------------
export const completePickupController = async (
    req,
    res,
    next
) => {
    try {
        const { id } = req.params;

        const result = await completePickup(id, req.body, req.user);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    result,
                    "Pickup completed successfully"
                )
            );
    } catch (error) {
        next(error);
    }
};

// ----------------------------------------
// Delete pickup
// DELETE /pickups/:id
// ----------------------------------------
export const deletePickupController = async (req, res, next) => {
    try {
        const { id } = req.params;

        const pickup = await deletePickup(id);

        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    pickup,
                    "Pickup deleted successfully"
                )
            );
    } catch (error) {
        next(error);
    }
};
