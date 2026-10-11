import * as Clipboard from 'expo-clipboard';
import { Alert, Linking, Platform, ToastAndroid } from 'react-native';

// One-tap tracking: opens the courier company's own tracking page. Where the
// site accepts the number in the link it opens pre-filled; otherwise the docket
// number is copied so the user only has to paste it. Unknown couriers fall back
// to a web search for "<courier> tracking <docket>".
type Tracker = { match: string[]; url: (n: string) => string; prefilled: boolean };

const TRACKERS: Tracker[] = [
    { match: ['blue dart', 'bluedart'], url: (n) => `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${n}`, prefilled: true },
    { match: ['delhivery'], url: (n) => `https://www.delhivery.com/track/package/${n}`, prefilled: true },
    { match: ['dhl'], url: (n) => `https://www.dhl.com/in-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`, prefilled: true },
    { match: ['fedex'], url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`, prefilled: true },
    { match: ['xpressbees', 'xpress bees'], url: (n) => `https://www.xpressbees.com/shipment/tracking?awbNo=${n}`, prefilled: true },
    { match: ['ecom express', 'ecom'], url: (n) => `https://ecomexpress.in/tracking/?awb_field=${n}`, prefilled: true },
    { match: ['ekart'], url: (n) => `https://ekartlogistics.com/shipmenttrack/${n}`, prefilled: true },
    { match: ['shiprocket'], url: (n) => `https://shiprocket.co/tracking/${n}`, prefilled: true },
    { match: ['dtdc'], url: () => 'https://www.dtdc.in/tracking.asp', prefilled: false },
    { match: ['india post', 'speed post', 'speedpost', 'post office', 'indiapost'], url: () => 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx', prefilled: false },
    { match: ['professional', 'tpc'], url: () => 'https://www.tpcindia.com/', prefilled: false },
    { match: ['trackon'], url: () => 'https://trackon.in/', prefilled: false },
    { match: ['maruti'], url: () => 'https://www.shreemaruti.com/', prefilled: false },
    { match: ['gati'], url: () => 'https://www.gati.com/', prefilled: false },
];

function toast(msg: string) {
    if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.LONG);
    else Alert.alert('Track courier', msg);
}

export function trackingTarget(courierName?: string, docketNo?: string) {
    const name = (courierName || '').toLowerCase();
    const n = encodeURIComponent((docketNo || '').trim());
    const t = TRACKERS.find((x) => x.match.some((m) => name.includes(m)));
    if (t) return { url: t.url(n), prefilled: t.prefilled };
    const q = encodeURIComponent(`${courierName || 'courier'} tracking ${docketNo || ''}`.trim());
    return { url: `https://www.google.com/search?q=${q}`, prefilled: true };
}

export async function trackCourier(courierName?: string, docketNo?: string) {
    const docket = (docketNo || '').trim();
    if (!docket) { toast('No docket number on this entry.'); return; }
    const { url, prefilled } = trackingTarget(courierName, docket);
    // Open first: on the web a message box before window.open would get the new tab blocked.
    try {
        await Linking.openURL(url);
    } catch {
        toast('Could not open the tracking page.');
        return;
    }
    try { await Clipboard.setStringAsync(docket); } catch { /* copying is a convenience only */ }
    if (!prefilled) toast(`Docket ${docket} copied — paste it on the tracking page.`);
}
