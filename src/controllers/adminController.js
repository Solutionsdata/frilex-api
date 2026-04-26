const ServiceModel = require('../models/serviceModel');
const UserModel = require('../models/userModel');
const NotificationService = require('../services/notificationService');
const { getFirestore } = require('../config/firebase');

const AdminController = {
  async getDashboardStats(req, res) {
    const db = getFirestore();

    const [usersSnap, professionalsSnap, clientsSnap, jobsSnap, schedulesSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('users').where('role', '==', 'professional').get(),
      db.collection('users').where('role', '==', 'client').get(),
      db.collection('jobPosts').get(),
      db.collection('schedules').count().get(),
    ]);

    // Professions breakdown
    const professionCounts = {};
    professionalsSnap.docs.forEach((d) => {
      const p = d.data().profession;
      if (p) professionCounts[p] = (professionCounts[p] || 0) + 1;
    });
    const topProfessions = Object.entries(professionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([profession, count]) => ({ profession, count }));

    // Registrations in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentUsers = usersSnap.docs.filter((d) => d.data().createdAt >= thirtyDaysAgo).length;

    // Jobs stats
    const jobDocs = jobsSnap.docs.map((d) => d.data());
    const openJobs = jobDocs.filter((j) => j.status === 'open').length;
    const confirmedJobs = jobDocs.filter((j) => j.status === 'confirmed').length;
    const completedJobs = jobDocs.filter((j) => j.status === 'completed').length;
    const cancelledJobs = jobDocs.filter((j) => j.status === 'cancelled').length;

    // Total value negotiated (confirmed + completed jobs)
    const totalNegotiated = jobDocs
      .filter((j) => ['confirmed', 'completed'].includes(j.status))
      .reduce((sum, j) => sum + (j.confirmedPrice || j.budget || 0), 0);

    // Documents status
    const pendingDocs = professionalsSnap.docs.filter((d) => d.data().documentsStatus === 'pending').length;
    const approvedProfessionals = professionalsSnap.docs.filter((d) => d.data().documentsStatus === 'approved').length;

    res.json({
      users: {
        total: usersSnap.size,
        clients: clientsSnap.size,
        professionals: professionalsSnap.size,
        recentLast30Days: recentUsers,
      },
      professionals: {
        approved: approvedProfessionals,
        pendingDocuments: pendingDocs,
        topProfessions,
      },
      jobs: {
        total: jobDocs.length,
        open: openJobs,
        confirmed: confirmedJobs,
        completed: completedJobs,
        cancelled: cancelledJobs,
        totalNegotiatedValue: totalNegotiated,
      },
      schedules: schedulesSnap.data().count,
    });
  },

  async listUsers(req, res) {
    const db = getFirestore();
    const { role, page = 1, limit = 50 } = req.query;

    let query = db.collection('users');
    if (role) query = query.where('role', '==', role);

    const snap = await query.get();
    const users = snap.docs.map((doc) => {
      const { password, fcmToken, ...data } = doc.data();
      return { uid: doc.id, ...data };
    });

    // Sort by createdAt desc (client-side to avoid composite index)
    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const start = (Number(page) - 1) * Number(limit);
    const paginated = users.slice(start, start + Number(limit));

    res.json({ users: paginated, total: users.length });
  },

  async getPendingServices(req, res) {
    const services = await ServiceModel.findPending();
    res.json({ services });
  },

  async reviewService(req, res) {
    const { id } = req.params;
    const { action, reason } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Ação inválida.' });
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const service = await ServiceModel.updateStatus(id, status, req.user.uid);

    const suggester = await UserModel.findById(service.suggestedBy);
    if (suggester?.fcmToken) {
      await NotificationService.send(suggester.fcmToken, {
        title: action === 'approve' ? 'Serviço Aprovado!' : 'Serviço Recusado',
        body: action === 'approve'
          ? `Sua sugestão "${service.name}" foi aprovada!`
          : `Sua sugestão "${service.name}" foi recusada. ${reason || ''}`,
        data: { type: 'service_review', serviceId: service.id, status },
      });
    }

    res.json({ message: `Serviço ${status === 'approved' ? 'aprovado' : 'recusado'}.`, service });
  },

  async getPendingDocuments(req, res) {
    const db = getFirestore();
    const snap = await db.collection('users')
      .where('role', '==', 'professional')
      .where('documentsStatus', '==', 'pending')
      .get();

    const professionals = snap.docs.map((doc) => {
      const { password, fcmToken, ...data } = doc.data();
      return { uid: doc.id, ...data };
    });
    res.json({ professionals });
  },

  async reviewDocuments(req, res) {
    const { uid } = req.params;
    const { action, reason } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Ação inválida.' });
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    await UserModel.update(uid, {
      documentsStatus: status,
      documentsReviewedBy: req.user.uid,
      documentsReviewedAt: new Date().toISOString(),
      documentsRejectionReason: reason || null,
    });

    const professional = await UserModel.findById(uid);
    if (professional?.fcmToken) {
      await NotificationService.send(professional.fcmToken, {
        title: action === 'approve' ? 'Documentos Aprovados!' : 'Documentos Recusados',
        body: action === 'approve'
          ? 'Seus documentos foram aprovados. Seu perfil está ativo!'
          : `Seus documentos foram recusados. ${reason || 'Envie novamente.'}`,
        data: { type: 'documents_review', status },
      });
    }

    res.json({ message: `Documentos ${status === 'approved' ? 'aprovados' : 'recusados'}.` });
  },

  async disableUser(req, res) {
    const { uid } = req.params;
    const { disabled, reason } = req.body;
    await UserModel.update(uid, { disabled: Boolean(disabled), disabledReason: reason || null });
    res.json({ message: `Usuário ${disabled ? 'desativado' : 'reativado'}.` });
  },

  async listAllJobs(req, res) {
    const db = getFirestore();
    const { status } = req.query;
    let query = db.collection('jobPosts');
    if (status) query = query.where('status', '==', status);
    const snap = await query.get();
    const jobs = snap.docs.map((d) => d.data());
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ jobs, total: jobs.length });
  },
};

module.exports = AdminController;
