const express = require("express");
const router = express.Router();
const payment = require("../controller/payment");

router.post("/create-order", payment.createorder);
router.post("/verify-payment", payment.verifypayment);


module.exports = router;