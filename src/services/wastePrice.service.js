import WastePrice from "../models/wastePrice.model.js";
import ApiError from "../utils/apiError.js";

export const getWastePrices = () => WastePrice.find().sort({ category: 1 });

// Saves a price. When `newCategory` is provided and differs from `category`,
// the existing record is renamed (and its price updated) instead of upserted.
export const upsertWastePrice = async (category, pricePerKg, newCategory) => {
  const cleanCategory = decodeURIComponent(category || "").trim();
  const numericPrice = Number(pricePerKg);
  if (!cleanCategory) throw new ApiError(400, "Waste category is required");
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    throw new ApiError(400, "Price per kg must be a valid positive number");
  }

  const cleanNewCategory =
    typeof newCategory === "string" ? newCategory.trim() : "";

  // ---- Rename ----
  if (cleanNewCategory && cleanNewCategory !== cleanCategory) {
    // Case-insensitive duplicate check (ignores the record being renamed)
    const clash = await WastePrice.findOne({ category: cleanNewCategory }).collation({
      locale: "en",
      strength: 2,
    });
    if (clash && clash.category !== cleanCategory) {
      throw new ApiError(409, `"${cleanNewCategory}" already exists`);
    }

    try {
      const renamed = await WastePrice.findOneAndUpdate(
        { category: cleanCategory },
        { category: cleanNewCategory, pricePerKg: numericPrice },
        { new: true, runValidators: true }
      );
      if (!renamed) {
        throw new ApiError(404, "Waste price not found for the specified category");
      }
      return renamed;
    } catch (error) {
      if (error?.code === 11000) {
        throw new ApiError(409, `"${cleanNewCategory}" already exists`);
      }
      throw error;
    }
  }

  // ---- Normal save (create or update price) ----
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