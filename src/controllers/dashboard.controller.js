import Bin from "../models/bin.model.js";
import MonthlyInvoice from "../models/monthlyInvoice.model.js";
import Pickup from "../models/pickup.modal.js";
import RecurringPickup from "../models/recurringPickup.model.js";
import Shift from "../models/shift.model.js";
import User from "../models/user.model.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";

const istMonthRange = (month) => {
  if (!month) return null;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ApiError(400, 'Select a valid month in YYYY-MM format');
  }
  const [year, monthNumber] = month.split('-').map(Number);
  const istOffsetMs = 330 * 60 * 1000;
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1) - istOffsetMs),
    end: new Date(Date.UTC(year, monthNumber, 1) - istOffsetMs),
  };
};

export const getOperationsDashboard = async (req, res, next) => {
  try {
    const isAgent = req.user.role === "ROL_4";
    const isAdmin = ["ROL_1", "ROL_2", "SuperAdmin", "Admin"].includes(req.user.role);
    const pickupFilter = isAgent ? { operatorId: req.user._id } : {};
    const monthRange = istMonthRange(req.query.month);
    const dashboardPickupFilter = monthRange
      ? { ...pickupFilter, preferredDate: { $gte: monthRange.start, $lt: monthRange.end } }
      : pickupFilter;
    const binFilter = isAgent ? { assignedAgent: req.user._id } : {};
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    // Aggregate on MongoDB instead of downloading every user, pickup, bin and invoice
    // and calculating dashboard totals in the Node process.
    const [userGroups, pickupGroups, binGroups, activeContracts, invoiceGroups, pendingInvoices, activeShifts, monthly, recentPickups] = await Promise.all([
      isAgent ? [] : User.aggregate([
        { $group: { _id: "$role", total: { $sum: 1 }, active: { $sum: { $cond: [{ $ne: ["$is_active", false] }, 1, 0] } } } },
      ]),
      Pickup.aggregate([
        { $match: dashboardPickupFilter },
        { $group: { _id: "$status", count: { $sum: 1 }, weight: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, { $ifNull: ["$weight", 0] }, 0] } }, amount: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, { $ifNull: ["$amount", 0] }, 0] } } } },
      ]),
      Bin.aggregate([
        { $match: binFilter },
        { $group: { _id: "$status", count: { $sum: 1 }, assigned: { $sum: { $cond: [{ $ne: ["$assignedAgent", null] }, 1, 0] } } } },
      ]),
      isAgent ? 0 : RecurringPickup.countDocuments({ isActive: true }),
      isAgent ? [] : MonthlyInvoice.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: { $ifNull: ["$totalAmount", 0] } } } },
      ]),
      isAdmin ? MonthlyInvoice.find({ status: { $in: ["issued", "overdue"] } })
        .select("billingMonth status totalAmount dueDate customerId recurringContractId")
        .populate("customerId", "name")
        .populate("recurringContractId", "name")
        .sort({ dueDate: 1, issuedAt: 1 })
        .limit(5)
        .lean() : [],
      Shift.countDocuments(isAgent ? { agentId: req.user._id, status: "active" } : { status: "active" }),
      Pickup.aggregate([
        { $match: { ...pickupFilter, status: "completed", preferredDate: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: "$preferredDate" }, month: { $month: "$preferredDate" } }, weight: { $sum: "$weight" }, amount: { $sum: "$amount" }, collections: { $sum: 1 } } },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
      Pickup.find(dashboardPickupFilter).select("pickupId customerId wasteType status amount createdAt")
        .populate("customerId", "name")
        .sort({ createdAt: -1 }).limit(7).lean(),
    ]);

    const statusCounts = Object.fromEntries(pickupGroups.map(({ _id, count }) => [_id, count]));
    const pickupTotals = pickupGroups.reduce((totals, group) => ({
      total: totals.total + group.count,
      totalWeight: totals.totalWeight + group.weight,
      totalAmount: totals.totalAmount + group.amount,
    }), { total: 0, totalWeight: 0, totalAmount: 0 });
    const openStatuses = ["scheduled", "assigned", "on_the_way", "in_progress"];
    const bins = binGroups.reduce((totals, group) => ({
      total: totals.total + group.count,
      pending: totals.pending + (group._id === "Pending" ? group.count : 0),
      collected: totals.collected + (group._id === "Collected" ? group.count : 0),
      assigned: totals.assigned + group.assigned,
    }), { total: 0, pending: 0, collected: 0, assigned: 0 });
    const invoices = invoiceGroups.reduce((totals, group) => {
      if (group._id === "paid") totals.paid = group.count;
      if (!["paid", "cancelled"].includes(group._id)) {
        totals.unpaid += group.count;
        totals.outstanding += group.amount;
      }
      return totals;
    }, { unpaid: 0, paid: 0, outstanding: 0 });
    const users = userGroups.reduce((totals, group) => ({
      total: totals.total + group.total,
      active: totals.active + group.active,
      customers: totals.customers + (["ROL_5", "ROL_6"].includes(group._id) ? group.total : 0),
      agents: totals.agents + (group._id === "ROL_4" ? group.total : 0),
    }), { total: 0, active: 0, customers: 0, agents: 0 });

    const monthlyMap = new Map(monthly.map((item) => [`${item._id.year}-${String(item._id.month).padStart(2, "0")}`, item]));
    const monthlyTrend = Array.from({ length: 6 }, (_, offset) => {
      const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - offset));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const item = monthlyMap.get(key);
      return { month: key, weight: Number((item?.weight || 0).toFixed(2)), amount: Number((item?.amount || 0).toFixed(2)), collections: item?.collections || 0 };
    });

    const data = {
      users,
      pickups: {
        ...pickupTotals,
        totalWeight: Number(pickupTotals.totalWeight.toFixed(2)),
        totalAmount: Number(pickupTotals.totalAmount.toFixed(2)),
        open: openStatuses.reduce((sum, status) => sum + (statusCounts[status] || 0), 0),
        completed: statusCounts.completed || 0,
        cancelled: statusCounts.cancelled || 0,
        statuses: statusCounts,
      },
      bins,
      recurring: { active: activeContracts },
      billing: {
        ...invoices,
        outstanding: Number(invoices.outstanding.toFixed(2)),
        pendingInvoices: isAdmin ? pendingInvoices : [],
      },
      activeShifts,
      monthlyTrend,
      recentPickups,
    };
    res.json(new ApiResponse(200, data, "Operations dashboard fetched"));
  } catch (error) { next(error); }
};
