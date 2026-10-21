import Bin from '../models/bin.model.js';
import Pickup from '../models/pickup.modal.js';
import { buildPickupDetailsFilter } from '../services/pickup.service.js';
import ApiError from '../utils/apiError.js';
import ApiResponse from '../utils/apiResponse.js';

const validPoint = (p) => p && typeof p.latitude === 'number' && typeof p.longitude === 'number'
  && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
  && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

const safeDiagnostic = (value) => {
  if (typeof value !== 'string') return undefined;
  const key = process.env.GOOGLE_ROUTES_API_KEY?.trim();
  return (key ? value.split(key).join('[REDACTED]') : value)
    .replace(/AIza[\w-]+/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/[\r\n]/g, ' ').slice(0, 1000);
};

function routeProviderError(httpStatus, payload) {
  const error = payload?.error;
  const reasons = Array.isArray(error?.details)
    ? error.details.map(detail => detail?.reason).filter(value => typeof value === 'string') : [];
  const message = typeof error?.message === 'string' ? error.message : '';
  const matches = (pattern) => pattern.test([...reasons, message].join(' '));
  let code = 'UPSTREAM_ERROR';
  let explanation = 'The route service is temporarily unavailable. Please try again later.';
  if (matches(/SERVICE_DISABLED|API_DISABLED|has not been used|is disabled/i)) {
    code = 'API_DISABLED';
    explanation = 'Google Routes API is not enabled for the backend key’s project. Enable Routes API in Google Cloud.';
  } else if (matches(/BILLING|billing/i)) {
    code = 'BILLING_DISABLED';
    explanation = 'Google Routes API billing is not active. Check billing for the backend key’s Google Cloud project.';
  } else if (matches(/API_KEY_INVALID|API_KEY_EXPIRED|API_KEY_NOT_FOUND|key not valid|invalid api key/i)) {
    code = 'INVALID_KEY';
    explanation = 'Google rejected the backend Routes API key. Check GOOGLE_ROUTES_API_KEY in Render.';
  } else if (matches(/API_KEY_.*BLOCKED|referer|referrer|IP address|android|ios|restriction/i)) {
    code = 'KEY_RESTRICTED';
    explanation = 'The backend Routes API key restrictions block this server. Use a server key authorized for Routes API and the server’s outbound IP addresses, not an Android or website key.';
  } else if (httpStatus === 429 || matches(/RESOURCE_EXHAUSTED|QUOTA_EXCEEDED|RATE_LIMIT_EXCEEDED/i)) {
    code = 'QUOTA_EXCEEDED';
    explanation = 'The route service quota has been reached. Try later or check the Google Routes API quota.';
  } else if (httpStatus === 401 || httpStatus === 403) {
    code = 'ACCESS_DENIED';
    explanation = 'Google denied the route request. Check Routes API access, billing, and the backend key restrictions in Google Cloud.';
  } else if (httpStatus === 400) {
    code = 'INVALID_REQUEST';
    explanation = 'Google rejected the route request format. Contact your administrator to check the route configuration.';
  }
  console.warn('[route-preview] Google Routes response', JSON.stringify({
    httpStatus,
    code,
    error: {
      status: safeDiagnostic(error?.status),
      message: safeDiagnostic(message),
      reasons: reasons.map(safeDiagnostic),
    },
  }));
  return new ApiError(502, explanation);
}

