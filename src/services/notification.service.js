import Notification from '../models/notification.model.js';
import PushDevice from '../models/pushDevice.model.js';
import User from '../models/user.model.js';
import { queuePushForNotification } from './expoPush.service.js';

async function persistAndDispatch({ recipientId, pickupId = null, invoiceId = null, event, title, message, dedupeKey }) {
  if (!recipientId || !event || !title || !message) return null;
  const relatedId = pickupId || invoiceId || 'none';
  const stableKey = dedupeKey || `${recipientId}:${event}:${relatedId}`;
  let notification;
  try {
    notification = await Notification.findOneAndUpdate(
      { dedupeKey: stableKey },
      { $setOnInsert: { recipientId, pickupId, invoiceId, event, title: String(title).slice(0, 120), message: String(message).slice(0, 500), dedupeKey: stableKey } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    notification = await Notification.findOne({ dedupeKey: stableKey });
  }
  if (notification) void queuePushForNotification(notification).catch((error) => console.warn('[push] delivery queue could not be prepared', error?.name || 'Error'));
  return notification || null;
}

// Notification history persists synchronously; Expo network delivery runs separately and never blocks a business workflow.
const safeNotify = (event) => persistAndDispatch(event).catch((error) => {
  console.warn('[notifications] event could not be persisted', error?.name || 'Error');
  return null;
});
export const notifyPickupEvent = safeNotify;

export const notifyInvoiceEvent = safeNotify;

export const notifyUsersEvent = ({ recipientIds = [], ...event }) => Promise.all(
  [...new Set(recipientIds.map((id) => String(id)).filter(Boolean))].map((recipientId) => safeNotify({ ...event, dedupeKey: event.dedupeKey ? `${event.dedupeKey}:${recipientId}` : undefined, recipientId })),
);

export const notifyRoleEvent = async ({ role, ...event }) => {
  try {
    const recipients = await User.find({ role, is_active: true }).select('_id').lean();
    return await notifyUsersEvent({ ...event, recipientIds: recipients.map((user) => user._id), dedupeKey: `${event.dedupeKey || `${event.event}:${event.pickupId || event.invoiceId}`}:recipient` });
  } catch (error) {
    console.warn('[notifications] role notification could not be prepared', error?.name || 'Error');
    return [];
  }
};

export async function registerPushDevice(userId, input) {
  const { expoPushToken, deviceId, platform, deviceName = '' } = input;
  if (typeof expoPushToken !== 'string' || !/^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(expoPushToken)) {
    const error = new Error('A valid Expo push token is required'); error.statusCode = 400; throw error;
  }
  if (typeof deviceId !== 'string' || !/^[a-f0-9-]{36}$/i.test(deviceId)) {
    const error = new Error('A valid device identifier is required'); error.statusCode = 400; throw error;
  }
  if (!['android', 'ios'].includes(platform)) {
    const error = new Error('Push notifications are supported on Android and iOS devices'); error.statusCode = 400; throw error;
  }

  await PushDevice.updateMany({ deviceId, userId: { $ne: userId }, isActive: true }, { $set: { isActive: false } });
  await PushDevice.updateMany({ userId, deviceId, expoPushToken: { $ne: expoPushToken }, isActive: true }, { $set: { isActive: false } });
  const device = await PushDevice.findOneAndUpdate(
    { expoPushToken },
    { $set: { userId, deviceId, platform, deviceName: String(deviceName).slice(0, 120), isActive: true, lastSeenAt: new Date(), lastRegisteredAt: new Date() } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return { registered: true, deviceId: device.deviceId };
}

export async function unregisterPushDevice(userId, deviceId) {
  await PushDevice.updateMany({ userId, deviceId }, { $set: { isActive: false } });
  return { removed: true };
}

export const getUserNotifications = async (recipientId, page = 1, limit = 50) => {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
  const filter = { recipientId };
  const [items, total] = await Promise.all([
    Notification.find(filter).populate('pickupId', 'pickupId status wasteType').populate('invoiceId', 'billingMonth status totalAmount')
      .sort({ createdAt: -1, _id: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit),
    Notification.countDocuments(filter),
  ]);
  return { items, total, page: safePage, limit: safeLimit, hasMore: safePage * safeLimit < total };
};

export const markNotificationRead = (id, recipientId) => Notification.findOneAndUpdate({ _id: id, recipientId }, { isRead: true }, { new: true });
export const markAllNotificationsRead = (recipientId) => Notification.updateMany({ recipientId, isRead: false }, { isRead: true });
