import { apiClient } from './client';

// Leads from the company website form are created by the backend as normal
// CRM leads (source "Website - …"). These calls cover the extra bits: who
// they get assigned to, and the website/ads summary.

export interface WebsiteLeadSettings {
  /** Chosen owner for new website leads; null = default (company's first Admin). */
  assigneeId: string | null;
  /** Who will actually get the next website lead. */
  effectiveAssignee: { id: string; name: string } | null;
  /** The address the company website must post its form to. */
  endpointUrl: string;
  /** Websites allowed to send leads, e.g. ["cleonmed.com"]. */
  domains: string[];
}

export async function getWebsiteLeadSettings(): Promise<WebsiteLeadSettings> {
  const res = await apiClient.get<{ data: WebsiteLeadSettings }>('/website-leads/settings');
  return res.data;
}

export async function updateWebsiteLeadSettings(change: { assigneeId?: string | null; domains?: string[] }): Promise<WebsiteLeadSettings> {
  const res = await apiClient.put<{ data: WebsiteLeadSettings }>('/website-leads/settings', change);
  return res.data;
}

/** Ready-to-paste enquiry form for any website, posting to this company's link. */
export function websiteFormSnippet(endpointUrl: string): string {
  return `<form id="lms-lead-form">
  <input name="name" placeholder="Your name" required>
  <input name="phone" placeholder="Mobile number" required>
  <input name="organisation" placeholder="Hospital / Company">
  <input name="city" placeholder="City">
  <input name="product_interest" placeholder="Product you are interested in">
  <textarea name="message" placeholder="Message"></textarea>
  <button type="submit">Send enquiry</button>
  <p id="lms-lead-status"></p>
</form>
<script>
document.getElementById('lms-lead-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var form = this, data = {}, tags = {}, q = new URLSearchParams(location.search);
  new FormData(form).forEach(function (v, k) { data[k] = v; });
  ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(function (k) { if (q.get(k)) tags[k] = q.get(k); });
  data.type = 'lead'; data.source = 'Website form'; data.page = location.pathname; data.attribution = { first_touch: tags };
  var status = document.getElementById('lms-lead-status');
  status.textContent = 'Sending...';
  try {
    var r = await fetch('${endpointUrl}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    status.textContent = r.ok ? 'Thank you! We will contact you soon.' : 'Could not send. Please call us.';
    if (r.ok) form.reset();
  } catch (err) { status.textContent = 'Could not send. Please call us.'; }
});
</script>`;
}

export const isWebsiteLead = (source?: string | null) => !!source && source.toLowerCase().startsWith('website');
