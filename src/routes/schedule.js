const router = require('express').Router();
const ScheduleController = require('../controllers/scheduleController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

router.get('/', authenticate, ScheduleController.listMySchedules);
router.post('/', authenticate, validate(schemas.schedule), ScheduleController.create);
router.get('/:id', authenticate, ScheduleController.getSchedule);
router.patch('/:id/status', authenticate, ScheduleController.updateStatus);

module.exports = router;
