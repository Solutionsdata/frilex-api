const JobModel = require('../models/jobModel');
const ChatModel = require('../models/chatModel');
const UserModel = require('../models/userModel');
const WhatsApp = require('../services/whatsappService');

const PRICE_LABELS = { fixed: 'por serviço', daily: 'por dia', weekly: 'por semana', monthly: 'por mês' };

function fmtPrice(price, priceType) {
  if (!price) return 'A combinar';
  return `R$ ${Number(price).toFixed(2)} ${PRICE_LABELS[priceType] || ''}`.trim();
}

const JobController = {
  async list(req, res) {
    const { uid } = req.user;
    const [openJobs, myPostedJobs, myAcceptedJobs] = await Promise.all([
      JobModel.listOpen(),
      JobModel.listByClient(uid),
      JobModel.listByProfessional(uid),
    ]);
    const seen = new Set();
    const jobs = [...openJobs, ...myPostedJobs, ...myAcceptedJobs].filter((j) => {
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      return true;
    });
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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

  // Any user accepts a job at the stated price (not their own job)
  async accept(req, res) {
    const { uid, name: applicantName } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Esta oportunidade não está mais disponível.' });
    if (job.clientId === uid) return res.status(400).json({ error: 'Você não pode aceitar seu próprio trabalho.' });

    await JobModel.accept(job.id, uid);

    const chat = await ChatModel.createOrGetChat(job.clientId, uid);
    const locationText = [job.neighborhood, job.city, job.state].filter(Boolean).join(', ');
    const text = `🤝 Aceitei seu trabalho!\n\n📋 *${job.title}*\n${job.description}\n\n💰 ${fmtPrice(job.price, job.priceType)}\n📍 ${locationText}${job.notes ? `\n\n📝 ${job.notes}` : ''}\n\nAguardando confirmação do pagamento via PIX. ✅`;
    await ChatModel.sendMessage(chat.id, { senderId: uid, receiverId: job.clientId, text, type: 'text' });

    const client = await UserModel.findById(job.clientId);
    WhatsApp.proposalAccepted(client?.phone, {
      professionalName: applicantName,
      jobTitle: job.title,
      clientName: job.clientName,
      price: job.price,
      priceType: job.priceType,
    });

    res.json({ success: true, otherUserId: job.clientId, message: 'Trabalho aceito! Aguardando pagamento PIX do contratante.' });
  },

  // Any user sends a proposal on a job they didn't post
  async propose(req, res) {
    const { uid, name, avatar } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Esta oportunidade não está mais disponível.' });
    if (job.clientId === uid) return res.status(400).json({ error: 'Você não pode fazer proposta no seu próprio trabalho.' });

    const { proposedPrice, observation } = req.body;
    if (!observation || observation.trim().length < 5)
      return res.status(400).json({ error: 'Escreva uma observação (mínimo 5 caracteres).' });

    const proposal = await JobModel.addProposal(job.id, {
      professionalId: uid,
      professionalName: name,
      professionalAvatar: avatar || null,
      proposedPrice: proposedPrice || job.price,
      observation: observation.trim(),
    });

    const client = await UserModel.findById(job.clientId);
    WhatsApp.newProposal(client?.phone, {
      clientName: job.clientName,
      jobTitle: job.title,
      professionalName: name,
      proposedPrice: proposal.currentPrice,
      priceType: job.priceType,
    });

    res.status(201).json({ proposal });
  },

  // Add a counter-round to a proposal (poster or applicant)
  async counterProposal(req, res) {
    const { uid, name } = req.user;
    const { jobId, proposalId } = req.params;
    const { proposedPrice, observation } = req.body;

    if (!observation || observation.trim().length < 5)
      return res.status(400).json({ error: 'Escreva uma mensagem (mínimo 5 caracteres).' });

    const job = await JobModel.getById(jobId);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Esta oportunidade não está mais disponível.' });

    const proposal = await JobModel.getProposalById(jobId, proposalId);
    if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada.' });
    if (proposal.status !== 'pending') return res.status(400).json({ error: 'Esta proposta não está mais ativa.' });

    const isPosted = job.clientId === uid;
    const isApplicant = proposal.professionalId === uid;
    if (!isPosted && !isApplicant)
      return res.status(403).json({ error: 'Sem permissão.' });

    const updated = await JobModel.counterProposal(jobId, proposalId, {
      from: isPosted ? 'poster' : 'applicant',
      price: proposedPrice ? Number(proposedPrice) : null,
      message: observation.trim(),
    });

    // Notify the other party
    const otherUserId = isPosted ? proposal.professionalId : job.clientId;
    const otherUser = await UserModel.findById(otherUserId);
    if (otherUser?.phone) {
      WhatsApp.newProposal(otherUser.phone, {
        clientName: otherUser.name,
        jobTitle: job.title,
        professionalName: name,
        proposedPrice: updated.currentPrice,
        priceType: job.priceType,
      });
    }

    res.json({ proposal: updated });
  },

  // Poster or applicant accepts a proposal at current negotiated price
  async acceptProposal(req, res) {
    const { uid } = req.user;
    const { jobId, proposalId } = req.params;
    const job = await JobModel.getById(jobId);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Esta oportunidade não está mais aberta.' });

    const proposal = await JobModel.getProposalById(jobId, proposalId);
    if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada.' });
    if (job.clientId !== uid && proposal.professionalId !== uid)
      return res.status(403).json({ error: 'Sem permissão.' });

    const accepted = await JobModel.acceptProposal(jobId, proposalId);

    const chat = await ChatModel.createOrGetChat(job.clientId, proposal.professionalId);
    const locationText = [job.neighborhood, job.city, job.state].filter(Boolean).join(', ');
    const priceText = fmtPrice(accepted.currentPrice, job.priceType);
    const text = `🤝 Proposta aceita!\n\n📋 *${job.title}*\n\n💰 Valor acordado: ${priceText}\n📍 ${locationText}\n\nAguardando confirmação do pagamento PIX para iniciar o trabalho.`;
    const receiverId = uid === job.clientId ? proposal.professionalId : job.clientId;
    await ChatModel.sendMessage(chat.id, { senderId: uid, receiverId, text, type: 'text' });

    // Notify the other party
    if (uid === job.clientId) {
      const professional = await UserModel.findById(proposal.professionalId);
      WhatsApp.proposalAccepted(professional?.phone, {
        professionalName: proposal.professionalName,
        jobTitle: job.title,
        clientName: job.clientName,
        price: accepted.currentPrice,
        priceType: job.priceType,
      });
    } else {
      const client = await UserModel.findById(job.clientId);
      WhatsApp.proposalAccepted(client?.phone, {
        professionalName: proposal.professionalName,
        jobTitle: job.title,
        clientName: job.clientName,
        price: accepted.currentPrice,
        priceType: job.priceType,
      });
    }

    res.json({
      success: true,
      otherUserId: receiverId,
      pixKey: process.env.PLATFORM_PIX_KEY || null,
      pixAmount: accepted.currentPrice,
      job: await JobModel.getById(jobId),
    });
  },

  // Poster confirms PIX payment — job moves to confirmed
  async confirmPayment(req, res) {
    const { uid } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.clientId !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (job.status !== 'awaiting_payment') return res.status(400).json({ error: 'Vaga não está aguardando pagamento.' });

    await JobModel.confirmPayment(job.id);

    const chat = await ChatModel.createOrGetChat(job.clientId, job.acceptedBy);
    const priceText = job.confirmedPrice ? `💰 R$ ${Number(job.confirmedPrice).toFixed(2)}\n` : '';
    const text = `💸 Pagamento PIX confirmado!\n\n📋 *${job.title}*\n${priceText}\nTrabalho confirmado. Pode iniciar! ✅`;
    await ChatModel.sendMessage(chat.id, { senderId: uid, receiverId: job.acceptedBy, text, type: 'text' });

    const acceptedUser = await UserModel.findById(job.acceptedBy);
    WhatsApp.paymentReleased(acceptedUser?.phone, {
      professionalName: acceptedUser?.name || '',
      jobTitle: job.title,
      price: job.confirmedPrice,
      priceType: job.priceType,
    });

    res.json({ success: true, message: 'Pagamento confirmado! Trabalho iniciado.' });
  },

  async startJob(req, res) {
    const { uid } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.acceptedBy !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (job.status !== 'confirmed') return res.status(400).json({ error: 'Trabalho não está confirmado.' });
    await JobModel.startJob(job.id);
    res.json({ success: true });
  },

  async completeByProfessional(req, res) {
    const { uid, name: applicantName } = req.user;
    const { completionNote } = req.body;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.acceptedBy !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (!['confirmed', 'in_progress'].includes(job.status)) return res.status(400).json({ error: 'Status inválido.' });
    await JobModel.completeByProfessional(job.id, completionNote);

    const chat = await ChatModel.createOrGetChat(job.clientId, uid);
    const text = `✅ Serviço concluído!\n\n${completionNote ? `📝 ${completionNote}\n\n` : ''}Por favor, confirme a conclusão na plataforma para liberar o pagamento.`;
    await ChatModel.sendMessage(chat.id, { senderId: uid, receiverId: job.clientId, text, type: 'text' });

    const client = await UserModel.findById(job.clientId);
    WhatsApp.jobCompletedByProfessional(client?.phone, {
      clientName: job.clientName,
      jobTitle: job.title,
      professionalName: applicantName,
      completionNote: completionNote || '',
    });

    res.json({ success: true });
  },

  async confirmCompletion(req, res) {
    const { uid } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.clientId !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (job.status !== 'awaiting_confirmation') return res.status(400).json({ error: 'Aguardando o prestador marcar como concluído.' });
    await JobModel.confirmCompletion(job.id);

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
    if (!['open', 'confirmed'].includes(job.status)) return res.status(400).json({ error: 'Este trabalho não pode ser cancelado.' });
    await JobModel.cancel(job.id);
    res.json({ success: true });
  },
};

module.exports = JobController;
