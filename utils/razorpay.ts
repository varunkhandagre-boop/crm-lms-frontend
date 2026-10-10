import RazorpayCheckout from 'react-native-razorpay';

export type RazorpayOptions = Record<string, any>;
export type RazorpaySuccess = { razorpay_payment_id: string };

/** Phone app: the native Razorpay SDK. The web build uses razorpay.web.ts. */
export function openRazorpay(options: RazorpayOptions): Promise<RazorpaySuccess> {
    return RazorpayCheckout.open(options as any) as Promise<RazorpaySuccess>;
}
