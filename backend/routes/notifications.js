const express = require('express');
const router = express.Router();
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

router.use(protect);
router.get('/', getNotifications);
router.post('/subscribe', subscribePush);
router.post('/fcm-token', registerFcmToken);
router.delete('/fcm-token', unregisterFcmToken);
router.put('/read-all', markAllRead);
router.put('/:id/read', markRead);
router.delete('/:id', deleteNotification);

module.exports = router;
