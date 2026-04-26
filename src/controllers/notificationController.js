const NotificationModel = require('../models/notificationModel');

const NotificationController = {
  async getAll(req, res) {
    const notifications = await NotificationModel.getAll(req.user.uid);
    res.json({ notifications });
  },

  async getUnreadCount(req, res) {
    const count = await NotificationModel.getUnreadCount(req.user.uid);
    res.json({ count });
  },

  async markRead(req, res) {
    await NotificationModel.markRead(req.user.uid, req.params.id);
    res.json({ success: true });
  },

  async markAllRead(req, res) {
    await NotificationModel.markAllRead(req.user.uid);
    res.json({ success: true });
  },
};

module.exports = NotificationController;
