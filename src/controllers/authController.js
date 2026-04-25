const AuthService = require('../services/authService');

const AuthController = {
  async register(req, res) {
    const result = await AuthService.register(req.body);
    res.status(201).json({ message: 'Cadastro realizado com sucesso.', ...result });
  },

  async login(req, res) {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    res.json({ message: 'Login realizado com sucesso.', ...result });
  },

  async loginWithGoogle(req, res) {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken é obrigatório.' });
    const result = await AuthService.loginWithGoogle(idToken);
    res.json({ message: 'Login com Google realizado.', ...result });
  },

  async refresh(req, res) {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken é obrigatório.' });
    const tokens = await AuthService.refreshToken(refreshToken);
    res.json(tokens);
  },

  async me(req, res) {
    const { password, ...safeUser } = req.user;
    res.json({ user: safeUser });
  },
};

module.exports = AuthController;
