const router = require('express').Router();
const AuthController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

router.post('/register', validate(schemas.register), AuthController.register);
router.post('/login', validate(schemas.login), AuthController.login);
router.post('/google', AuthController.loginWithGoogle);
router.post('/refresh', AuthController.refresh);
router.get('/me', authenticate, AuthController.me);

module.exports = router;
