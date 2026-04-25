const router = require('express').Router();
const ChatController = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');

router.get('/', authenticate, ChatController.listChats);
router.get('/:otherUserId', authenticate, ChatController.getOrCreateChat);
router.post('/upload-image', authenticate, uploadImage.single('image'), ChatController.uploadChatImage);

module.exports = router;
