const Stripe = require('stripe');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const mpPayment = new Payment(mp);
const mpPreference = new Preference(mp);

const PaymentService = {
  async createStripePaymentIntent({ amount, currency = 'brl', metadata = {} }) {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // centavos
      currency,
      metadata,
      automatic_payment_methods: { enabled: true },
    });
    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  },

  async createMercadoPagoPreference({ title, amount, scheduleId, clientEmail }) {
    const preference = await mpPreference.create({
      body: {
        items: [{ title, quantity: 1, unit_price: amount }],
        payer: { email: clientEmail },
        external_reference: scheduleId,
        back_urls: {
          success: `${process.env.FRONTEND_URL}/payment/success`,
          failure: `${process.env.FRONTEND_URL}/payment/failure`,
        },
        auto_return: 'approved',
        notification_url: `${process.env.BACKEND_URL}/api/payment/mp-webhook`,
      },
    });
    return { preferenceId: preference.id, initPoint: preference.init_point };
  },

  async handleStripeWebhook(rawBody, signature) {
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    return event;
  },

  async handleMercadoPagoWebhook(paymentId) {
    const payment = await mpPayment.get({ id: paymentId });
    return payment;
  },

  async refund(paymentIntentId) {
    return stripe.refunds.create({ payment_intent: paymentIntentId });
  },
};

module.exports = PaymentService;
