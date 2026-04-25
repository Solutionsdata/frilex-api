const router = require('express').Router();
const ReviewController = require('../controllers/reviewController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

router.post('/', authenticate, validate(schemas.review), ReviewController.create);
router.get('/professional/:professionalId', authenticate, ReviewController.getProfessionalReviews);

module.exports = router;
