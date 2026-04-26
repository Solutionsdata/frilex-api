const { getFirestore } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const NotificationModel = {
  async create(uid, { type, title, body, data = {} }) {
    const db = getFirestore();
    const id = uuidv4();
    const notification = {
      id, uid, type, title, body, data,
      read: false,
      createdAt: new Date().toISOString(),
    };
    await db.collection('notifications').doc(uid).collection('items').doc(id).set(notification);
    return notification;
  },

  async getAll(uid, limit = 40) {
    const db = getFirestore();
    try {
      const snap = await db.collection('notifications').doc(uid).collection('items')
        .orderBy('createdAt', 'desc').limit(limit).get();
      return snap.docs.map((d) => d.data());
    } catch {
      return [];
    }
  },

  async getUnreadCount(uid) {
    const db = getFirestore();
    try {
      const snap = await db.collection('notifications').doc(uid).collection('items')
        .where('read', '==', false).get();
      return snap.size;
    } catch {
      return 0;
    }
  },

  async markRead(uid, notificationId) {
    const db = getFirestore();
    await db.collection('notifications').doc(uid).collection('items').doc(notificationId)
      .update({ read: true });
  },

  async markAllRead(uid) {
    const db = getFirestore();
    const snap = await db.collection('notifications').doc(uid).collection('items')
      .where('read', '==', false).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    if (snap.size > 0) await batch.commit();
  },
};

module.exports = NotificationModel;
