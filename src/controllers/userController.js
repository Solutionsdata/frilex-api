const UserModel = require('../models/userModel');
const { uploadToFirebase } = require('../middleware/upload');

const UserController = {
  async getProfile(req, res) {
    const { uid } = req.params;
    const user = await UserModel.findById(uid);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const { password, fcmToken, ...safeUser } = user;
    res.json({ user: safeUser });
  },

  async updateProfile(req, res) {
    const allowedFields = ['name', 'bio', 'phone', 'location', 'services', 'availability'];
    const data = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) data[f] = req.body[f]; });

    const updated = await UserModel.update(req.user.uid, data);
    const { password, fcmToken, ...safeUser } = updated;
    res.json({ message: 'Perfil atualizado.', user: safeUser });
  },

  async uploadAvatar(req, res) {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    const url = await uploadToFirebase(req.file, `avatars/${req.user.uid}`);
    await UserModel.update(req.user.uid, { avatar: url });
    res.json({ message: 'Avatar atualizado.', avatarUrl: url });
  },

  async uploadDocument(req, res) {
    const { type } = req.params;
    const allowed = ['rg', 'cpf', 'proofOfAddress'];
    if (!allowed.includes(type)) return res.status(400).json({ error: 'Tipo de documento inválido.' });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    const url = await uploadToFirebase(req.file, `documents/${req.user.uid}/${type}`);
    await UserModel.update(req.user.uid, {
      [`documents.${type}`]: url,
      documentsStatus: 'pending',
    });
    res.json({ message: 'Documento enviado para análise.', url });
  },

  async searchProfessionals(req, res) {
    const { category, location, maxPrice, page = 1 } = req.query;
    const professionals = await UserModel.searchProfessionals({
      category,
      location,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      page: Number(page),
    });
    res.json({ professionals, page: Number(page) });
  },

  async updateFCMToken(req, res) {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token FCM é obrigatório.' });
    await UserModel.updateFCMToken(req.user.uid, token);
    res.json({ message: 'Token atualizado.' });
  },
};

module.exports = UserController;
