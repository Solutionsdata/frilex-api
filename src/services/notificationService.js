const { getMessaging } = require('../config/firebase');

const NotificationService = {
  async send(fcmToken, { title, body, data = {} }) {
    try {
      const message = {
        token: fcmToken,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      };
      const result = await getMessaging().send(message);
      return result;
    } catch (err) {
      console.error('[FCM] Falha ao enviar notificação:', err.message);
    }
  },

  async sendMulticast(tokens, { title, body, data = {} }) {
    if (!tokens.length) return;
    try {
      const message = {
        tokens,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      };
      return await getMessaging().sendEachForMulticast(message);
    } catch (err) {
      console.error('[FCM] Falha no multicast:', err.message);
    }
  },

  async sendScheduleNotification(schedule, type) {
    const messages = {
      confirmed: {
        title: 'Agendamento Confirmado!',
        body: `Seu serviço foi confirmado para ${new Date(schedule.date).toLocaleString('pt-BR')}.`,
      },
      cancelled: {
        title: 'Agendamento Cancelado',
        body: 'Seu agendamento foi cancelado.',
      },
      reminder: {
        title: 'Lembrete de Agendamento',
        body: `Você tem um serviço amanhã às ${new Date(schedule.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
      },
    };
    return messages[type] || null;
  },
};

module.exports = NotificationService;
