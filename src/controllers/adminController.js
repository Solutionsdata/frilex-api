const ServiceModel = require('../models/serviceModel');
const UserModel = require('../models/userModel');
const NotificationService = require('../services/notificationService');
const { getFirestore } = require('../config/firebase');

const AdminController = {
  async getPendingServices(req, res) {
    const services = await ServiceModel.findPending();
    res.json({ services });
  },

  async reviewService(req, res) {
    const { id } = req.params;
    const { action, reason } = req.body; // 'approve' | 'reject'

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

  async getDashboardStats(req, res) {
    const db = getFirestore();
    const [usersSnap, schedulesSnap, servicesSnap] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('schedules').count().get(),
      db.collection('serviceCategories').where('status', '==', 'approved').count().get(),
    ]);

    res.json({
      totalUsers: usersSnap.data().count,
      totalSchedules: schedulesSnap.data().count,
      totalCategories: servicesSnap.data().count,
    });
  },

  async disableUser(req, res) {
    const { uid } = req.params;
    const { disabled, reason } = req.body;
    await UserModel.update(uid, { disabled: Boolean(disabled), disabledReason: reason || null });
    res.json({ message: `Usuário ${disabled ? 'desativado' : 'reativado'}.` });
  },
};

module.exports = AdminController;
