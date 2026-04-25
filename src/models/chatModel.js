const { getFirestore, getDatabase } = require('../config/firebase');

const ChatModel = {
  getChatId(uid1, uid2) {
    return [uid1, uid2].sort().join('_');
  },

  async createOrGetChat(uid1, uid2) {
    const db = getFirestore();
    const chatId = this.getChatId(uid1, uid2);
    const ref = db.collection('chats').doc(chatId);
    const doc = await ref.get();

    if (!doc.exists) {
      const chat = {
        id: chatId,
        participants: [uid1, uid2],
        lastMessage: null,
        lastMessageAt: null,
        createdAt: new Date().toISOString(),
        unreadCount: { [uid1]: 0, [uid2]: 0 },
      };
      await ref.set(chat);
      return chat;
    }
    return { id: doc.id, ...doc.data() };
  },

  async sendMessage(chatId, data) {
    const rtdb = getDatabase();
    const db = getFirestore();

    const message = {
      id: Date.now().toString(),
      senderId: data.senderId,
      text: data.text || null,
      imageUrl: data.imageUrl || null,
      type: data.type || 'text', // 'text' | 'image' | 'file'
      createdAt: new Date().toISOString(),
      read: false,
    };

    await rtdb.ref(`messages/${chatId}`).push(message);

    await db.collection('chats').doc(chatId).update({
      lastMessage: message.text || '[imagem]',
      lastMessageAt: message.createdAt,
      [`unreadCount.${data.receiverId}`]: require('firebase-admin').firestore.FieldValue.increment(1),
    });

    return message;
  },

  async markAsRead(chatId, userId) {
    const db = getFirestore();
    await db.collection('chats').doc(chatId).update({
      [`unreadCount.${userId}`]: 0,
    });
  },

  async getUserChats(userId) {
    const db = getFirestore();
    const snap = await db.collection('chats')
      .where('participants', 'array-contains', userId)
      .orderBy('lastMessageAt', 'desc')
      .limit(50)
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },
};

module.exports = ChatModel;
