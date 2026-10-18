import ApiResponse from "../utils/apiResponse.js";
import { getUserNotifications, markAllNotificationsRead, markNotificationRead, registerPushDevice, unregisterPushDevice } from "../services/notification.service.js";

export const listNotificationsController = async (req, res, next) => { try { const page = await getUserNotifications(req.user._id, req.query.page, req.query.limit); res.json(new ApiResponse(200, page, "Notifications fetched")); } catch (error) { next(error); } };
export const readNotificationController = async (req, res, next) => { try { const item = await markNotificationRead(req.params.id, req.user._id); res.json(new ApiResponse(200, item, "Notification marked as read")); } catch (error) { next(error); } };
export const readAllNotificationsController = async (req, res, next) => { try { await markAllNotificationsRead(req.user._id); res.json(new ApiResponse(200, null, "All notifications marked as read")); } catch (error) { next(error); } };
export const registerPushDeviceController = async (req, res, next) => { try { const result = await registerPushDevice(req.user._id, req.body); res.json(new ApiResponse(200, result, "Push device registered")); } catch (error) { next(error); } };
export const unregisterPushDeviceController = async (req, res, next) => { try { const result = await unregisterPushDevice(req.user._id, req.params.deviceId); res.json(new ApiResponse(200, result, "Push device removed")); } catch (error) { next(error); } };
