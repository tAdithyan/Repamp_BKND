import mongoose from 'mongoose';

const pushDeliverySchema = new mongoose.Schema({
  notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PushDevice', required: true },
  status: { type: String, enum: ['queued', 'sending', 'ticketed', 'delivered', 'failed'], default: 'queued', index: true },
  ticketId: { type: String, default: null },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  receiptCheckedAt: { type: Date, default: null },
  lastError: { type: String, default: null },
}, { timestamps: true });

pushDeliverySchema.index({ notificationId: 1, deviceId: 1 }, { unique: true });
pushDeliverySchema.index({ ticketId: 1 }, { unique: true, sparse: true });
pushDeliverySchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

export default mongoose.models.PushDelivery || mongoose.model('PushDelivery', pushDeliverySchema);
