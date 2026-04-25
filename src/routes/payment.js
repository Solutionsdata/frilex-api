const router = require('express').Router();
const PaymentService = require('../services/paymentService');
const ScheduleModel = require('../models/scheduleModel');
const { authenticate } = require('../middleware/auth');
const express = require('express');

router.post('/stripe/intent', authenticate, async (req, res) => {
  const { scheduleId, amount } = req.body;
  const schedule = await ScheduleModel.findById(scheduleId);
  if (!schedule || schedule.clientId !== req.user.uid) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  const result = await PaymentService.createStripePaymentIntent({
    amount,
    metadata: { scheduleId, clientId: req.user.uid },
  });
  res.json(result);
});

router.post('/mp/preference', authenticate, async (req, res) => {
  const { scheduleId, amount, title } = req.body;
  const schedule = await ScheduleModel.findById(scheduleId);
  if (!schedule || schedule.clientId !== req.user.uid) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  const result = await PaymentService.createMercadoPagoPreference({
    title,
    amount,
    scheduleId,
    clientEmail: req.user.email,
  });
  res.json(result);
});

// Webhooks precisam do raw body
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = await PaymentService.handleStripeWebhook(req.body, req.headers['stripe-signature']);
    if (event.type === 'payment_intent.succeeded') {
      const { scheduleId } = event.data.object.metadata;
      await ScheduleModel.update(scheduleId, {
        paymentStatus: 'paid',
        paymentId: event.data.object.id,
      });
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/mp/webhook', async (req, res) => {
  const { data } = req.body;
  if (data?.id) {
    const payment = await PaymentService.handleMercadoPagoWebhook(data.id);
    if (payment.status === 'approved') {
      await ScheduleModel.update(payment.external_reference, {
        paymentStatus: 'paid',
        paymentId: String(payment.id),
      });
    }
  }
  res.sendStatus(200);
});

module.exports = router;
