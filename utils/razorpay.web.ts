export type RazorpayOptions = Record<string, any>;
export type RazorpaySuccess = { razorpay_payment_id: string };

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
    if ((window as any).Razorpay) return Promise.resolve();
    if (!loading) {
        loading = new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = SCRIPT_URL;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => { loading = null; reject({ code: 0, description: 'Could not load Razorpay. Check your internet and try again.' }); };
            document.body.appendChild(s);
        });
    }
    return loading;
}

/**
 * Web app: Razorpay's Standard Checkout script. Same promise shape as the
 * native SDK, so SubscriptionScreen handles both alike — closing the window
 * rejects with code 2 (cancelled), like react-native-razorpay.
 */
export async function openRazorpay(options: RazorpayOptions): Promise<RazorpaySuccess> {
    await loadScript();
    return new Promise<RazorpaySuccess>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
            ...options,
            handler: (res: RazorpaySuccess) => resolve(res),
            modal: { ondismiss: () => reject({ code: 2, description: 'Payment cancelled' }) },
        });
        rzp.on('payment.failed', (res: any) => reject({ code: 1, description: res?.error?.description, error: res?.error }));
        rzp.open();
    });
}
