import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  pickupId: { type: mongoose.Schema.Types.ObjectId, ref: "Pickup", default: null, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "MonthlyInvoice", default: null, index: true },
  dedupeKey: { type: String, unique: true, sparse: true },
  event: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false, index: true },
}, { timestamps: true });

notificationSchema.set("toJSON", { transform: (_doc, ret) => { ret.id = ret._id.toString(); delete ret._id; delete ret.__v; } });
export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
