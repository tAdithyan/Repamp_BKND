import crypto from "node:crypto";
import WalletTopup from "../models/walletTopup.model.js";
import User from "../models/user.model.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import { notifyInvoiceEvent } from '../services/notification.service.js';

const razorpayKeys = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new ApiError(503, "Online payment is not configured");
  return { keyId, keySecret };
};

export const getWallet = async (req, res, next) => { try {
  const topups = await WalletTopup.find({ userId: req.user._id, status: "paid" })
    .select("amount status razorpayPaymentId paidAt createdAt")
    .sort({ paidAt: -1 })
    .limit(20);
  res.json(new ApiResponse(200, { balance: Number(req.user.wallet || 0), topups }, "Wallet fetched"));
} catch (error) { next(error); } };

export const createWalletTopupOrder = async (req, res, next) => { try {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
    throw new ApiError(400, "Top-up amount must be between ₹1 and ₹1,00,000");
  }
  const roundedAmount = Number(amount.toFixed(2));
  const { keyId, keySecret } = razorpayKeys();
  const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(roundedAmount * 100),
      currency: "INR",
      receipt: `wallet_${String(req.user._id).slice(-8)}_${Date.now()}`.slice(0, 40),
      notes: { purpose: "wallet_topup", userId: String(req.user._id) },
    }),
  });
  const order = await orderResponse.json();
  if (!orderResponse.ok) throw new ApiError(502, order.error?.description || "Unable to create wallet payment order");
  const topup = await WalletTopup.create({ userId: req.user._id, amount: roundedAmount, razorpayOrderId: order.id });
  res.status(201).json(new ApiResponse(201, {
    topupId: topup._id,
    keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    walletBalance: Number(req.user.wallet || 0),
  }, "Wallet payment order created"));
} catch (error) { next(error); } };

export const verifyWalletTopup = async (req, res, next) => { try {
  const { topupId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  const { keySecret } = razorpayKeys();
  const topup = await WalletTopup.findOne({ _id: topupId, userId: req.user._id });
  if (!topup || topup.razorpayOrderId !== razorpay_order_id) throw new ApiError(400, "Wallet payment order is invalid");

  const expected = crypto.createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(String(razorpay_signature || ""));
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new ApiError(400, "Payment signature verification failed");
  }

  if (topup.status === "paid") {
    if (topup.razorpayPaymentId !== razorpay_payment_id) throw new ApiError(409, "This wallet order was already paid");
    const user = await User.findById(req.user._id).select("wallet");
    return res.json(new ApiResponse(200, { balance: Number(user.wallet || 0), topup }, "Wallet already credited"));
  }

  const claimed = await WalletTopup.findOneAndUpdate(
    { _id: topup._id, status: { $in: ["created", "verified"] }, $or: [{ razorpayPaymentId: null }, { razorpayPaymentId: razorpay_payment_id }] },
    { $set: { status: "verified", razorpayPaymentId: razorpay_payment_id } },
    { new: true }
  );
  if (!claimed) throw new ApiError(409, "This wallet payment has already been processed");

  let user = await User.findOneAndUpdate(
    { _id: req.user._id, walletTopupIds: { $ne: topup._id } },
    { $inc: { wallet: topup.amount }, $addToSet: { walletTopupIds: topup._id } },
    { new: true }
  ).select("wallet walletTopupIds");
  if (!user) user = await User.findById(req.user._id).select("wallet walletTopupIds");
  if (!user?.walletTopupIds?.some((id) => String(id) === String(topup._id))) throw new ApiError(500, "Wallet credit could not be verified");

  claimed.status = "paid";
  claimed.paidAt = claimed.paidAt || new Date();
  await claimed.save();
  await notifyInvoiceEvent({ recipientId: req.user._id, event: 'payment_successful', title: 'Wallet top-up successful', message: `₹${Number(claimed.amount).toFixed(2)} was added to your wallet.`, dedupeKey: `wallet-topup:${claimed._id}:payment-successful` });
  res.json(new ApiResponse(200, { balance: Number(user.wallet || 0), topup: claimed }, "Wallet credited successfully"));
} catch (error) { next(error); } };
