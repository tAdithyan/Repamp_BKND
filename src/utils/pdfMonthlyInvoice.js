const escapePdf = (value) => String(value ?? "").replace(/([\\()])/g, "\\$1");
export const createMonthlyInvoicePdf = (invoice) => {
  const customer = invoice.customerId || {}, contract = invoice.recurringContractId || {};
  const lines = [
    ["REPAMP",20,true],["Recurring Waste Collection Invoice",16,true],["",7],
    [`Invoice ID: ${invoice._id}`,10],[`Billing month: ${invoice.billingMonth}`,10],
    [`Issued: ${new Date(invoice.issuedAt).toLocaleDateString("en-IN")}`,10],
    [`Due date: ${new Date(invoice.dueDate).toLocaleDateString("en-IN")}`,10],["",7],
    [`Customer: ${customer.name || "Not available"}`,11,true],[`Phone: ${customer.phonenumber || "Not available"}`,10],
    [`Contract: ${contract.name || "Recurring collection"}`,10],
    [`Rate: INR ${Number(contract.ratePerKg || 0).toFixed(2)} / kg (before GST)`,10],[`GST: ${Number(invoice.gstRate || 18).toFixed(0)}%`,10],["",7],["COLLECTION DETAILS",11,true],
  ];
  (invoice.pickupIds || []).slice(0,22).forEach((pickup) => lines.push([
    `${new Date(pickup.preferredDate).toLocaleDateString("en-IN")} | ${pickup.pickupId} | ${Number(pickup.weight||0).toFixed(2)} kg | INR ${Number(pickup.amount||0).toFixed(2)} incl. GST`,9
  ]));
  lines.push(["",7],[`Total collections: ${invoice.pickupIds?.length||0}`,11],
    [`Total weight: ${Number(invoice.totalWeight||0).toFixed(2)} kg`,12,true],
    [`Subtotal: INR ${Number(invoice.subtotal||0).toFixed(2)}`,11],
    [`GST (${Number(invoice.gstRate || 18).toFixed(0)}%): INR ${Number(invoice.gstAmount||0).toFixed(2)}`,11],
    [`TOTAL AMOUNT (INCL. GST): INR ${Number(invoice.totalAmount||0).toFixed(2)}`,15,true],["",7],
    [`Payment status: ${String(invoice.status).toUpperCase()}`,11,true],
    [`Payment method: ${invoice.paymentMethod||"Pending"}`,10],
    [invoice.paidAt?`Paid on: ${new Date(invoice.paidAt).toLocaleString("en-IN")}`:"Payment pending",10]);
  let y=805;
  const content=lines.map(([line,size,bold])=>{const command=`BT /${bold?"F2":"F1"} ${size} Tf 48 ${y} Td (${escapePdf(line)}) Tj ET`;y-=Number(size)+7;return command;}).join("\n");
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  let pdf="%PDF-1.4\n";const offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xrefOffset=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;offsets.slice(1).forEach((offset)=>{pdf+=`${String(offset).padStart(10,"0")} 00000 n \n`;});pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;return Buffer.from(pdf);
};
