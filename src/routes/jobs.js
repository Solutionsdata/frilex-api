const router = require('express').Router();
const { authenticate, requireClient, requireProfessional } = require('../middleware/auth');
const JobController = require('../controllers/jobController');

router.get('/', authenticate, JobController.list);
router.post('/', authenticate, requireClient, JobController.create);
router.get('/:id', authenticate, JobController.getById);
router.post('/:id/accept', authenticate, requireProfessional, JobController.accept);
router.delete('/:id', authenticate, requireClient, JobController.cancel);

module.exports = router;
