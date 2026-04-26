const { getFirestore } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');

const COLLECTION = 'wallets';
const FEE_RATE = 0.05;

const WalletModel = {
  async getOrCreate(uid) {
    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(uid).get();
    if (doc.exists) return doc.data();
    const wallet = {
      uid,
      balance: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      totalFees: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.collection(COLLECTION).doc(uid).set(wallet);
    return wallet;
  },

  async getTransactions(uid, limit = 30) {
    const db = getFirestore();
    try {
      const snap = await db.collection(COLLECTION).doc(uid).collection('transactions')
        .orderBy('createdAt', 'desc').limit(limit).get();
      return snap.docs.map((d) => d.data());
    } catch {
      return [];
    }
  },

  // Credit amount to user's wallet balance
  async credit(uid, amount, description, jobId = null) {
    const db = getFirestore();
    const id = uuidv4();
    const now = new Date().toISOString();
    const tx = {
      id, type: 'credit', amount,
      description, jobId, createdAt: now,
    };
    await db.collection(COLLECTION).doc(uid).collection('transactions').doc(id).set(tx);
    await db.collection(COLLECTION).doc(uid).set({
      uid,
      balance: admin.firestore.FieldValue.increment(amount),
      totalEarned: admin.firestore.FieldValue.increment(amount),
      updatedAt: now,
    }, { merge: true });
    return tx;
  },

  // Process withdrawal with 5% fee — atomic via Firestore transaction
  async processWithdrawal(uid, adminUid) {
    const db = getFirestore();
    const walletRef = db.collection(COLLECTION).doc(uid);

    const { balance, fee, netAmount } = await db.runTransaction(async (txn) => {
      const doc = await txn.get(walletRef);
      const data = doc.data() || {};
      const balance = data.balance || 0;

      if (balance <= 0.01) throw Object.assign(new Error('Saldo insuficiente para saque.'), { status: 400 });

      const fee = Math.round(balance * FEE_RATE * 100) / 100;
      const netAmount = Math.round((balance - fee) * 100) / 100;
      const now = new Date().toISOString();
      const id = uuidv4();

      txn.set(walletRef.collection('transactions').doc(id), {
        id, type: 'withdrawal', amount: balance, fee, netAmount,
        description: `Saque de R$ ${netAmount.toFixed(2)} — taxa (5%): R$ ${fee.toFixed(2)}`,
        createdAt: now,
      });
      txn.set(walletRef, {
        uid, balance: 0,
        totalWithdrawn: admin.firestore.FieldValue.increment(netAmount),
        totalFees: admin.firestore.FieldValue.increment(fee),
        updatedAt: now,
      }, { merge: true });

      return { balance, fee, netAmount };
    });

    // Credit fee to admin wallet
    if (fee > 0 && adminUid) {
      await this.credit(adminUid, fee, `Taxa de saque — usuário: ${uid}`, null);
    }

    return { totalAmount: balance, fee, netAmount };
  },

  // Process refund (on poster cancellation after PIX confirmed) — 5% fee
  async processRefund(posterUid, adminUid, amount, jobTitle) {
    const fee = Math.round(amount * FEE_RATE * 100) / 100;
    const net = Math.round((amount - fee) * 100) / 100;
    const now = new Date().toISOString();
    const id = uuidv4();
    const db = getFirestore();

    const tx = {
      id, type: 'refund', amount: net, fee,
      description: `Reembolso de cancelamento: "${jobTitle}" — taxa (5%): R$ ${fee.toFixed(2)}`,
      createdAt: now,
    };
    await db.collection(COLLECTION).doc(posterUid).collection('transactions').doc(id).set(tx);
    await db.collection(COLLECTION).doc(posterUid).set({
      uid: posterUid,
      balance: admin.firestore.FieldValue.increment(net),
      updatedAt: now,
    }, { merge: true });

    if (fee > 0 && adminUid) {
      await this.credit(adminUid, fee, `Taxa de cancelamento: "${jobTitle}"`, null);
    }

    return { refundAmount: net, fee };
  },
};

module.exports = { WalletModel, FEE_RATE };
