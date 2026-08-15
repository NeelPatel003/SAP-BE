/**
 * Razorpay payment integration — planned interface only (not live).
 *
 * Env placeholders (set when payment phase ships):
 *   RAZORPAY_KEY_ID=
 *   RAZORPAY_KEY_SECRET=
 *   RAZORPAY_WEBHOOK_SECRET=
 *
 * Future webhook route: POST /accounts/payments/razorpay/webhook
 * Future models: PaymentIntent / supplier payout linked to AccountsBooking.
 */

export type RazorpayPaymentIntentStub = {
  id: string;
  amountPaise: number;
  currency: 'INR';
  supplierInvoiceId: string;
  status: 'created' | 'authorized' | 'captured' | 'failed';
};

export type RazorpayPayoutStub = {
  id: string;
  paymentIntentId: string;
  supplierId: string;
  amountPaise: number;
  status: 'queued' | 'processed' | 'reversed';
};

export function createRazorpayIntentStub(_input: {
  supplierInvoiceId: string;
  amountPaise: number;
}): RazorpayPaymentIntentStub {
  throw new Error(
    'Razorpay is not enabled. Invoice verify + purchase booking are live; payments ship later.',
  );
}
