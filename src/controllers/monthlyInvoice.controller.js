import MonthlyInvoice from "../models/monthlyInvoice.model.js";
import Pickup from "../models/pickup.modal.js";
import User from "../models/user.model.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import { currentBillingMonth, generateMonthlyInvoices } from "../services/monthlyInvoice.service.js";
import RecurringPickup from "../models/recurringPickup.model.js";
import crypto from "node:crypto";
import { assertInvoiceAccess } from "../utils/monthlyInvoiceAccess.js";
import { notifyInvoiceEvent } from '../services/notification.service.js';

export const listMonthlyInvoices = async (req, res, next) => { try {
  const filter = {};
  if (req.query.contractId) filter.recurringContractId = req.query.contractId;
  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (["ROL_6", "CLIENT_ADMIN"].includes(req.user.role)) {
    const contractIds = await RecurringPickup.find({ $or: [{ clientAdminId: req.user._id }, { customerId: req.user._id }] }).distinct("_id");
    filter.recurringContractId = { $in: contractIds };
  } else if (req.user.role === "ROL_5") {
    filter.customerId = req.user._id;
  }
  const invoices = await MonthlyInvoice.find(filter)
    .populate("customerId", "name phonenumber wallet")
    .populate("recurringContractId", "name ratePerKg")
    .populate("pickupIds", "pickupId preferredDate wasteType weight ratePerKg amount status")
    .sort({ billingMonth: -1 });
  res.json(new ApiResponse(200, invoices, "Monthly invoices fetched"));
} catch (error) { next(error); } };

export const generateInvoices = async (req, res, next) => { try {
  const billingMonth = req.body.billingMonth || currentBillingMonth();
  const result = await generateMonthlyInvoices(billingMonth);
  const generated = result.created + result.updated;
  let message = `${result.created} invoice(s) created and ${result.updated} updated for ${billingMonth}`;
  if (!generated && result.skippedPaid) message = `The ${billingMonth} invoice already exists and is paid`;
  else if (!generated) message = `No completed recurring pickups are available to invoice for ${billingMonth}`;
  res.json(new ApiResponse(200, { generated, billingMonth, ...result }, message));
} catch (error) { next(error); } };

export const payMonthlyInvoice = async (req, res, next) => { try {
  const invoice = await MonthlyInvoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, "Monthly invoice not found");
  await assertInvoiceAccess(req.user, invoice);
  if (invoice.status === "paid") throw new ApiError(400, "Invoice is already paid");
  const method = req.body.paymentMethod === "manual" ? "manual" : "wallet";
  if (method === "wallet") {
    const user = await User.findById(invoice.customerId);
    if (!user) throw new ApiError(404, "Customer not found");
    if (Number(user.wallet || 0) < invoice.totalAmount) {
      await notifyInvoiceEvent({ recipientId: req.user._id, invoiceId: invoice._id, event: 'payment_failed', title: 'Invoice payment failed', message: `There is not enough wallet balance to pay the ${invoice.billingMonth} invoice.` });
      throw new ApiError(400, `Insufficient wallet balance. Required ₹${invoice.totalAmount}, available ₹${user.wallet || 0}`);
    }
    user.wallet = Number((Number(user.wallet) - invoice.totalAmount).toFixed(2));
    await user.save();
  }
  invoice.status = "paid"; invoice.paidAt = new Date(); invoice.paymentMethod = method;
  await invoice.save();
  await Pickup.updateMany({ _id: { $in: invoice.pickupIds } }, { paymentStatus: "paid" });
  await notifyInvoiceEvent({ recipientId: req.user._id, invoiceId: invoice._id, event: 'payment_successful', title: 'Invoice payment successful', message: `Your ${invoice.billingMonth} invoice payment of ₹${Number(invoice.totalAmount).toFixed(2)} was successful.` });
  res.json(new ApiResponse(200, invoice, "Monthly invoice paid successfully"));
} catch (error) { next(error); } };

export const createRazorpayOrder = async (req, res, next) => { try {
  const invoice = await MonthlyInvoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, "Monthly invoice not found");
  await assertInvoiceAccess(req.user, invoice);
  if (invoice.status === "paid") throw new ApiError(400, "Invoice is already paid");
  const keyId = process.env.RAZORPAY_KEY_ID, keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new ApiError(503, "Online payment is not configured");
  const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(invoice.totalAmount * 100),
      currency: "INR",
      receipt: `inv_${String(invoice._id).slice(-20)}`,
      notes: { invoiceId: String(invoice._id), billingMonth: invoice.billingMonth },
    }),
  });
  const order = await orderResponse.json();
  if (!orderResponse.ok) throw new ApiError(502, order.error?.description || "Unable to create Razorpay order");
  invoice.razorpayOrderId = order.id;
  await invoice.save();
  res.json(new ApiResponse(200, { keyId, orderId: order.id, amount: order.amount, currency: order.currency, invoiceId: invoice._id }, "Payment order created"));
} catch (error) { next(error); } };

export const verifyRazorpayPayment = async (req, res, next) => { try {
  const invoice = await MonthlyInvoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, "Monthly invoice not found");
  await assertInvoiceAccess(req.user, invoice);
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  if (!invoice.razorpayOrderId || razorpay_order_id !== invoice.razorpayOrderId) throw new ApiError(400, "Payment order does not match this invoice");
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${invoice.razorpayOrderId}|${razorpay_payment_id}`).digest("hex");
  const expectedBuffer = Buffer.from(expected), receivedBuffer = Buffer.from(String(razorpay_signature || ""));
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) throw new ApiError(400, "Payment signature verification failed");
  invoice.status = "paid"; invoice.paidAt = new Date(); invoice.paymentMethod = "razorpay"; invoice.razorpayPaymentId = razorpay_payment_id;
  await invoice.save();
  await Pickup.updateMany({ _id: { $in: invoice.pickupIds } }, { paymentStatus: "paid" });
  await notifyInvoiceEvent({ recipientId: req.user._id, invoiceId: invoice._id, event: 'payment_successful', title: 'Invoice payment successful', message: `Your ${invoice.billingMonth} invoice payment of ₹${Number(invoice.totalAmount).toFixed(2)} was successful.` });
  res.json(new ApiResponse(200, invoice, "Online payment verified successfully"));
} catch (error) { next(error); } };
