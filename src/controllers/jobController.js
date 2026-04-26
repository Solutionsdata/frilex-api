const JobModel = require('../models/jobModel');
const ChatModel = require('../models/chatModel');
const UserModel = require('../models/userModel');
const WhatsApp = require('../services/whatsappService');
const NotificationModel = require('../models/notificationModel');
const { WalletModel } = require('../models/walletModel');
const { getFirestore } = require('../config/firebase');

const PRICE_LABELS = { fixed: 'por serviço', daily: 'por dia', weekly: 'por semana', monthly: 'por mês' };

function fmtPrice(price, priceType) {
  if (!price) return 'A combinar';
  return `R$ ${Number(price).toFixed(2)} ${PRICE_LABELS[priceType] || ''}`.trim();
}

function fmtCurrency(n) {
  return `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function getAdminUid() {
  const db = getFirestore();
  const snap = await db.collection('users').where('role', '==', 'admin').limit(1).get();
  return snap.docs[0]?.id || null;
}

const JobController = {
  async list(req, res) {
    const { uid } = req.user;
    const [openJobs, myPostedJobs, myAcceptedJobs, myProposalJobs] = await Promise.all([
      JobModel.listOpen(),
      JobModel.listByClient(uid),
      JobModel.listByProfessional(uid),
      JobModel.listByProposer(uid),
    ]);
    const seen = new Set();
    const jobs = [...openJobs, ...myPostedJobs, ...myAcceptedJobs, ...myProposalJobs].filter((j) => {
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      return true;
    });
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ jobs });
  },

  async listOpen(req, res) {
    const jobs = await JobModel.listOpen();
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

  // Applicant directly accepts job at stated price
  async accept(req, res) {
    const { uid, name: applicantName } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Esta oportunidade não está mais disponível.' });
    if (job.clientId === uid) return res.status(400).json({ error: 'Você não pode aceitar seu próprio trabalho.' });

    await JobModel.accept(job.id, uid);

    const chat = await ChatModel.createOrGetChat(job.clientId, uid);
    const locationText = [job.neighborhood, job.city, job.state].filter(Boolean).join(', ');
    const text = `🤝 Aceitei seu trabalho!\n\n📋 *${job.title}*\n\n💰 ${fmtPrice(job.price, job.priceType)}\n📍 ${locationText}${job.notes ? `\n\n📝 ${job.notes}` : ''}\n\nAguardando seu pagamento via PIX para confirmar. ✅`;
    await ChatModel.sendMessage(chat.id, { senderId: uid, receiverId: job.clientId, text, type: 'text' });

    // Notify poster
    NotificationModel.create(job.clientId, {
      type: 'job_accepted',
      title: '🤝 Trabalho Aceito!',
      body: `${applicantName} aceitou seu trabalho "${job.title}". Confirme o pagamento PIX.`,
      data: { jobId: job.id },
    }).catch(() => {});

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

  // Applicant sends a proposal
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

    // Notify poster
    const priceInfo = proposal.currentPrice ? ` — ${fmtCurrency(proposal.currentPrice)}` : '';
    NotificationModel.create(job.clientId, {
      type: 'new_proposal',
      title: '📨 Nova Proposta Recebida!',
      body: `${name} fez uma proposta em "${job.title}"${priceInfo}.`,
      data: { jobId: job.id, proposalId: proposal.id },
    }).catch(() => {});

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

  // Add a counter-round (poster or applicant)
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
    if (!isPosted && !isApplicant) return res.status(403).json({ error: 'Sem permissão.' });

    const updated = await JobModel.counterProposal(jobId, proposalId, {
      from: isPosted ? 'poster' : 'applicant',
      price: proposedPrice ? Number(proposedPrice) : null,
      message: observation.trim(),
    });

    // Notify the other party
    const otherUserId = isPosted ? proposal.professionalId : job.clientId;
    const priceInfo = updated.currentPrice ? ` — ${fmtCurrency(updated.currentPrice)}` : '';
    NotificationModel.create(otherUserId, {
      type: 'counter_proposal',
      title: '↩️ Contra-proposta Recebida',
      body: `${name} fez uma contra-proposta em "${job.title}"${priceInfo}.`,
      data: { jobId, proposalId },
    }).catch(() => {});

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

  // Accept a proposal (poster or applicant)
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
    const priceText = fmtPrice(accepted.currentPrice, job.priceType);
    const locationText = [job.neighborhood, job.city, job.state].filter(Boolean).join(', ');
    const text = `🤝 Proposta aceita!\n\n📋 *${job.title}*\n💰 Valor acordado: ${priceText}\n📍 ${locationText}\n\nAguardando confirmação do pagamento PIX para iniciar.`;
    const receiverId = uid === job.clientId ? proposal.professionalId : job.clientId;
    await ChatModel.sendMessage(chat.id, { senderId: uid, receiverId, text, type: 'text' });

    // Notify the other party
    if (uid === job.clientId) {
      NotificationModel.create(proposal.professionalId, {
        type: 'proposal_accepted',
        title: '🎉 Proposta Aceita!',
        body: `Sua proposta em "${job.title}" foi aceita! ${fmtCurrency(accepted.currentPrice || 0)}.`,
        data: { jobId, proposalId },
      }).catch(() => {});
      const professional = await UserModel.findById(proposal.professionalId);
      WhatsApp.proposalAccepted(professional?.phone, {
        professionalName: proposal.professionalName,
        jobTitle: job.title,
        clientName: job.clientName,
        price: accepted.currentPrice,
        priceType: job.priceType,
      });
    } else {
      // Applicant accepted poster's counter — notify poster to pay
      NotificationModel.create(job.clientId, {
        type: 'proposal_accepted',
        title: '✅ Proposta Confirmada!',
        body: `${proposal.professionalName} aceitou sua contra-proposta em "${job.title}". Confirme o PIX.`,
        data: { jobId, proposalId },
      }).catch(() => {});
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
    const priceText = job.confirmedPrice ? `💰 ${fmtCurrency(job.confirmedPrice)}\n` : '';
    const text = `💸 Pagamento confirmado!\n\n📋 *${job.title}*\n${priceText}\nTrabalho confirmado — pode iniciar! ✅`;
    await ChatModel.sendMessage(chat.id, { senderId: uid, receiverId: job.acceptedBy, text, type: 'text' });

    // Notify applicant
    NotificationModel.create(job.acceptedBy, {
      type: 'payment_confirmed',
      title: '💸 Pagamento Confirmado!',
      body: `Pagamento de ${fmtCurrency(job.confirmedPrice || 0)} confirmado para "${job.title}". Pode iniciar!`,
      data: { jobId: job.id },
    }).catch(() => {});

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
    const text = `✅ Serviço concluído!\n\n${completionNote ? `📝 ${completionNote}\n\n` : ''}Confirme a conclusão para liberar o pagamento.`;
    await ChatModel.sendMessage(chat.id, { senderId: uid, receiverId: job.clientId, text, type: 'text' });

    // Notify poster
    NotificationModel.create(job.clientId, {
      type: 'job_completed',
      title: '✅ Serviço Concluído!',
      body: `${applicantName} concluiu "${job.title}". Confirme para liberar o pagamento de ${fmtCurrency(job.confirmedPrice || 0)}.`,
      data: { jobId: job.id },
    }).catch(() => {});

    const client = await UserModel.findById(job.clientId);
    WhatsApp.jobCompletedByProfessional(client?.phone, {
      clientName: job.clientName,
      jobTitle: job.title,
      professionalName: applicantName,
      completionNote: completionNote || '',
    });

    res.json({ success: true });
  },

  // Poster confirms completion — releases payment to worker's wallet
  async confirmCompletion(req, res) {
    const { uid } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.clientId !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (job.status !== 'awaiting_confirmation') return res.status(400).json({ error: 'Aguardando o prestador marcar como concluído.' });

    await JobModel.confirmCompletion(job.id);

    // Credit worker's wallet
    const amount = job.confirmedPrice || job.price || 0;
    if (amount > 0) {
      WalletModel.credit(
        job.acceptedBy,
        amount,
        `Pagamento liberado: "${job.title}"`,
        job.id
      ).catch(() => {});
    }

    // Notify worker
    NotificationModel.create(job.acceptedBy, {
      type: 'payment_released',
      title: '💰 Pagamento Liberado!',
      body: `${fmtCurrency(amount)} creditado na sua carteira pelo trabalho "${job.title}".`,
      data: { jobId: job.id },
    }).catch(() => {});

    const professional = await UserModel.findById(job.acceptedBy);
    WhatsApp.paymentReleased(professional?.phone, {
      professionalName: professional?.name || '',
      jobTitle: job.title,
      price: amount,
      priceType: job.priceType,
    });

    res.json({ success: true, message: 'Serviço confirmado. Pagamento liberado na carteira do prestador!' });
  },

  async cancel(req, res) {
    const { uid } = req.user;
    const job = await JobModel.getById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada.' });
    if (job.clientId !== uid) return res.status(403).json({ error: 'Sem permissão.' });
    if (!['open', 'awaiting_payment', 'confirmed'].includes(job.status))
      return res.status(400).json({ error: 'Este trabalho não pode ser cancelado.' });

    await JobModel.cancel(job.id);

    // If PIX was already confirmed, refund poster (minus 5% fee)
    if (job.status === 'confirmed') {
      const amount = job.confirmedPrice || job.price || 0;
      if (amount > 0) {
        const adminUid = await getAdminUid();
        const refund = await WalletModel.processRefund(uid, adminUid, amount, job.title);

        NotificationModel.create(uid, {
          type: 'refund_processed',
          title: '↩️ Reembolso Processado',
          body: `Cancelamento de "${job.title}": reembolso de ${fmtCurrency(refund.refundAmount)} (taxa 5%: ${fmtCurrency(refund.fee)}).`,
          data: { jobId: job.id },
        }).catch(() => {});
      }

      // Notify the worker who was hired
      if (job.acceptedBy) {
        NotificationModel.create(job.acceptedBy, {
          type: 'job_cancelled',
          title: '❌ Trabalho Cancelado',
          body: `O contratante cancelou o trabalho "${job.title}".`,
          data: { jobId: job.id },
        }).catch(() => {});
      }
    }

    res.json({ success: true });
  },
};

module.exports = JobController;
