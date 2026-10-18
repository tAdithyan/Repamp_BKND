import PushDelivery from '../models/pushDelivery.model.js';
import PushDevice from '../models/pushDevice.model.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_ATTEMPTS = 6;
let dispatching = false;
let checkingReceipts = false;

const logFailure = (operation, error) => {
  console.warn(`[push] ${operation} failed`, error?.name || 'Error');
};
const retryAt = (attempt) => new Date(Date.now() + Math.min(60 * 60_000, 15_000 * 2 ** Math.max(0, attempt - 1)));

async function expoRequest(url, payload) {
  const headers = { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Expo push returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function deactivateDevice(deviceId) {
  if (deviceId) await PushDevice.updateOne({ _id: deviceId }, { $set: { isActive: false } });
}

async function claimDelivery(id) {
  return PushDelivery.findOneAndUpdate(
    { _id: id, status: 'queued', nextAttemptAt: { $lte: new Date() } },
    { $set: { status: 'sending', lastError: null }, $inc: { attempts: 1 } },
    { new: true },
  ).populate('deviceId').populate('notificationId');
}

async function handleTicket(delivery, ticket) {
  if (ticket?.status === 'ok' && ticket.id) {
    await PushDelivery.updateOne({ _id: delivery._id, status: 'sending' }, { $set: { status: 'ticketed', ticketId: ticket.id } });
    return;
  }
  const errorType = ticket?.details?.error || 'ExpoPushError';
  if (errorType === 'DeviceNotRegistered') await deactivateDevice(delivery.deviceId?._id);
  await PushDelivery.updateOne({ _id: delivery._id, status: 'sending' }, { $set: { status: 'failed', lastError: errorType } });
}

async function dispatchQueuedDeliveries() {
  if (dispatching) return;
  dispatching = true;
  try {
    const due = await PushDelivery.find({ status: 'queued', nextAttemptAt: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(100).select('_id');
    const claimed = [];
    for (const row of due) {
      const delivery = await claimDelivery(row._id);
      if (delivery) claimed.push(delivery);
    }
    const ready = claimed.filter((delivery) => delivery.deviceId?.isActive && delivery.notificationId);
    for (const delivery of claimed.filter((item) => !item.deviceId?.isActive || !item.notificationId)) {
      await PushDelivery.updateOne({ _id: delivery._id }, { $set: { status: 'failed', lastError: 'InactiveDevice' } });
    }
    if (!ready.length) return;

    const messages = ready.map((delivery) => {
      const notification = delivery.notificationId;
      const data = { event: notification.event, notificationId: String(notification._id) };
      if (notification.pickupId) data.pickupId = String(notification.pickupId._id || notification.pickupId);
      if (notification.invoiceId) data.invoiceId = String(notification.invoiceId._id || notification.invoiceId);
      return {
        to: delivery.deviceId.expoPushToken,
        title: notification.title,
        body: notification.message,
        sound: 'default',
        priority: 'high',
        channelId: 'default',
        data,
      };
    });

    try {
      const result = await expoRequest(EXPO_PUSH_URL, messages);
      const tickets = Array.isArray(result.data) ? result.data : [result.data];
      for (let index = 0; index < ready.length; index += 1) await handleTicket(ready[index], tickets[index]);
    } catch (error) {
      logFailure('send', error);
      await Promise.all(ready.map((delivery) => PushDelivery.updateOne({ _id: delivery._id, status: 'sending' }, {
        $set: delivery.attempts < MAX_ATTEMPTS
          ? { status: 'queued', nextAttemptAt: retryAt(delivery.attempts), lastError: 'ExpoServiceUnavailable' }
          : { status: 'failed', lastError: 'ExpoServiceUnavailable' },
      })));
    }
  } catch (error) {
    logFailure('queue dispatch', error);
  } finally {
    dispatching = false;
  }
}

async function processReceipts() {
  if (checkingReceipts) return;
  checkingReceipts = true;
  try {
    const cutoff = new Date(Date.now() - 15 * 60_000);
    const due = await PushDelivery.find({ status: 'ticketed', receiptCheckedAt: null, createdAt: { $lte: cutoff } })
      .sort({ createdAt: 1 }).limit(300).select('_id ticketId deviceId attempts');
    for (let start = 0; start < due.length; start += 300) {
      const batch = due.slice(start, start + 300);
      const rows = batch.filter((item) => item.ticketId);
      if (!rows.length) continue;
      try {
        const result = await expoRequest(EXPO_RECEIPTS_URL, { ids: rows.map((item) => item.ticketId) });
        const receipts = result.data || {};
        for (const delivery of rows) {
          const receipt = receipts[delivery.ticketId];
          if (!receipt) continue;
          if (receipt.status === 'ok') {
            await PushDelivery.updateOne({ _id: delivery._id, status: 'ticketed' }, { $set: { status: 'delivered', receiptCheckedAt: new Date(), lastError: null } });
          } else {
            const errorType = receipt.details?.error || 'ExpoReceiptError';
            if (errorType === 'DeviceNotRegistered') await deactivateDevice(delivery.deviceId);
            await PushDelivery.updateOne({ _id: delivery._id, status: 'ticketed' }, { $set: { status: 'failed', receiptCheckedAt: new Date(), lastError: errorType } });
          }
        }
      } catch (error) { logFailure('receipt check', error); }
    }
  } catch (error) {
    logFailure('receipt query', error);
  } finally {
    checkingReceipts = false;
  }
}

export async function queuePushForNotification(notification) {
  const devices = await PushDevice.find({ userId: notification.recipientId, isActive: true }).select('_id');
  if (!devices.length) return;
  await PushDelivery.bulkWrite(devices.map((device) => ({
    updateOne: {
      filter: { notificationId: notification._id, deviceId: device._id },
      update: { $setOnInsert: { status: 'queued', attempts: 0, nextAttemptAt: new Date() } },
      upsert: true,
    },
  })), { ordered: false });
  void dispatchQueuedDeliveries();
}

export function startExpoPushWorkers() {
  const run = () => { void dispatchQueuedDeliveries(); void processReceipts(); };
  run();
  const timer = setInterval(run, 60_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
