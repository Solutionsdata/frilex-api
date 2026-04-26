const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const NotificationController = require('../controllers/notificationController');

router.get('/', authenticate, NotificationController.getAll);
router.get('/unread-count', authenticate, NotificationController.getUnreadCount);
router.patch('/read-all', authenticate, NotificationController.markAllRead);
router.patch('/:id/read', authenticate, NotificationController.markRead);

module.exports = router;
