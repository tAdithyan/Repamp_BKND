import WastePrice from "../models/wastePrice.model.js";
import ApiError from "../utils/apiError.js";

export const getWastePrices = () => WastePrice.find().sort({ category: 1 });

export const upsertWastePrice = async (category, pricePerKg) => {
  const cleanCategory = decodeURIComponent(category || "").trim();
  const numericPrice = Number(pricePerKg);
  if (!cleanCategory) throw new ApiError(400, "Waste category is required");
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    throw new ApiError(400, "Price per kg must be a valid positive number");
  }
  return WastePrice.findOneAndUpdate(
    { category: cleanCategory },
    { category: cleanCategory, pricePerKg: numericPrice },
    { new: true, upsert: true, runValidators: true }
  );
};



export const deleteWastePrice = async (category) => {
  const cleanCategory = decodeURIComponent(category || "").trim();
  if (!cleanCategory) throw new ApiError(400, "Waste category is required");
  const deletedPrice = await WastePrice.findOneAndDelete({ category: cleanCategory });
  if (!deletedPrice) throw new ApiError(404, "Waste price not found for the specified category");
  return deletedPrice;
};