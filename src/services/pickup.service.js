import Pickup from "../models/pickup.modal.js";
import { randomUUID } from 'node:crypto';
import { assertOtpPickup, verifyPickupOtp } from './pickupOtp.service.js';
import User from "../models/user.model.js";
import { ACTIVE_PICKUP_STATUSES, ACTIVE_PICKUP_MESSAGE } from '../constants/pickup-status.js';
import WastePrice from "../models/wastePrice.model.js";
import ApiError from "../utils/apiError.js";
import { notifyPickupEvent, notifyRoleEvent } from "./notification.service.js";
import { assertPickupDistrictServiceable } from './serviceArea.service.js';
import { performance } from 'node:perf_hooks';

const GST_RATE = 18;
const calculateCharge = (weight, ratePerKg) => {
    const taxableAmount = Number((weight * ratePerKg).toFixed(2));
    const gstAmount = Number((taxableAmount * GST_RATE / 100).toFixed(2));
    return { taxableAmount, gstAmount, totalAmount: Number((taxableAmount + gstAmount).toFixed(2)) };
};
export const getAllPickups = async (user = null, filters = {}) => {
    try {
        const scopeQuery = {};
        if (["ROL_6", "CLIENT_ADMIN"].includes(user?.role)) {
            const RecurringPickup = (await import("../models/recurringPickup.model.js")).default;
            scopeQuery.recurringContractId = { $in: await RecurringPickup.find({ $or: [{ clientAdminId: user._id }, { customerId: user._id }] }).distinct("_id") };
        }
        const query = { ...scopeQuery };
        if (filters.status && filters.status !== 'all') query.status = filters.status;
        if (filters.preferredDate?.trim()) {
            const preferredDate = filters.preferredDate.trim();
            const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(preferredDate);
            if (!dateParts) throw new ApiError(400, 'Preferred date must use YYYY-MM-DD format.');
            const [, yearText, monthText, dayText] = dateParts;
            const year = Number(yearText);
            const month = Number(monthText);
            const day = Number(dayText);
            const calendarDate = new Date(Date.UTC(year, month - 1, day));
            if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) {
                throw new ApiError(400, 'Preferred date must be a valid calendar date.');
            }
            // Preferred dates are calendar dates in the app's India timezone (UTC+05:30).
            const start = new Date(Date.UTC(year, month - 1, day) - (5 * 60 + 30) * 60 * 1000);
            query.preferredDate = { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
        }
        if (filters.search?.trim()) {
            const search = new RegExp(filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            const customerIds = await User.find({ $or: [{ name: search }, { phonenumber: search }] }).distinct('_id');
            query.$or = [{ pickupId: search }, { wasteType: search }, { customerId: { $in: customerIds } }];
        }

        const paginated = filters.page !== undefined || filters.limit !== undefined;
        const findPickups = () => Pickup.find(query)
            .populate("customerId operatorId")
            .populate("recurringContractId", "name collectionDays preferredTime ratePerKg address");
        if (paginated) {
            const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
            const limit = Math.min(100, Math.max(1, Number.parseInt(filters.limit, 10) || 10));
            const [items, total, allTotal, scheduled, assigned] = await Promise.all([
                findPickups().sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
                Pickup.countDocuments(query),
                Pickup.countDocuments(scopeQuery),
                Pickup.countDocuments({ ...scopeQuery, status: 'scheduled' }),
                Pickup.countDocuments({ ...scopeQuery, status: 'assigned' }),
            ]);
            return { items, total, page, limit, totalPages: Math.ceil(total / limit), counts: { total: allTotal, scheduled, assigned } };
        }

        return findPickups().sort({ createdAt: -1, _id: -1 });
    } catch (error) {
        throw error;

    }
}



export const buildPickupDetailsFilter = (id, user, clientContractIds = []) => {
    const filter = { _id: id };
    const role = String(user?.role || "");
    const userId = user?._id;
    if (userId && ["ROL_5", "User"].includes(role)) filter.customerId = userId;
    else if (userId && ["ROL_4", "CollectionAgent"].includes(role)) filter.operatorId = userId;
    else if (userId && ["ROL_6", "CLIENT_ADMIN"].includes(role)) {
        filter.recurringContractId = { $in: clientContractIds };
    }
    return filter;
};

export const getPickupById = async (id, user = null) => {
    try {
        let clientAdminScopeMs = 0;
        const role = String(user?.role || "");
        const userId = user?._id;
        let clientContractIds = [];
        if (userId && ["ROL_6", "CLIENT_ADMIN"].includes(role)) {
            const scopeStartedAt = performance.now();
            const RecurringPickup = (await import("../models/recurringPickup.model.js")).default;
            clientContractIds = await RecurringPickup.find({
                $or: [{ clientAdminId: userId }, { customerId: userId }],
            }).distinct("_id");
            clientAdminScopeMs = Number((performance.now() - scopeStartedAt).toFixed(1));
        }
        const filter = buildPickupDetailsFilter(id, user, clientContractIds);

        const lookupStartedAt = performance.now();
        const pickup = await Pickup.findOne(filter).exec();
        const lookupMs = Number((performance.now() - lookupStartedAt).toFixed(1));

        const populationStartedAt = performance.now();
        if (pickup) {
            await pickup.populate([
                { path: "customerId" },
                { path: "operatorId" },
                { path: "recurringContractId", select: "name collectionDays preferredTime ratePerKg address" },
            ]);
        }
        console.info(JSON.stringify({
            event: "pickup_details_database",
            clientAdminScopeMs,
            lookupMs,
            populationMs: Number((performance.now() - populationStartedAt).toFixed(1)),
            found: Boolean(pickup),
        }));
        return pickup;
    } catch (error) {
        throw error;

    }
}



export const getPickupByCustomerId = async (id) => {
    try {
        const pickup = await Pickup.find({ customerId: id })
            .populate("customerId operatorId")
            .populate("recurringContractId", "name collectionDays preferredTime ratePerKg address");
        return pickup;
    } catch (error) {
        throw error;

    }
}

export const getPickupForAgents = async (id) => {
    try {
        const pickup = await Pickup.find({ operatorId: id })
            .populate("customerId operatorId")
            .populate("recurringContractId", "name collectionDays preferredTime ratePerKg address");
        return pickup;
    } catch (error) {
        throw error;

    }
}


export const getpickupsByStatus = async (status) => {
    try {
        const pickup = await Pickup.find({ status }).populate("customerId operatorId");
        return pickup;
    } catch (error) {
        throw error;

    }
}



export const createPickup = async (data) => {
    try {
        const active = await Pickup.exists({ customerId: data.customerId, status: { $in: ACTIVE_PICKUP_STATUSES } });
        if (active) throw new ApiError(409, ACTIVE_PICKUP_MESSAGE);
        const coordinates = data.pickupLocation?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length !== 2) throw new ApiError(400, 'A valid pickup location is required.');
        await assertPickupDistrictServiceable(coordinates[0], coordinates[1]);
        let pickup;
        try {
            pickup = await Pickup.create({ ...data, customerRequest: true, status: 'scheduled', recurringContractId: null, completionLockId: null });
        } catch (error) {
            if (error.code === 11000 && (error.keyPattern?.customerId || error.message?.includes('one_active_customer_request'))) throw new ApiError(409, ACTIVE_PICKUP_MESSAGE);
            throw error;
        }
        await notifyPickupEvent({ recipientId: pickup.customerId, pickupId: pickup._id, event: "pickup_scheduled", title: "Pickup scheduled", message: `${pickup.pickupId} was scheduled successfully.` });
        return pickup;
    } catch (error) {
        throw error;

    }
}


