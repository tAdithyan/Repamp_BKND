import District from "../models/District.js";
import ServiceArea from "../models/serviceArea.model.js";
import ApiError from "../utils/apiError.js";

const KERALA_STATE_CODE = "IN-KL";

export const validateCoordinates = (latitude, longitude) => {
  const lat = Number(latitude),
    lng = Number(longitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new ApiError(400, "Valid latitude and longitude are required.");
  }
  return [lng, lat];
};

export const checkDistrictServiceability = async (
  latitude,
  longitude,
  DistrictModel = District,
  ServiceAreaModel = ServiceArea,
) => {
  const coordinates = validateCoordinates(latitude, longitude);
  return checkDistrictAndRadiusServiceability(
    coordinates,
    DistrictModel,
    ServiceAreaModel,
  );
};

const checkDistrictAndRadiusServiceability = async (
  coordinates,
  DistrictModel,
  ServiceAreaModel,
) => {
  const [boundaryCount, activeRadiusCount, nearbyAreas] = await Promise.all([
    DistrictModel.countDocuments({
      stateCode: KERALA_STATE_CODE,
      boundary: { $exists: true },
    }),
    ServiceAreaModel.countDocuments({ type: "radius", isActive: true }),
    ServiceAreaModel.find({
      type: "radius",
      isActive: true,
      radiusMeters: { $gt: 0 },
      center: {
        $near: {
          $geometry: { type: "Point", coordinates },
          $maxDistance: 100000,
        },
      },
    })
      .select("name center radiusMeters")
      .lean(),
  ]);
  const [longitude, latitude] = coordinates;
  const radiusService = nearbyAreas.find(
    (area) =>
      distanceMeters(
        latitude,
        longitude,
        area.center.coordinates[1],
        area.center.coordinates[0],
      ) <= area.radiusMeters,
  );
  if (!boundaryCount && !activeRadiusCount)
    throw new ApiError(
      503,
      "Kerala district boundary data is not configured. Please contact REPAMP support.",
    );

  const districts = boundaryCount
    ? await DistrictModel.find({
        stateCode: KERALA_STATE_CODE,
        boundary: {
          $geoIntersects: { $geometry: { type: "Point", coordinates } },
        },
      })
        .select("districtName stateName stateCode isServiceable")
        .sort({ districtName: 1 })
        .lean()
    : [];

  if (radiusService) {
    const districtNames = districts.map((district) => district.districtName);
    return {
      supported: true,
      serviceable: true,
      district: districtNames.join(" / ") || null,
      ...(districtNames.length > 1 ? { districts: districtNames } : {}),
      serviceArea: radiusService.name,
      state: districts[0]?.stateName || "Kerala",
      message: `Service is available within ${radiusService.name}.`,
    };
  }

  if (!districts.length)
    return {
      supported: false,
      serviceable: false,
      district: null,
      state: null,
      message: "This location is outside the supported district dataset.",
    };
  const serviceable = districts.every(
    (district) => district.isServiceable === true,
  );
  const districtNames = districts.map((district) => district.districtName);
  return {
    supported: true,
    serviceable,
    district: districtNames.join(" / "),
    ...(districtNames.length > 1 ? { districts: districtNames } : {}),
    state: districts[0].stateName || "Kerala",
    message: serviceable
      ? "Service is available in your district."
      : "You are in a restricted area.",
  };
};

