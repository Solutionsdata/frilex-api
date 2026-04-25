const router = require('express').Router();
const UserController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { uploadDocument, uploadImage } = require('../middleware/upload');

router.get('/search', authenticate, UserController.searchProfessionals);
router.get('/:uid', authenticate, UserController.getProfile);
router.put('/me', authenticate, UserController.updateProfile);
router.post('/me/avatar', authenticate, uploadImage.single('avatar'), UserController.uploadAvatar);
router.post('/me/documents/:type', authenticate, uploadDocument.single('document'), UserController.uploadDocument);
router.post('/me/fcm-token', authenticate, UserController.updateFCMToken);

module.exports = router;