export const updatePickup = async (id, data) => {
    try {
        const updateData = { ...data };
        delete updateData.completedAt;
        delete updateData.completionLockId;
        if (Object.keys(data).some(key => key.startsWith('$') || key.includes('.'))) throw new ApiError(400, 'Invalid pickup update');
        if (data.status === 'completed') throw new ApiError(403, 'Use the complete pickup action to complete this pickup.');
        delete updateData.recurringContractId;
        delete updateData.recurringGenerationKey;
        delete updateData.customerRequest;
        delete updateData.customerId;
        const existingPickup = await Pickup.findById(id);
        if (!existingPickup) throw new ApiError(404, "Pickup not found");

        if (data.weight !== undefined) {
            const weight = Number(data.weight);
            if (!Number.isFinite(weight) || weight < 0) {
                throw new ApiError(400, "Weight must be a valid positive number");
            }

            const wasteType = data.wasteType || existingPickup.wasteType;
            const categoryPrice = await WastePrice.findOne({ category: wasteType });
            const pricePerKg = existingPickup.ratePerKg ?? categoryPrice?.pricePerKg;
            if (pricePerKg == null) {
                throw new ApiError(400, `Price per kg is not configured for ${wasteType}`);
            }

            updateData.weight = weight;
            const charge = calculateCharge(weight, pricePerKg);
            updateData.amount = charge.totalAmount;
            updateData.taxableAmount = charge.taxableAmount;
            updateData.gstAmount = charge.gstAmount;
            updateData.gstRate = GST_RATE;
        }

        const pickup = await Pickup.findOneAndUpdate({ _id: id, completionLockId: null }, updateData, { new: true, runValidators: true });
        if (!pickup) throw new ApiError(409, 'Pickup completion is already being processed.');
        const customerId = existingPickup.customerId;
        if (String(existingPickup.operatorId || '') !== String(pickup.operatorId || '')) {
            const assigned = Boolean(pickup.operatorId);
            const assignmentMessage = assigned
                ? `A collection agent was assigned to ${pickup.pickupId}.`
                : `The collection agent assigned to ${pickup.pickupId} was removed.`;
            await Promise.all([
                notifyPickupEvent({ recipientId: customerId, pickupId: pickup._id, event: assigned ? "operator_assigned" : "operator_unassigned", title: assigned ? "Operator assigned" : "Operator assignment removed", message: assignmentMessage, dedupeKey: `${pickup._id}:operator-assignment:${pickup.operatorId || 'none'}` }),
                pickup.operatorId ? notifyPickupEvent({ recipientId: pickup.operatorId, pickupId: pickup._id, event: "pickup_assigned", title: "New pickup assigned", message: `${pickup.pickupId} has been assigned to you.`, dedupeKey: `${pickup._id}:pickup-assigned:${pickup.operatorId}` }) : Promise.resolve(),
                existingPickup.operatorId ? notifyPickupEvent({ recipientId: existingPickup.operatorId, pickupId: pickup._id, event: "pickup_assignment_changed", title: "Pickup reassigned", message: `${pickup.pickupId} is no longer assigned to you.`, dedupeKey: `${pickup._id}:pickup-unassigned:${existingPickup.operatorId}:${pickup.operatorId || 'none'}` }) : Promise.resolve(),
            ]);
        }
        if (data.status === "on_the_way" && existingPickup.status !== "on_the_way") await notifyPickupEvent({ recipientId: customerId, pickupId: pickup._id, event: "operator_on_the_way", title: "Operator on the way", message: `Your agent is travelling to pickup ${pickup.pickupId}.` });
        if (data.status === "in_progress" && existingPickup.status !== "in_progress") await notifyPickupEvent({ recipientId: customerId, pickupId: pickup._id, event: "pickup_started", title: "Pickup started", message: `Collection has started for ${pickup.pickupId}.` });
        if (data.weight !== undefined && Number(data.weight) > 0 && Number(existingPickup.weight || 0) !== Number(data.weight)) await notifyPickupEvent({ recipientId: customerId, pickupId: pickup._id, event: "weight_recorded", title: "Waste weight recorded", message: `${Number(data.weight).toFixed(2)} kg was recorded for ${pickup.pickupId}.` });
        if (data.status === 'failed' && existingPickup.status !== 'failed') {
            const reason = String(data.failureReason || data.notes || '').trim();
            const message = `${pickup.pickupId} could not be collected${reason ? `: ${reason}` : '.'}`;
            await Promise.all([
                notifyPickupEvent({ recipientId: customerId, pickupId: pickup._id, event: 'pickup_failed', title: 'Pickup could not be completed', message, dedupeKey: `${pickup._id}:failed:${pickup.updatedAt?.getTime()}` }),
                pickup.operatorId ? notifyPickupEvent({ recipientId: pickup.operatorId, pickupId: pickup._id, event: 'pickup_failed', title: 'Pickup marked failed', message, dedupeKey: `${pickup._id}:failed:${pickup.operatorId}:${pickup.updatedAt?.getTime()}` }) : Promise.resolve(),
                notifyRoleEvent({ role: 'ROL_1', pickupId: pickup._id, event: 'pickup_failed', title: 'Pickup failure needs review', message, dedupeKey: `${pickup._id}:failed:admin:${pickup.updatedAt?.getTime()}` }),
            ]);
        }
        return pickup;
    } catch (error) {
        throw error;

    }
}



