const router = require('express').Router();
const ServiceController = require('../controllers/serviceController');
const { authenticate, requireProfessional } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

router.get('/', authenticate, ServiceController.listCategories);
router.get('/:id', authenticate, ServiceController.getCategory);
router.post('/suggest', authenticate, requireProfessional, validate(schemas.serviceCategory), ServiceController.suggestCategory);

module.exports = router;
