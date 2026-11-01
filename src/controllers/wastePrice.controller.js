import ApiResponse from "../utils/apiResponse.js";
import {
  getWastePrices,
  upsertWastePrice,
  deleteWastePrice,
} from "../services/wastePrice.service.js";

export const getWastePricesController = async (_req, res, next) => {
  try {
    const prices = await getWastePrices();
    res.status(200).json(new ApiResponse(200, prices, "Waste prices fetched successfully"));
  } catch (error) {
    next(error);
  }
};

export const upsertWastePriceController = async (req, res, next) => {
  try {
    const { pricePerKg, newCategory } = req.body;
    const price = await upsertWastePrice(req.params.category, pricePerKg, newCategory);
    const message = newCategory
      ? "Waste category updated successfully"
      : "Waste price saved successfully";
    res.status(200).json(new ApiResponse(200, price, message));
  } catch (error) {
    next(error);
  }
};

export const deleteWastePriceController = async (req, res, next) => {
  try {
    const price = await deleteWastePrice(req.params.category);
    res.status(200).json(new ApiResponse(200, price, "Waste price deleted successfully"));
  } catch (error) {
    next(error);
  }
};