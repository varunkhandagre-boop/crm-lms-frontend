import RazorpayCheckout from 'react-native-razorpay';

export type RazorpayOptions = Record<string, any>;
export type RazorpaySuccess = { razorpay_payment_id: string };

/** Phone app: the native Razorpay SDK. The web build uses razorpay.web.ts. */
export function openRazorpay(options: RazorpayOptions): Promise<RazorpaySuccess> {
    // The native module exists only in an installed build (APK / Play Store), not in Expo Go.
    if (!RazorpayCheckout || typeof (RazorpayCheckout as any).open !== 'function') {
        return Promise.reject({ code: 0, description: 'Online payment is not available in this test version of the app. Use the app from Play Store or app.lifelinem.com.' });
    }
    return RazorpayCheckout.open(options as any) as Promise<RazorpaySuccess>;
}
