const ServiceModel = require('../models/serviceModel');

const ServiceController = {
  async listCategories(req, res) {
    const categories = await ServiceModel.findAll('approved');
    res.json({ categories });
  },

  async suggestCategory(req, res) {
    const service = await ServiceModel.create({
      ...req.body,
      suggestedBy: req.user.uid,
    });
    res.status(201).json({
      message: 'Sugestão enviada. Aguardando aprovação do administrador.',
      service,
    });
  },

  async getCategory(req, res) {
    const service = await ServiceModel.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Categoria não encontrada.' });
    res.json({ service });
  },
};

module.exports = ServiceController;
