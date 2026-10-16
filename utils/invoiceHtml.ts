import { Invoice } from '../services/api/invoices';
import { sharePdfFromHtml } from './sharePdf';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
    return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function belowThousand(n: number): string {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return [h ? `${ONES[h]} Hundred` : '', r ? belowHundred(r) : ''].filter(Boolean).join(' ');
}

/** 123456 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six" (Indian system). */
export function indianWords(n: number): string {
    n = Math.floor(n);
    if (n === 0) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(`${indianWords(crore)} Crore`);
    if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
    if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
    if (n) parts.push(belowThousand(n));
    return parts.join(' ');
}

export function amountInWords(amount: number): string {
    const rupees = Math.floor(amount + 1e-9);
    const paise = Math.round((amount - rupees) * 100);
    return `Rupees ${indianWords(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`;
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const PAYMENT_LABEL: Record<string, string> = { RAZORPAY: 'Online (Razorpay)', WEBSITE: 'Online (Razorpay, website)', MANUAL: 'UPI / bank transfer' };

export function invoiceHtml(inv: Invoice): string {
    const s = inv.seller;
    const half = (inv.gstPercent / 2).toString().replace(/\.0+$/, '');
    const taxRows = inv.interState
        ? `<tr><td>IGST @ ${esc(inv.gstPercent)}%</td><td class="r">${money(inv.igst)}</td></tr>`
        : `<tr><td>CGST @ ${half}%</td><td class="r">${money(inv.cgst)}</td></tr>
           <tr><td>SGST @ ${half}%</td><td class="r">${money(inv.sgst)}</td></tr>`;
    const lines = inv.lines.map((l, i) => `
        <tr><td>${i + 1}</td><td>${esc(l.description)}</td><td>${esc(l.sac || '')}</td><td class="r">${money(l.amount)}</td></tr>`).join('');

    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #222; font-size: 12px; margin: 28px; }
  h1 { font-size: 18px; margin: 0; letter-spacing: 1px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a3c6e; padding-bottom: 10px; }
  .seller b { font-size: 15px; }
  .muted { color: #666; }
  .box { display: flex; gap: 16px; margin-top: 14px; }
  .box > div { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 10px; }
  .lbl { font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  th, td { border: 1px solid #ccc; padding: 7px; vertical-align: top; }
  th { background: #eef2f8; text-align: left; font-size: 11px; }
  .r { text-align: right; white-space: nowrap; }
  .totals { width: 46%; margin-left: auto; }
  .totals td { border: none; border-bottom: 1px solid #eee; }
  .grand td { font-weight: bold; font-size: 14px; border-top: 2px solid #1a3c6e; border-bottom: none; }
  .words { margin-top: 10px; font-style: italic; }
  .foot { margin-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sign { text-align: right; }
</style></head><body>
  <div class="top">
    <div class="seller">
      <b>${esc(s.tradeName || s.legalName)}</b><br>
      ${s.tradeName ? `<span class="muted">${esc(s.legalName)} (Proprietor)</span><br>` : ''}
      ${esc(s.address)}<br>
      GSTIN: <b>${esc(s.gstin)}</b> &nbsp; State: ${esc(s.stateName)} (${esc(s.stateCode)})
      ${s.phone || s.email ? `<br>${[s.phone, s.email].filter(Boolean).map(esc).join(' • ')}` : ''}
    </div>
    <div style="text-align:right; white-space:nowrap; padding-left:16px">
      <h1>TAX INVOICE</h1>
      <div style="margin-top:6px">Invoice No: <b>${esc(inv.invoiceNo)}</b></div>
      <div>Date: <b>${date(inv.invoiceDate)}</b></div>
    </div>
  </div>

  <div class="box">
    <div>
      <div class="lbl">Billed to</div>
      <b>${esc(inv.buyerName)}</b><br>
      ${inv.buyerAddress ? `${esc(inv.buyerAddress)}<br>` : ''}
      GSTIN: ${inv.buyerGstin ? `<b>${esc(inv.buyerGstin)}</b>` : 'Unregistered'}
    </div>
    <div>
      <div class="lbl">Place of supply</div>
      ${esc(inv.buyerStateName || s.stateName)}${inv.buyerStateCode ? ` (${esc(inv.buyerStateCode)})` : ''}
      <div class="lbl" style="margin-top:8px">Payment</div>
      ${esc(PAYMENT_LABEL[inv.paymentMethod] || inv.paymentMethod)}${inv.paymentRef ? `<br><span class="muted">Ref: ${esc(inv.paymentRef)}</span>` : ''}
    </div>
  </div>

  <table>
    <thead><tr><th style="width:28px">#</th><th>Description</th><th style="width:70px">SAC</th><th class="r" style="width:110px">Amount (₹)</th></tr></thead>
    <tbody>${lines}</tbody>
  </table>

  <table class="totals">
    <tr><td>Taxable value</td><td class="r">${money(inv.taxableAmount)}</td></tr>
    ${taxRows}
    <tr class="grand"><td>Total (₹)</td><td class="r">${money(inv.total)}</td></tr>
  </table>
  <div class="words">${esc(amountInWords(inv.total))}</div>
  <div class="muted" style="margin-top:6px">Tax payable on reverse charge: No. Amount received in full.</div>

  <div class="foot">
    <div class="muted">${s.footerNote ? esc(s.footerNote) : 'This is a computer-generated invoice.'}</div>
    <div class="sign">For <b>${esc(s.tradeName || s.legalName)}</b><br><br><br>Authorised Signatory</div>
  </div>
</body></html>`;
}

export async function shareInvoicePdf(inv: Invoice) {
    await sharePdfFromHtml(invoiceHtml(inv), `Invoice_${inv.invoiceNo.replace(/\//g, '-')}`, 'Tax Invoice');
}