export const cancelPickup = async (id, data) => {
    try {
        const existing = await Pickup.findById(id);
        if (!existing) throw new ApiError(404, 'Pickup not found');
        const pickup = await Pickup.findOneAndUpdate({ _id: id, completionLockId: null }, { status: "cancelled", cancellationReason: data.cancellationReason }, { new: true });
        if (!pickup) throw new ApiError(409, 'Pickup is unavailable or completion is being processed.');
        const reason = String(data.cancellationReason || '').trim();
        const message = `${pickup.pickupId} was cancelled${reason ? `: ${reason}` : '.'}`;
        await Promise.all([
            notifyPickupEvent({ recipientId: existing.customerId, pickupId: pickup._id, event: 'pickup_cancelled', title: 'Pickup cancelled', message }),
            existing.operatorId ? notifyPickupEvent({ recipientId: existing.operatorId, pickupId: pickup._id, event: 'pickup_cancelled', title: 'Pickup assignment cancelled', message }) : Promise.resolve(),
        ]);
        return pickup;
    } catch (error) {
        throw error;

    }
}



export const deletePickup = async (id) => {
    try {
        const pickup = await Pickup.findOneAndDelete({ _id: id, completionLockId: null });
        if (!pickup) throw new ApiError(409, 'Pickup is unavailable or completion is being processed.');
        return pickup;
    } catch (error) {
        throw error;

    }
}




