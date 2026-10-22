const escapePdf = (value) => String(value ?? "").replace(/([\\()])/g, "\\$1");

export const createPickupReceiptPdf = (pickup) => {
  const customer = pickup.customerId || {};
  const operator = pickup.operatorId || {};
  const completedAtValue = pickup.completedAt || pickup.updatedAt;
  const completedAt = completedAtValue ? new Date(completedAtValue).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "Not available";
  const weight = Number(pickup.weight || 0);
  const amount = Number(pickup.amount || 0);
  const taxableAmount = Number(pickup.taxableAmount || amount / 1.18 || 0);
  const gstAmount = Number(pickup.gstAmount || Number((taxableAmount * 0.18).toFixed(2)));
  const pricePerKg = Number(pickup.ratePerKg || (weight > 0 ? taxableAmount / weight : 0));
  const paymentStatus = ({
    paid: "Paid from customer wallet",
    accrued: "Due with monthly invoice",
    invoiced: "Included in monthly invoice",
    overdue: "Payment overdue",
  })[pickup.paymentStatus] || "Payment status unavailable";
  const coordinates = pickup.pickupLocation?.coordinates;
  const gpsLocation = coordinates?.length === 2
    ? `Latitude: ${coordinates[1]}, Longitude: ${coordinates[0]}`
    : "GPS location: Not available";
  const address = [customer.address, customer.localbody, customer.wardNo ? `Ward ${customer.wardNo}` : null, customer.pincode]
    .filter(Boolean)
    .join(", ");
  const lines = [
    ["REPAMP", 20, true],
    ["Waste Collection Receipt", 16, true],
    ["", 10],
    [`Receipt / Pickup ID: ${pickup.pickupId || pickup._id}`, 11],
    [`Timestamp (IST): ${completedAt}`, 11],
    [gpsLocation, 10],
    ["", 10],
    [`Customer: ${customer.name || "Not available"}`, 11],
    [`Customer phone: ${customer.phonenumber || "Not available"}`, 11],
    [`WhatsApp: ${customer.whatsappnumber || "Not available"}`, 10],
    [`Email: ${customer.email || "Not available"}`, 10],
    [`Client address: ${address || "Not available"}`, 10],
    [`Collection agent: ${operator.name || "Not available"}`, 11],
    ["", 10],
    [`Waste category: ${pickup.wasteType}`, 11],
    [`Collected weight: ${weight.toFixed(2)} kg`, 11],
    [`Price per kg: INR ${pricePerKg.toFixed(2)} (before GST)`, 11],
    [`Subtotal: INR ${taxableAmount.toFixed(2)}`, 11],
    [`GST (18%): INR ${gstAmount.toFixed(2)}`, 11],
    [`Billing amount (incl. GST): INR ${amount.toFixed(2)}`, 14, true],
    ["", 10],
    [`Payment status: ${paymentStatus}`, 11],
    ["Status: COLLECTION COMPLETED", 11, true],
    ["", 10],
    ["Thank you for using REPAMP.", 10],
  ];

  let y = 790;
  const content = lines.map(([line, size, bold]) => {
    const safeLine = String(line).replace(/[^\x20-\x7E]/g, "?");
    const command = `BT /${bold ? "F2" : "F1"} ${size} Tf 55 ${y} Td (${escapePdf(safeLine)}) Tj ET`;
    y -= Number(size) + 10;
    return command;
  }).join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
};
