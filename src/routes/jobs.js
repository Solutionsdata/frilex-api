const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const JobController = require('../controllers/jobController');

router.get('/', authenticate, JobController.list);
router.post('/', authenticate, JobController.create);
router.get('/:id', authenticate, JobController.getById);

// Any authenticated user can accept a job or send a proposal
router.post('/:id/accept', authenticate, JobController.accept);
router.post('/:id/propose', authenticate, JobController.propose);

// Proposal negotiation — both poster and applicant can counter or accept
router.post('/:jobId/proposals/:proposalId/counter', authenticate, JobController.counterProposal);
router.post('/:jobId/proposals/:proposalId/accept', authenticate, JobController.acceptProposal);

// Job lifecycle — poster confirms PIX payment
router.post('/:id/confirm-payment', authenticate, JobController.confirmPayment);

// Applicant lifecycle
router.post('/:id/start', authenticate, JobController.startJob);
router.post('/:id/complete', authenticate, JobController.completeByProfessional);

// Poster confirms service completion
router.post('/:id/confirm', authenticate, JobController.confirmCompletion);
router.delete('/:id', authenticate, JobController.cancel);

module.exports = router;
