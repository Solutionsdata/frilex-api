const router = require('express').Router();
const AdminController = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

router.get('/stats', AdminController.getDashboardStats);
router.get('/users', AdminController.listUsers);
router.get('/jobs', AdminController.listAllJobs);
router.post('/users/reset-all-passwords', AdminController.resetAllPasswords);
router.delete('/users/:uid', AdminController.deleteUser);
router.patch('/users/:uid/role', AdminController.setRole);
router.patch('/users/:uid/password', AdminController.setUserPassword);
router.patch('/users/:uid/disable', AdminController.disableUser);
router.get('/services/pending', AdminController.getPendingServices);
router.patch('/services/:id/review', AdminController.reviewService);
router.get('/documents/pending', AdminController.getPendingDocuments);
router.patch('/users/:uid/documents', AdminController.reviewDocuments);

module.exports = router;
