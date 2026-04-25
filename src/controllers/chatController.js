const ChatModel = require('../models/chatModel');
const { uploadToFirebase } = require('../middleware/upload');

const ChatController = {
  async getOrCreateChat(req, res) {
    const { otherUserId } = req.params;
    const chat = await ChatModel.createOrGetChat(req.user.uid, otherUserId);
    res.json({ chat });
  },

  async listChats(req, res) {
    const chats = await ChatModel.getUserChats(req.user.uid);
    res.json({ chats });
  },

  async uploadChatImage(req, res) {
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    const url = await uploadToFirebase(req.file, `chat-images/${req.user.uid}`);
    res.json({ imageUrl: url });
  },
};

module.exports = ChatController;
