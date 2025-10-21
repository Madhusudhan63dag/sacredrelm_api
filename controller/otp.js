const axios = require("axios"); // Import axios for Shiprocket API
const otpStore = {};
const OTP_EXPIRY_MS = 5 * 60 * 1000;

// Generate random OTP of 4 digits
function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Send OTP via Fast2SMS API
async function sendOtpSms(phoneNumber, otp) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) throw new Error("FAST2SMS_API_KEY not configured");

  const data = {
    route: "otp",
    variables_values: otp,
    numbers: phoneNumber,
    flash: 0,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: apiKey,
  };

  const response = await axios.post("https://www.fast2sms.com/dev/bulkV2", data, { headers });
  return response.data;
}

// API to generate and send OTP
const genOtp = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone number is required" });

    const otp = generateOtp();
    const expiresAt = Date.now() + OTP_EXPIRY_MS;

    // Save OTP and expiry in memory
    otpStore[phoneNumber] = { otp, expiresAt };

    // Send OTP SMS
    const smsResponse = await sendOtpSms(phoneNumber, otp);

    if (smsResponse.return === true || smsResponse.type === "success") {
      res.status(200).json({ success: true, message: "OTP sent successfully" });
    } else {
      res.status(500).json({ success: false, message: "Failed to send OTP", details: smsResponse });
    }
  } catch (error) {
    console.error("Error generating/sending OTP:", error);
    res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};

// API to verify OTP
const verifyOtp = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    if (!phoneNumber || !otp) return res.status(400).json({ success: false, message: "Phone number and OTP are required" });

    const record = otpStore[phoneNumber];

    if (!record) {
      return res.status(400).json({ success: false, message: "No OTP requested for this number" });
    }

    if (Date.now() > record.expiresAt) {
      delete otpStore[phoneNumber];
      return res.status(400).json({ success: false, message: "OTP has expired" });
    }

    if (otp === record.otp) {
      // On success, remove OTP record to prevent reuse
      delete otpStore[phoneNumber];
      return res.status(200).json({ success: true, message: "OTP verified successfully" });
    } else {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
};


const otp = {
  genOtp,
  verifyOtp
};

module.exports = otp;