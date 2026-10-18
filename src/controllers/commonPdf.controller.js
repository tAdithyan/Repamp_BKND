import { randomUUID } from "node:crypto";
import MonthlyInvoice from "../models/monthlyInvoice.model.js";
import ApiError from "../utils/apiError.js";
import ApiResponse from "../utils/apiResponse.js";
import { assertInvoiceAccess } from "../utils/monthlyInvoiceAccess.js";
import { createMonthlyInvoicePdf } from "../utils/pdfMonthlyInvoice.js";
import { createPickupReceiptPdf } from "../utils/pdfReceipt.js";
import { consumeReceiptToken } from "./receipt.controller.js";

const invoicePdfTokens = new Map();
const PDF_LINK_LIFETIME_MS = 2 * 60 * 1000;

export const setPdfDocumentType = (documentType) => (req, _res, next) => {
  req.pdfDocumentType = documentType;
  next();
};

export const createMonthlyInvoicePdfLinkController = async (req, res, next) => {
  try {
    const invoice = await MonthlyInvoice.findById(req.params.id);
    if (!invoice) throw new ApiError(404, "Monthly invoice not found");
    await assertInvoiceAccess(req.user, invoice);
    const token = randomUUID();
    invoicePdfTokens.set(token, {
      invoiceId: String(invoice._id),
      expiresAt: Date.now() + PDF_LINK_LIFETIME_MS,
    });
    const downloadUrl = `${req.protocol}://${req.get("host")}/api/v1/monthly-invoices/${invoice._id}/pdf-download/${token}`;
    res.status(200).json(new ApiResponse(200, { downloadUrl, expiresInSeconds: 120 }, "PDF link created"));
  } catch (error) { next(error); }
};

const loadMonthlyInvoicePdf = async (req) => {
  if (req.pdfDocumentType === "monthly-invoice-link") {
    const link = invoicePdfTokens.get(req.params.token);
    invoicePdfTokens.delete(req.params.token);
    if (!link || link.invoiceId !== req.params.id || link.expiresAt < Date.now()) {
      throw new ApiError(401, "PDF link is invalid or expired");
    }
  }
  const invoice = await MonthlyInvoice.findById(req.params.id)
    .populate("customerId", "name phonenumber address")
    .populate("recurringContractId", "name ratePerKg address")
    .populate("pickupIds", "pickupId preferredDate wasteType weight ratePerKg amount status");
  if (!invoice) throw new ApiError(404, "Monthly invoice not found");
  if (req.pdfDocumentType !== "monthly-invoice-link") await assertInvoiceAccess(req.user, invoice);
  return {
    content: createMonthlyInvoicePdf(invoice),
    filename: `REPAMP-${invoice.billingMonth}-invoice.pdf`,
  };
};

const loadPickupReceiptPdf = async (req) => {
  const pickup = await consumeReceiptToken(req.params.id, req.query.token);
  return {
    content: createPickupReceiptPdf(pickup),
    filename: `${pickup.pickupId || "pickup"}-receipt.pdf`,
  };
};

const pdfLoaders = {
  "monthly-invoice": loadMonthlyInvoicePdf,
  "monthly-invoice-link": loadMonthlyInvoicePdf,
  "pickup-receipt": loadPickupReceiptPdf,
};

export const downloadPdfController = async (req, res, next) => {
  try {
    const loadPdf = pdfLoaders[req.pdfDocumentType];
    if (!loadPdf) throw new ApiError(404, "PDF document type not found");
    const { content, filename } = await loadPdf(req);
    const safeFilename = filename.replace(/[\r\n"\\]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Length", content.length);
    res.send(content);
  } catch (error) { next(error); }
};
