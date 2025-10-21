const express = require("express");
const router = express.Router();
const otpController = require("../controller/otp");

router.post("/generate-otp", otpController.genOtp);
router.post("/verify-otp", otpController.verifyOtp);

module.exports = router;