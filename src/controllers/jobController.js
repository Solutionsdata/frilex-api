const JobModel = require('../models/jobModel');
const ChatModel = require('../models/chatModel');
const UserModel = require('../models/userModel');

const JobController = {
  async list(req, res) {
    const { uid, role } = req.user;
    const jobs = role === 'client'
      ? await JobModel.listByClient(uid)
      : await JobModel.listOpen();
    res.json({ jobs });
  },

  async create(req, res) {
    const { uid, name, avatar } = req.user;
    const { title, description, category, budget, city, state } = req.body;
    if (!title || !description || !category || !city)
      return res.status(400).json({ error: 'Título, descrição, categoria e cidade são obrigatórios.' });

    const job = await JobModel.create({
      clientId: uid,
      clientName: name,
      clientAvatar: avatar || null,
      title: title.trim(),
      description: description.trim(),
      category,
      budget: budget ? Number(budget) : null,
      city: city.trim(),
      state: state ? state.trim() : '',
    });
    res.status(201).json({ job });
  },

  async getById(req, res) {
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    res.json({ job });
  },

  async accept(req, res) {
    const professionalId = req.user.uid;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Esta vaga não está mais disponível.' });
    if (job.clientId === professionalId) return res.status(400).json({ error: 'Você não pode aceitar sua própria vaga.' });

    await JobModel.accept(job.id, professionalId);

    // Create chat and send initial message with job details
    const chat = await ChatModel.createOrGetChat(job.clientId, professionalId);
    const budgetText = job.budget ? `R$ ${Number(job.budget).toFixed(2)}` : 'A combinar';
    const text = `✅ Vaga aceita!\n\n📋 ${job.title}\n${job.description}\n\n💰 Orçamento: ${budgetText}\n📍 ${job.city}${job.state ? `, ${job.state}` : ''}`;
    await ChatModel.sendMessage(chat.id, { senderId: professionalId, receiverId: job.clientId, text, type: 'text' });

    res.json({ success: true, otherUserId: job.clientId, message: 'Vaga aceita com sucesso!' });
  },

  async cancel(req, res) {
    const { uid } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.clientId !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Apenas vagas abertas podem ser canceladas.' });
    await JobModel.cancel(job.id);
    res.json({ success: true });
  },
};

module.exports = JobController;
