const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatTimestamp = (value) => value
  ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
  : 'Not available';

export const createPickupReceiptHtml = (pickup) => {
  const customer = pickup.customerId || {};
  const operator = pickup.operatorId || {};
  const coordinates = pickup.pickupLocation?.coordinates;
  const hasLocation = Array.isArray(coordinates) && coordinates.length === 2;
  const location = hasLocation ? `${coordinates[1]}, ${coordinates[0]}` : 'Not available';
  const address = [customer.address, customer.localbody, customer.wardNo ? `Ward ${customer.wardNo}` : '', customer.pincode]
    .filter(Boolean).join(', ');
  const weight = Number(pickup.weight || 0);
  const storedRate = Number(pickup.ratePerKg || 0);
  const subtotal = Number(pickup.taxableAmount ?? (weight * storedRate));
  const rate = storedRate || (weight > 0 ? subtotal / weight : 0);
  const gstRate = Number(pickup.gstRate || 18);
  const gst = Number(pickup.gstAmount ?? (Number(pickup.amount || 0) - subtotal));
  const total = Number(pickup.amount || subtotal + gst);
  const paymentLabel = ({ paid: 'Paid from client wallet', accrued: 'Due with monthly invoice', invoiced: 'Included in monthly invoice', overdue: 'Payment overdue' })[pickup.paymentStatus] || 'Completed';
  const title = `${pickup.pickupId || 'Pickup'} receipt`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#edf3f1;color:#172c28;font:14px/1.5 Arial,Helvetica,sans-serif}.sheet{width:min(820px,calc(100% - 32px));margin:28px auto;background:#fff;border:1px solid #dce7e3;border-radius:20px;overflow:hidden;box-shadow:0 18px 55px #12352a18}.hero{padding:34px 40px;background:linear-gradient(125deg,#075b4b,#079777);color:#fff;display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.brand{font-size:13px;font-weight:800;letter-spacing:.2em}.hero h1{font-size:27px;margin:14px 0 3px}.hero p{margin:0;color:#d7fff0}.badge{padding:7px 12px;border:1px solid #ffffff55;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}.content{padding:30px 40px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px}.card{padding:15px 17px;border:1px solid #e1eae7;border-radius:13px;background:#fbfdfc}.label{display:block;margin-bottom:5px;color:#71817c;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.value{font-weight:700;overflow-wrap:anywhere}.section-title{margin:24px 0 10px;font-size:14px}.details{display:grid;grid-template-columns:1fr 1fr;gap:12px}.details .card{min-height:76px}.details a{color:#087b63;text-decoration:none;overflow-wrap:anywhere}.billing{width:100%;border-collapse:collapse;margin-top:10px}.billing td{padding:11px 3px;border-bottom:1px solid #e8efec}.billing td:last-child{text-align:right;font-weight:700}.billing .grand td{padding-top:16px;border-bottom:0;color:#075b4b;font-size:17px;font-weight:800}.status{display:inline-block;margin-top:16px;padding:7px 11px;border-radius:999px;background:#e7f7f0;color:#087453;font-size:11px;font-weight:800}.footer{margin-top:25px;padding-top:18px;border-top:1px dashed #cfdcd7;color:#71817c;font-size:11px}.footer strong{color:#075b4b}.print-button{display:block;margin:0 auto 24px;padding:11px 18px;border:0;border-radius:9px;background:#087b63;color:#fff;font-weight:700;cursor:pointer}.muted{color:#71817c;font-size:12px}@page{size:A4;margin:14mm}@media print{body{background:#fff}.sheet{width:100%;margin:0;border:0;border-radius:0;box-shadow:none}.hero{padding:25px 30px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.content{padding:24px 30px}.card{break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}.print-button{display:none!important}.section-title{break-after:avoid}.footer{break-inside:avoid}}@media(max-width:600px){.hero{padding:24px;flex-direction:column}.content{padding:22px}.meta,.details{grid-template-columns:1fr}}
</style></head><body>
<main class="sheet"><header class="hero"><div><div class="brand">REPAMP</div><h1>Waste collection receipt</h1><p>${escapeHtml(pickup.pickupId || 'Collection')}</p></div><span class="badge">COLLECTION COMPLETED</span></header>
<div class="content"><div class="meta"><div class="card"><span class="label">Completed at (IST)</span><div class="value">${escapeHtml(formatTimestamp(pickup.completedAt || pickup.updatedAt))}</div></div><div class="card"><span class="label">Receipt reference</span><div class="value">${escapeHtml(pickup.pickupId || pickup._id || 'Not available')}</div></div></div>
<h2 class="section-title">Client details</h2><div class="details"><div class="card"><span class="label">Client</span><div class="value">${escapeHtml(customer.name || 'Not provided')}</div></div><div class="card"><span class="label">Phone / WhatsApp</span><div class="value">${escapeHtml(customer.phonenumber || 'Not provided')}${customer.whatsappnumber ? ` / ${escapeHtml(customer.whatsappnumber)}` : ''}</div></div><div class="card"><span class="label">Email</span><div class="value">${escapeHtml(customer.email || 'Not provided')}</div></div><div class="card"><span class="label">Address</span><div class="value">${escapeHtml(address || 'Not provided')}</div></div></div>
<h2 class="section-title">Collection details</h2><div class="details"><div class="card"><span class="label">Waste type</span><div class="value">${escapeHtml(pickup.wasteType || 'Not recorded')}</div></div><div class="card"><span class="label">Collected weight</span><div class="value">${weight.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg</div></div><div class="card"><span class="label">Collection agent</span><div class="value">${escapeHtml(operator.name || 'Not assigned')}</div></div><div class="card"><span class="label">GPS location</span><div class="value">${hasLocation ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(`${coordinates[1]},${coordinates[0]}`)}">${escapeHtml(location)} · View map</a>` : 'Not available'}</div></div></div>
<h2 class="section-title">Billing summary</h2><table class="billing"><tbody><tr><td>Rate per kg</td><td>${money(rate)} / kg</td></tr><tr><td>Subtotal</td><td>${money(subtotal)}</td></tr><tr><td>GST (${gstRate}%)</td><td>${money(gst)}</td></tr><tr class="grand"><td>Total amount</td><td>${money(total)}</td></tr></tbody></table><span class="status">${escapeHtml(paymentLabel)}</span>
<div class="footer"><strong>Thank you for choosing REPAMP.</strong><br>This digital receipt records the completed collection, measured weight, GPS location and billing details.</div></div></main>
<button class="print-button" onclick="window.print()">Print or save as PDF</button><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`;
};
