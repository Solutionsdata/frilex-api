const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getAuth } = require('../config/firebase');
const UserModel = require('../models/userModel');
const WhatsApp = require('./whatsappService');

const SALT_ROUNDS = 12;

const AuthService = {
  generateTokens(uid) {
    const access = jwt.sign({ uid }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
    const refresh = jwt.sign({ uid, type: 'refresh' }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    });
    return { access, refresh };
  },

  async register(data) {
    const existing = await UserModel.findByEmail(data.email);
    if (existing) {
      const err = new Error('E-mail já cadastrado.');
      err.status = 409;
      throw err;
    }

    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    const firebaseUser = await getAuth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.name,
    });

    const user = await UserModel.create(firebaseUser.uid, {
      ...data,
      password: hashedPassword,
    });

    const tokens = this.generateTokens(firebaseUser.uid);
    const { password, ...safeUser } = user;

    // WhatsApp welcome (fire-and-forget)
    if (data.phone) {
      WhatsApp.welcome(data.phone, { name: data.name, role: data.role });
    }

    return { user: safeUser, ...tokens };
  },

  async login(email, password) {
    const user = await UserModel.findByEmail(email);
    if (!user) {
      const err = new Error('Credenciais inválidas.');
      err.status = 401;
      throw err;
    }

    if (user.disabled) {
      const err = new Error('Conta desativada. Entre em contato com o suporte.');
      err.status = 403;
      throw err;
    }

    if (!user.password) {
      const err = new Error('Senha não configurada. Solicite ao administrador o acesso à sua conta.');
      err.status = 401;
      throw err;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      const err = new Error('Credenciais inválidas.');
      err.status = 401;
      throw err;
    }

    const tokens = this.generateTokens(user.uid);
    const { password: _, ...safeUser } = user;
    return { user: safeUser, ...tokens };
  },

  async loginWithGoogle(idToken) {
    const decoded = await getAuth().verifyIdToken(idToken);
    let user = await UserModel.findById(decoded.uid);

    if (!user) {
      user = await UserModel.create(decoded.uid, {
        name: decoded.name || decoded.email.split('@')[0],
        email: decoded.email,
        avatar: decoded.picture || null,
        role: 'user',
        password: null,
      });
    }

    const tokens = this.generateTokens(user.uid);
    const { password, ...safeUser } = user;
    return { user: safeUser, ...tokens };
  },

  async refreshToken(refreshToken) {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') throw new Error('Token inválido.');

    const user = await UserModel.findById(decoded.uid);
    if (!user || user.disabled) throw new Error('Usuário não encontrado.');

    return this.generateTokens(decoded.uid);
  },
};

module.exports = AuthService;
