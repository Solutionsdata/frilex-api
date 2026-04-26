const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const WalletController = require('../controllers/walletController');

router.get('/', authenticate, WalletController.getWallet);
router.post('/withdraw', authenticate, WalletController.withdraw);

module.exports = router;