export const completePickup = async (id, data, actor) => {
    const candidate = await Pickup.findById(id);
    assertOtpPickup(candidate, actor);
    const lockId = randomUUID();
    const locked = await Pickup.findOneAndUpdate({ _id: id, operatorId: actor._id, status: 'in_progress', completionLockId: null }, { $set: { completionLockId: lockId } }, { new: true });
    if (!locked) throw new ApiError(409, 'Pickup changed or completion is already being processed. Refresh and retry.');
    try {
        assertOtpPickup(locked, actor);
        if (!locked.recurringContractId) await verifyPickupOtp(locked, actor, data?.otp);
        return await completeVerifiedPickup(id);
    } finally {
        await Pickup.updateOne({ _id: id, completionLockId: lockId }, { $unset: { completionLockId: 1 } });
    }
};

const completeVerifiedPickup = async (id) => {
    try {
        const pickup = await Pickup.findById(id);
        if (!pickup) throw new ApiError(404, "Pickup not found");
        if (pickup.status === "completed") throw new ApiError(400, "Pickup is already completed");
        if (!pickup.weight || pickup.weight <= 0) throw new ApiError(400, "Pickup weight is required before completion");

        const categoryPrice = await WastePrice.findOne({ category: pickup.wasteType });
        const pricePerKg = pickup.ratePerKg ?? categoryPrice?.pricePerKg;
        if (pricePerKg == null) throw new ApiError(400, `Price per kg is not configured for ${pickup.wasteType}`);

        const charge = calculateCharge(pickup.weight, pricePerKg);
        const amount = charge.totalAmount;
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new ApiError(400, "Calculated pickup amount must be greater than zero");
        }
        const user = await User.findById(pickup.customerId);
        if (!user) throw new ApiError(404, "Customer not found");
        if (pickup.recurringContractId) {
            pickup.amount = amount;
            pickup.taxableAmount = charge.taxableAmount;
            pickup.gstAmount = charge.gstAmount;
            pickup.gstRate = GST_RATE;
            pickup.status = "completed";
            pickup.completedAt = new Date();
            pickup.paymentStatus = "accrued";
            await pickup.save();
            await Promise.all([
                notifyPickupEvent({ recipientId: user._id, pickupId: pickup._id, event: "pickup_completed", title: "Pickup completed", message: `${pickup.pickupId} was completed successfully. Collected weight: ${Number(pickup.weight).toFixed(2)} kg.` }),
            ]);
            return {
                status: 200,
                data: {
                    message: "Recurring pickup completed. It will be included in the month-end invoice, including 18% GST.",
                    pickup,
                    user,
                    pricePerKg,
                    invoiceAmount: amount,
                    taxableAmount: charge.taxableAmount,
                    gstAmount: charge.gstAmount,
                    paymentDeferred: true,
                }
            };
        }
        const walletBalance = Number(user.wallet || 0);
        if (walletBalance < amount) {
            await notifyPickupEvent({ recipientId: user._id, pickupId: pickup._id, event: "payment_overdue", title: "Payment overdue", message: `Add ₹${Number((amount - walletBalance).toFixed(2))} to your wallet to complete payment for ${pickup.pickupId}.` });
            throw new ApiError(400, `Insufficient wallet balance. Required ₹${amount}, available ₹${walletBalance}`);
        }

        const newWalletBalance = Number((walletBalance - amount).toFixed(2));
        const debitResult = await User.updateOne(
            { _id: user._id },
            { $set: { wallet: newWalletBalance } },
            { runValidators: true }
        );
        if (debitResult.matchedCount !== 1) {
            throw new ApiError(500, "Customer wallet debit failed");
        }
        const updatedUser = await User.findById(user._id);
        if (!updatedUser || Number(updatedUser.wallet) !== newWalletBalance) {
            throw new ApiError(500, "Customer wallet debit could not be verified");
        }
        pickup.amount = amount;
        pickup.taxableAmount = charge.taxableAmount;
        pickup.gstAmount = charge.gstAmount;
        pickup.gstRate = GST_RATE;
        pickup.status = "completed";
        pickup.completedAt = new Date();
        pickup.paymentStatus = "paid";
        await pickup.save();
        await Promise.all([
            notifyPickupEvent({ recipientId: user._id, pickupId: pickup._id, event: "pickup_completed", title: "Pickup completed", message: `${pickup.pickupId} was completed successfully. Collected weight: ${Number(pickup.weight).toFixed(2)} kg.` }),
            notifyPickupEvent({ recipientId: user._id, pickupId: pickup._id, event: "bill_generated", title: "Bill generated", message: `A bill of ₹${amount.toFixed(2)} (including 18% GST) was generated for ${pickup.pickupId}.` }),
            notifyPickupEvent({ recipientId: user._id, pickupId: pickup._id, event: "payment_successful", title: "Payment successful", message: `₹${amount.toFixed(2)} was paid from your wallet.` }),
        ]);
        return {
            status: 200,
            data: {
                message: "Pickup completed",
                pickup,
                user: updatedUser,
                pricePerKg,
                chargedAmount: amount,
                taxableAmount: charge.taxableAmount,
                gstAmount: charge.gstAmount,
                walletBalance: updatedUser.wallet
            }
        }

    } catch (error) {
        throw error;

    }
}
// export const getPickupbyUser = async (id) =>{
//     try {
//          const pickups = await Pickup.findById)








//     } catch (error) {
        
//     }
// } 



