const ScheduleModel = require('../models/scheduleModel');
const UserModel = require('../models/userModel');
const NotificationService = require('../services/notificationService');

const ScheduleController = {
  async create(req, res) {
    const { professionalId, serviceId, date, notes } = req.body;

    const professional = await UserModel.findById(professionalId);
    if (!professional || professional.role !== 'professional') {
      return res.status(404).json({ error: 'Profissional não encontrado.' });
    }

    const schedule = await ScheduleModel.create({
      clientId: req.user.uid,
      professionalId,
      serviceId,
      date,
      notes,
    });

    if (professional.fcmToken) {
      await NotificationService.send(professional.fcmToken, {
        title: 'Novo Agendamento!',
        body: `${req.user.name} solicitou um serviço para ${new Date(date).toLocaleDateString('pt-BR')}.`,
        data: { type: 'schedule', scheduleId: schedule.id },
      });
    }

    res.status(201).json({ message: 'Agendamento criado.', schedule });
  },

  async listMySchedules(req, res) {
    const { page = 1 } = req.query;
    const schedules = req.user.role === 'client'
      ? await ScheduleModel.findByClient(req.user.uid, Number(page))
      : await ScheduleModel.findByProfessional(req.user.uid, Number(page));
    res.json({ schedules });
  },

  async getSchedule(req, res) {
    const schedule = await ScheduleModel.findById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Agendamento não encontrado.' });

    const isParticipant = schedule.clientId === req.user.uid || schedule.professionalId === req.user.uid;
    if (!isParticipant && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    res.json({ schedule });
  },

  async updateStatus(req, res) {
    const { status } = req.body;
    const allowed = ['confirmed', 'completed', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido.' });

    const schedule = await ScheduleModel.findById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Agendamento não encontrado.' });

    const isProfessional = schedule.professionalId === req.user.uid;
    const isClient = schedule.clientId === req.user.uid;
    if (!isProfessional && !isClient) return res.status(403).json({ error: 'Acesso negado.' });

    if (status === 'confirmed' && !isProfessional) {
      return res.status(403).json({ error: 'Apenas o profissional pode confirmar.' });
    }

    const updated = await ScheduleModel.update(schedule.id, { status });

    const notifyUserId = isProfessional ? schedule.clientId : schedule.professionalId;
    const notifyUser = await UserModel.findById(notifyUserId);
    if (notifyUser?.fcmToken) {
      const notif = await NotificationService.sendScheduleNotification(updated, status);
      if (notif) await NotificationService.send(notifyUser.fcmToken, notif);
    }

    res.json({ message: 'Status atualizado.', schedule: updated });
  },
};

module.exports = ScheduleController;