function distanceMeters(lat1, lon1, lat2, lon2) {
  const radians = (value) => (value * Math.PI) / 180;
  const deltaLat = radians(lat2 - lat1),
    deltaLon = radians(lon2 - lon1);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export const listRadiusServiceAreas = (ServiceAreaModel = ServiceArea) =>
  ServiceAreaModel.find({ type: "radius" })
    .select(
      "name center radiusMeters isActive createdAt updatedAt createdBy updatedBy",
    )
    .populate("createdBy updatedBy", "name")
    .sort({ name: 1 })
    .lean();

export const createRadiusServiceArea = async (
  { name, latitude, longitude, radiusMeters },
  adminId,
  ServiceAreaModel = ServiceArea,
) => {
  const trimmedName = String(name || "").trim();
  if (!trimmedName || trimmedName.length > 100)
    throw new ApiError(
      400,
      "Enter a service-area name (up to 100 characters).",
    );
  if (
    !Number.isFinite(Number(radiusMeters)) ||
    Number(radiusMeters) < 100 ||
    Number(radiusMeters) > 100000
  ) {
    throw new ApiError(
      400,
      "Radius must be between 100 meters and 100 kilometers.",
    );
  }
  const coordinates = validateCoordinates(latitude, longitude);
  await ServiceAreaModel.collection.createIndex(
    { center: "2dsphere" },
    { name: "service_area_center_2dsphere", sparse: true },
  );
  return ServiceAreaModel.create({
    name: trimmedName,
    type: "radius",
    center: { type: "Point", coordinates },
    radiusMeters: Number(radiusMeters),
    isActive: true,
    createdBy: adminId,
    updatedBy: adminId,
  });
};

export const updateRadiusServiceAreaStatus = async (
  id,
  isActive,
  adminId,
  ServiceAreaModel = ServiceArea,
) => {
  if (typeof isActive !== "boolean")
    throw new ApiError(400, "isActive must be true or false.");
  const area = await ServiceAreaModel.findOneAndUpdate(
    { _id: id, type: "radius" },
    { $set: { isActive, updatedBy: adminId } },
    { new: true, runValidators: true },
  )
    .select(
      "name center radiusMeters isActive createdAt updatedAt createdBy updatedBy",
    )
    .populate("createdBy updatedBy", "name")
    .lean();
  if (!area) throw new ApiError(404, "Radius service area not found.");
  return area;
};

export const listDistrictServiceability = (DistrictModel = District) =>
  DistrictModel.find({ stateCode: KERALA_STATE_CODE })
    .select(
      "districtName normalizedDistrictName stateName stateCode isServiceable updatedAt updatedBy",
    )
    .populate("updatedBy", "name")
    .sort({ districtName: 1 })
    .lean();

export const updateDistrictServiceability = async (
  id,
  isServiceable,
  updatedBy,
  DistrictModel = District,
) => {
  if (typeof isServiceable !== "boolean")
    throw new ApiError(400, "isServiceable must be true or false.");
  const district = await DistrictModel.findOneAndUpdate(
    { _id: id, stateCode: KERALA_STATE_CODE },
    { $set: { isServiceable, updatedBy } },
    { new: true, runValidators: true },
  )
    .select(
      "districtName stateName stateCode isServiceable updatedAt updatedBy",
    )
    .populate("updatedBy", "name")
    .lean();
  if (!district)
    throw new ApiError(
      404,
      "Supported district not found. Run the district boundary seed script first.",
    );
  return district;
};

export const assertPickupDistrictServiceable = async (
  longitude,
  latitude,
  DistrictModel = District,
  ServiceAreaModel = ServiceArea,
) => {
  const result = await checkDistrictServiceability(
    latitude,
    longitude,
    DistrictModel,
    ServiceAreaModel,
  );
  if (!result.supported)
    throw new ApiError(
      403,
      "Pickup location is outside the supported Kerala districts.",
    );
  if (!result.serviceable)
    throw new ApiError(
      403,
      `Pickup service is not available in ${result.district}.`,
    );
  return result;
};


export const deleteRadiusServiceArea = async (
  id,
  adminId,
  ServiceAreaModel = ServiceArea,
) => {
  const area = await ServiceAreaModel.findOneAndDelete({
    _id: id,
    type: "radius",
  })
    .select(
      "name center radiusMeters isActive createdAt updatedAt createdBy updatedBy",
    )
    .populate("createdBy updatedBy", "name")
    .lean();
  if (!area) throw new ApiError(404, "Radius service area not found.");
  return area;
};