export async function previewBinRoute(req, res, next) {
  try {
    if (req.user.role !== 'ROL_4') throw new ApiError(403, 'Collection Agent access required');
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new ApiError(400, 'Invalid bin ID');
    if (!validPoint(req.body.origin)) throw new ApiError(400, 'Valid starting coordinates are required');
    const bin = await Bin.findOne({ _id: req.params.id, assignedAgent: req.user._id });
    if (!bin) throw new ApiError(404, 'Assigned bin not found');
    if (!validPoint(bin.coordinates)) throw new ApiError(400, 'This bin has no valid GPS location');
    const key = process.env.GOOGLE_ROUTES_API_KEY?.trim();
    if (!key) throw new ApiError(503, 'Route previews are not configured yet. Contact your administrator.');
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring' },
      body: JSON.stringify({ origin: { location: { latLng: req.body.origin } },
        destination: { location: { latLng: { latitude: bin.coordinates.latitude, longitude: bin.coordinates.longitude } } },
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE',
        polylineEncoding: 'GEO_JSON_LINESTRING', units: 'METRIC' }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw routeProviderError(response.status, failure);
    }
    const data = await response.json();
    console.info('[route-preview] Google Routes response', JSON.stringify({
      httpStatus: response.status,
      routeCount: data.routes?.length || 0,
      routes: data.routes?.map(route => ({
        distanceMeters: route.distanceMeters,
        duration: route.duration,
        coordinateCount: route.polyline?.geoJsonLinestring?.coordinates?.length || 0,
      })),
    }));
    const route = data.routes?.[0];
    if (!route) throw new ApiError(404, 'No driving route was found to this bin.');
    const coordinates = route.polyline?.geoJsonLinestring?.coordinates?.map(([longitude, latitude]) => ({ latitude, longitude }));
    const durationSeconds = Number(route.duration?.replace(/s$/, ''));
    if (!coordinates || coordinates.length < 2 || !coordinates.every(validPoint)
      || !Number.isFinite(durationSeconds) || !Number.isFinite(route.distanceMeters)) {
      throw new ApiError(502, 'The route service returned an invalid route. Please try again.');
    }
    res.set('Cache-Control', 'no-store');
    res.json(new ApiResponse(200, { coordinates, distanceMeters: route.distanceMeters, durationSeconds }, 'Route preview ready'));
  } catch (error) {
    next(error.name === 'TimeoutError' ? new ApiError(504, 'Route request timed out. Please try again.') : error);
  }
}

export async function previewPickupRoute(req, res, next) {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new ApiError(400, 'Invalid pickup ID');
    if (!validPoint(req.body.origin)) throw new ApiError(400, 'Valid starting coordinates are required');
    let clientContractIds = [];
    if (['ROL_6', 'CLIENT_ADMIN'].includes(String(req.user?.role || ''))) {
      const RecurringPickup = (await import('../models/recurringPickup.model.js')).default;
      clientContractIds = await RecurringPickup.find({
        $or: [{ clientAdminId: req.user._id }, { customerId: req.user._id }],
      }).distinct('_id');
    }
    const pickup = await Pickup.findOne(buildPickupDetailsFilter(req.params.id, req.user, clientContractIds));
    if (!pickup) throw new ApiError(404, 'Pickup not found or access denied');
    const [longitude, latitude] = pickup.pickupLocation?.coordinates || [];
    const destination = { latitude: Number(latitude), longitude: Number(longitude) };
    if (!validPoint(destination)) throw new ApiError(400, 'This pickup has no valid GPS location');
    const key = process.env.GOOGLE_ROUTES_API_KEY?.trim();
    if (!key) throw new ApiError(503, 'Route previews are not configured yet. Contact your administrator.');
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring' },
      body: JSON.stringify({ origin: { location: { latLng: req.body.origin } },
        destination: { location: { latLng: destination } }, travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE', polylineEncoding: 'GEO_JSON_LINESTRING', units: 'METRIC' }),
    });
    if (!response.ok) throw routeProviderError(response.status, await response.json().catch(() => null));
    const route = (await response.json()).routes?.[0];
    if (!route) throw new ApiError(404, 'No driving route was found to this pickup.');
    const coordinates = route.polyline?.geoJsonLinestring?.coordinates?.map(([longitude, latitude]) => ({ latitude, longitude }));
    const durationSeconds = Number(route.duration?.replace(/s$/, ''));
    if (!coordinates || coordinates.length < 2 || !coordinates.every(validPoint)
      || !Number.isFinite(durationSeconds) || !Number.isFinite(route.distanceMeters)) {
      throw new ApiError(502, 'The route service returned an invalid route. Please try again.');
    }
    res.set('Cache-Control', 'no-store');
    res.json(new ApiResponse(200, { coordinates, distanceMeters: route.distanceMeters, durationSeconds }, 'Route preview ready'));
  } catch (error) {
    next(error.name === 'TimeoutError' ? new ApiError(504, 'Route request timed out. Please try again.') : error);
  }
}
