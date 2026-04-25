const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const ChatModel = require('../models/chatModel');
const NotificationService = require('./notificationService');
const UserModel = require('../models/userModel');

let io;

const initSocketIO = (server) => {
  io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || '*' },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Autenticação necessária.'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.uid;
      next();
    } catch {
      next(new Error('Token inválido.'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.userId}`);
    socket.join(socket.userId);

    socket.on('join_chat', ({ chatId }) => {
      socket.join(`chat_${chatId}`);
    });

    socket.on('send_message', async ({ receiverId, text, imageUrl, type }) => {
      try {
        const chatId = ChatModel.getChatId(socket.userId, receiverId);
        await ChatModel.createOrGetChat(socket.userId, receiverId);

        const message = await ChatModel.sendMessage(chatId, {
          senderId: socket.userId,
          receiverId,
          text,
          imageUrl,
          type,
        });

        io.to(`chat_${chatId}`).emit('new_message', { chatId, message });

        const receiver = await UserModel.findById(receiverId);
        if (receiver?.fcmToken) {
          const sender = await UserModel.findById(socket.userId);
          await NotificationService.send(receiver.fcmToken, {
            title: sender.name,
            body: text || '📷 Imagem',
            data: { type: 'chat', chatId, senderId: socket.userId },
          });
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('mark_read', async ({ chatId }) => {
      await ChatModel.markAsRead(chatId, socket.userId);
    });

    socket.on('typing', ({ chatId, receiverId }) => {
      io.to(receiverId).emit('user_typing', { chatId, userId: socket.userId });
    });

    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.userId}`);
    });
  });

  return io;
};

const getIO = () => io;

module.exports = { initSocketIO, getIO };
