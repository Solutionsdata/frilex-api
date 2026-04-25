const Joi = require('joi');

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const details = error.details.map((d) => d.message);
    return res.status(400).json({ error: 'Dados inválidos.', details });
  }
  next();
};

const schemas = {
  register: Joi.object({
    name: Joi.string().min(2).max(100).required().messages({
      'string.min': 'Nome deve ter pelo menos 2 caracteres.',
      'any.required': 'Nome é obrigatório.',
    }),
    email: Joi.string().email().required().messages({
      'string.email': 'E-mail inválido.',
      'any.required': 'E-mail é obrigatório.',
    }),
    password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().messages({
      'string.min': 'Senha deve ter pelo menos 8 caracteres.',
      'string.pattern.base': 'Senha deve ter maiúscula, minúscula e número.',
      'any.required': 'Senha é obrigatória.',
    }),
    role: Joi.string().valid('client', 'professional').required().messages({
      'any.only': 'Perfil deve ser cliente ou profissional.',
      'any.required': 'Perfil é obrigatório.',
    }),
    phone: Joi.string().pattern(/^\+?[1-9]\d{10,14}$/).optional(),
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  serviceCategory: Joi.object({
    name: Joi.string().min(3).max(80).required(),
    description: Joi.string().min(10).max(500).required(),
    icon: Joi.string().optional(),
    basePrice: Joi.number().positive().optional(),
  }),

  schedule: Joi.object({
    professionalId: Joi.string().required(),
    serviceId: Joi.string().required(),
    date: Joi.date().min('now').required(),
    notes: Joi.string().max(500).optional(),
  }),

  review: Joi.object({
    scheduleId: Joi.string().required(),
    rating: Joi.number().min(1).max(5).required(),
    comment: Joi.string().min(5).max(1000).optional(),
  }),
};

module.exports = { validate, schemas };
