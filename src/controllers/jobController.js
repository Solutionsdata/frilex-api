const JobModel = require('../models/jobModel');
const ChatModel = require('../models/chatModel');
const UserModel = require('../models/userModel');
const WhatsApp = require('../services/whatsappService');

const JobController = {
  async list(req, res) {
    const { uid, role } = req.user;
    let jobs;
    if (role === 'client') {
      jobs = await JobModel.listByClient(uid);
    } else if (role === 'professional') {
      const [openJobs, myJobs] = await Promise.all([
        JobModel.listOpen(),
        JobModel.listByProfessional(uid),
      ]);
      const seen = new Set();
      jobs = [...openJobs, ...myJobs].filter((j) => {
        if (seen.has(j.id)) return false;
        seen.add(j.id);
        return true;
      });
    } else {
      jobs = await JobModel.listOpen();
    }
    res.json({ jobs });
  },

  async create(req, res) {
    const { uid, name, avatar } = req.user;
    const { title, description, category, price, priceType, city, state, neighborhood, notes } = req.body;
    if (!title || !description || !category || !city)
      return res.status(400).json({ error: 'Título, descrição, categoria e cidade são obrigatórios.' });

    const job = await JobModel.create({
      clientId: uid,
      clientName: name,
      clientAvatar: avatar || null,
      title: title.trim(),
      description: description.trim(),
      category,
      price: price ? Number(price) : null,
      priceType: priceType || 'fixed',
      city: city.trim(),
      state: state ? state.trim() : '',
      neighborhood: neighborhood ? neighborhood.trim() : '',
      notes: notes ? notes.trim() : null,
    });
    res.status(201).json({ job });
  },

  async getById(req, res) {
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    const proposals = await JobModel.getProposals(req.params.id);
    res.json({ job, proposals });
  },

  // Professional directly accepts the job at the original price
  async accept(req, res) {
    const professionalId = req.user.uid;
    const { name: professionalName } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Esta oportunidade não está mais disponível.' });
    if (job.clientId === professionalId) return res.status(400).json({ error: 'Você não pode aceitar sua própria oportunidade.' });

    await JobModel.accept(job.id, professionalId);

    const chat = await ChatModel.createOrGetChat(job.clientId, professionalId);
    const priceLabels = { fixed: 'por serviço', daily: 'por dia', weekly: 'por semana', monthly: 'por mês' };
    const priceText = job.price ? `R$ ${Number(job.price).toFixed(2)} ${priceLabels[job.priceType] || ''}`.trim() : 'A combinar';
    const locationText = [job.neighborhood, job.city, job.state].filter(Boolean).join(', ');
    const text = `✅ Oportunidade aceita!\n\n📋 *${job.title}*\n${job.description}\n\n💰 Valor: ${priceText}\n📍 ${locationText}${job.notes ? `\n\n📝 Observações: ${job.notes}` : ''}`;
    await ChatModel.sendMessage(chat.id, { senderId: professionalId, receiverId: job.clientId, text, type: 'text' });

    // WhatsApp: notify client that professional accepted
    const client = await UserModel.findById(job.clientId);
    WhatsApp.proposalAccepted(client?.phone, {
      professionalName,
      jobTitle: job.title,
      clientName: job.clientName,
      price: job.price,
      priceType: job.priceType,
    });

    res.json({ success: true, otherUserId: job.clientId, message: 'Oportunidade aceita com sucesso!' });
  },

  // Professional sends a counter-proposal
  async propose(req, res) {
    const { uid, name, avatar } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Esta oportunidade não está mais disponível.' });
    if (job.clientId === uid) return res.status(400).json({ error: 'Você não pode fazer proposta na sua própria oportunidade.' });

    const { proposedPrice, observation } = req.body;
    if (!observation || observation.trim().length < 5)
      return res.status(400).json({ error: 'Escreva uma observação técnica (mínimo 5 caracteres).' });

    const proposal = await JobModel.addProposal(job.id, {
      professionalId: uid,
      professionalName: name,
      professionalAvatar: avatar || null,
      proposedPrice: proposedPrice || job.price,
      observation: observation.trim(),
    });

    // WhatsApp: notify client about new proposal
    const client = await UserModel.findById(job.clientId);
    WhatsApp.newProposal(client?.phone, {
      clientName: job.clientName,
      jobTitle: job.title,
      professionalName: name,
      proposedPrice: proposal.proposedPrice,
      priceType: job.priceType,
    });

    res.status(201).json({ proposal });
  },

  // Client accepts a specific proposal
  async acceptProposal(req, res) {
    const { uid } = req.user;
    const { jobId, proposalId } = req.params;
    const job = await JobModel.getById(jobId);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.clientId !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Esta oportunidade não está mais aberta.' });

    const proposal = await JobModel.acceptProposal(jobId, proposalId);

    const chat = await ChatModel.createOrGetChat(uid, proposal.professionalId);
    const priceLabels = { fixed: 'por serviço', daily: 'por dia', weekly: 'por semana', monthly: 'por mês' };
    const priceText = proposal.proposedPrice ? `R$ ${Number(proposal.proposedPrice).toFixed(2)} ${priceLabels[job.priceType] || ''}`.trim() : 'A combinar';
    const locationText = [job.neighborhood, job.city, job.state].filter(Boolean).join(', ');
    const text = `🤝 Proposta aceita!\n\n📋 *${job.title}*\n${job.description}\n\n💰 Valor acordado: ${priceText}\n📍 ${locationText}${proposal.observation ? `\n\n📝 Observação técnica: ${proposal.observation}` : ''}`;
    await ChatModel.sendMessage(chat.id, { senderId: uid, receiverId: proposal.professionalId, text, type: 'text' });

    // WhatsApp: notify professional that their proposal was accepted
    const professional = await UserModel.findById(proposal.professionalId);
    WhatsApp.proposalAccepted(professional?.phone, {
      professionalName: proposal.professionalName,
      jobTitle: job.title,
      clientName: job.clientName,
      price: proposal.proposedPrice,
      priceType: job.priceType,
    });

    res.json({ success: true, otherUserId: proposal.professionalId, job: await JobModel.getById(jobId) });
  },

  // Professional marks job as started
  async startJob(req, res) {
    const { uid } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.acceptedBy !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (job.status !== 'confirmed') return res.status(400).json({ error: 'Vaga não está confirmada.' });
    await JobModel.startJob(job.id);
    res.json({ success: true });
  },

  // Professional marks job as complete with evidence
  async completeByProfessional(req, res) {
    const { uid, name: professionalName } = req.user;
    const { completionNote } = req.body;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.acceptedBy !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (!['confirmed', 'in_progress'].includes(job.status)) return res.status(400).json({ error: 'Status inválido.' });
    await JobModel.completeByProfessional(job.id, completionNote);

    // In-app chat notification
    const chat = await ChatModel.createOrGetChat(job.clientId, uid);
    const text = `✅ Serviço concluído!\n\n${completionNote ? `📝 ${completionNote}\n\n` : ''}Por favor, confirme a conclusão na plataforma para liberar o pagamento.`;
    await ChatModel.sendMessage(chat.id, { senderId: uid, receiverId: job.clientId, text, type: 'text' });

    // WhatsApp: notify client to confirm completion
    const client = await UserModel.findById(job.clientId);
    WhatsApp.jobCompletedByProfessional(client?.phone, {
      clientName: job.clientName,
      jobTitle: job.title,
      professionalName,
      completionNote: completionNote || '',
    });

    res.json({ success: true });
  },

  // Client confirms job completion (releases payment)
  async confirmCompletion(req, res) {
    const { uid } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.clientId !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (job.status !== 'awaiting_confirmation') return res.status(400).json({ error: 'Aguardando o profissional marcar como concluído.' });
    await JobModel.confirmCompletion(job.id);

    // WhatsApp: notify professional that payment was released
    const professional = await UserModel.findById(job.acceptedBy);
    WhatsApp.paymentReleased(professional?.phone, {
      professionalName: professional?.name || '',
      jobTitle: job.title,
      price: job.confirmedPrice || job.price,
      priceType: job.priceType,
    });

    res.json({ success: true, message: 'Serviço confirmado. Pagamento liberado!' });
  },

  async cancel(req, res) {
    const { uid } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.clientId !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (!['open', 'confirmed'].includes(job.status)) return res.status(400).json({ error: 'Esta oportunidade não pode ser cancelada.' });
    await JobModel.cancel(job.id);
    res.json({ success: true });
  },
};

module.exports = JobController;
