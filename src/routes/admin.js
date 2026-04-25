const router = require('express').Router();
const AdminController = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

router.get('/stats', AdminController.getDashboardStats);
router.get('/services/pending', AdminController.getPendingServices);
router.patch('/services/:id/review', AdminController.reviewService);
router.get('/documents/pending', AdminController.getPendingDocuments);
router.patch('/users/:uid/documents', AdminController.reviewDocuments);
router.patch('/users/:uid/disable', AdminController.disableUser);

module.exports = router;
