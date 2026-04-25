const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message, details: err.details });
  }

  if (err.code === 'auth/email-already-exists') {
    return res.status(409).json({ error: 'E-mail já cadastrado.' });
  }

  if (err.message?.includes('Tipo de arquivo não permitido')) {
    return res.status(400).json({ error: err.message });
  }

  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Erro interno do servidor.'
    : err.message || 'Erro interno do servidor.';

  res.status(status).json({ error: message });
};

module.exports = errorHandler;
