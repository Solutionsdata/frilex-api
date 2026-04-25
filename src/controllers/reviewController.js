const ReviewModel = require('../models/reviewModel');
const ScheduleModel = require('../models/scheduleModel');
const UserModel = require('../models/userModel');

const ReviewController = {
  async create(req, res) {
    const { scheduleId, rating, comment } = req.body;

    const schedule = await ScheduleModel.findById(scheduleId);
    if (!schedule) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    if (schedule.clientId !== req.user.uid) return res.status(403).json({ error: 'Apenas o cliente pode avaliar.' });
    if (schedule.status !== 'completed') return res.status(400).json({ error: 'O serviço ainda não foi concluído.' });
    if (schedule.reviewed) return res.status(409).json({ error: 'Este agendamento já foi avaliado.' });

    const review = await ReviewModel.create({
      scheduleId,
      clientId: req.user.uid,
      professionalId: schedule.professionalId,
      rating,
      comment,
    });

    await ScheduleModel.update(scheduleId, { reviewed: true });

    const { rating: avg, total } = await ReviewModel.getAverageRating(schedule.professionalId);
    await UserModel.update(schedule.professionalId, { rating: avg, totalReviews: total });

    res.status(201).json({ message: 'Avaliação enviada.', review });
  },

  async getProfessionalReviews(req, res) {
    const { professionalId } = req.params;
    const reviews = await ReviewModel.findByProfessional(professionalId);
    const { rating, total } = await ReviewModel.getAverageRating(professionalId);
    res.json({ reviews, rating, total });
  },
};

module.exports = ReviewController;
