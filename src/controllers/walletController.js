const { WalletModel, FEE_RATE } = require('../models/walletModel');
const { getFirestore } = require('../config/firebase');

async function getAdminUid() {
  const db = getFirestore();
  const snap = await db.collection('users').where('role', '==', 'admin').limit(1).get();
  return snap.docs[0]?.id || null;
}

const WalletController = {
  async getWallet(req, res) {
    const { uid } = req.user;
    const [wallet, transactions] = await Promise.all([
      WalletModel.getOrCreate(uid),
      WalletModel.getTransactions(uid, 30),
    ]);
    res.json({ wallet, transactions, feeRate: FEE_RATE });
  },

  async withdraw(req, res) {
    const { uid } = req.user;
    const wallet = await WalletModel.getOrCreate(uid);
    if ((wallet.balance || 0) <= 0.01) {
      return res.status(400).json({ error: 'Saldo insuficiente para saque.' });
    }

    const adminUid = await getAdminUid();
    const result = await WalletModel.processWithdrawal(uid, adminUid);

    res.json({
      success: true,
      ...result,
      message: `Saque de R$ ${result.netAmount.toFixed(2)} solicitado com sucesso. Taxa (5%): R$ ${result.fee.toFixed(2)}. O administrador processará a transferência em breve.`,
    });
  },
};

module.exports = WalletController;
