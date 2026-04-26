const jwt = require('jsonwebtoken');
const { getFirestore } = require('../config/firebase');

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(decoded.uid).get();

    if (!userDoc.exists) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    const userData = userDoc.data();
    if (userData.disabled) {
      return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
    }

    req.user = { uid: decoded.uid, ...userData };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Acesso não autorizado para este perfil.' });
  }
  next();
};

const requireAdmin = requireRole('admin');
// Legacy aliases — any authenticated user can do client/professional actions now
const requireProfessional = authenticate;
const requireClient = authenticate;

module.exports = { authenticate, requireRole, requireAdmin, requireProfessional, requireClient };
