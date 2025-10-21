const express = require("express");
const router = express.Router();
const notificationController = require("../controller/notification");

router.post("/send-email", notificationController.sendEmail);
router.post("/send-order-confirmation", notificationController.sendOrderConfirmation);
router.post("/send-abandoned-order-email", notificationController.sendAbandonedOrderEmail);

module.exports = router;