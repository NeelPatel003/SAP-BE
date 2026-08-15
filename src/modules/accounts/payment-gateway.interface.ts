/** Razorpay-ready boundary; configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before a live adapter is added. */
export interface PaymentGateway {
  createPaymentOrder(input: {
    amountPaise: number;
    currency: string;
    receipt: string;
  }): Promise<{ providerOrderId: string }>;
}
