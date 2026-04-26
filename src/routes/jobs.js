const router = require('express').Router();
const { authenticate, requireClient, requireProfessional } = require('../middleware/auth');
const JobController = require('../controllers/jobController');

router.get('/', authenticate, JobController.list);
router.post('/', authenticate, requireClient, JobController.create);
router.get('/:id', authenticate, JobController.getById);

// Professional actions
router.post('/:id/accept', authenticate, requireProfessional, JobController.accept);
router.post('/:id/propose', authenticate, requireProfessional, JobController.propose);
router.post('/:id/start', authenticate, requireProfessional, JobController.startJob);
router.post('/:id/complete', authenticate, requireProfessional, JobController.completeByProfessional);

// Client actions
router.post('/:jobId/proposals/:proposalId/accept', authenticate, requireClient, JobController.acceptProposal);
router.post('/:id/confirm', authenticate, requireClient, JobController.confirmCompletion);
router.delete('/:id', authenticate, requireClient, JobController.cancel);

module.exports = router;
