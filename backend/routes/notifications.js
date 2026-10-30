const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  getNotifications,
  markAllRead,
  markRead,
  deleteNotification,
  subscribePush,
  registerFcmToken,
  unregisterFcmToken,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators/common');

const subscribeRules = [
  body('endpoint').isString().isURL({ protocols: ['https'], require_tld: false }).isLength({ max: 1000 }).withMessage('Invalid subscription endpoint'),
  body('keys.p256dh').isString().isLength({ min: 1, max: 200 }),
  body('keys.auth').isString().isLength({ min: 1, max: 100 }),
  body('installedApp').optional().isBoolean().toBoolean(),
];

const fcmRules = [
  body('token').isString().isLength({ min: 1, max: 4096 }).withMessage('FCM token is required'),
  v.text('device', { max: 100 }),
  v.text('platform', { max: 50 }),
  body('isNewLogin').optional().isBoolean(),
  body('installedApp').optional().isBoolean().toBoolean(),
];

router.use(protect);
router.get('/', getNotifications);
router.post('/subscribe', subscribeRules, validate, subscribePush);
router.post('/fcm-token', fcmRules, validate, registerFcmToken);
router.delete('/fcm-token', [body('token').isString().isLength({ min: 1, max: 4096 })], validate, unregisterFcmToken);
router.put('/read-all', markAllRead);
router.put('/:id/read', v.uuidParam(), validate, markRead);
router.delete('/:id', v.uuidParam(), validate, deleteNotification);

module.exports = router;
