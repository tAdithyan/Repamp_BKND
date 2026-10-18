import mongoose from 'mongoose';

const pushDeviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deviceId: { type: String, required: true },
  expoPushToken: { type: String, required: true, unique: true },
  platform: { type: String, enum: ['android', 'ios'], required: true },
  deviceName: { type: String, maxlength: 120, default: '' },
  isActive: { type: Boolean, default: true, index: true },
  lastRegisteredAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

pushDeviceSchema.index({ userId: 1, deviceId: 1 });
pushDeviceSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.expoPushToken; delete ret.__v; return ret; } });

export default mongoose.models.PushDevice || mongoose.model('PushDevice', pushDeviceSchema);
