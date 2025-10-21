const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createorder = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const currency = (req.body.currency || "INR").trim();
    const receipt = (req.body.receipt || `receipt_${Date.now()}`).toString();
    const notesInput = req.body.notes;

    // Validate required params
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    // Razorpay expects amount in the smallest unit and notes as an object
    const options = {
      amount: Math.round(amount * 100),
      currency,
      receipt,
      notes: typeof notesInput === "object" && notesInput !== null ? notesInput : { note: String(notesInput || "") },
    };

    const order = await razorpay.orders.create(options);

    return res.status(200).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    // Robust logging to surface Razorpay’s message when present
    const payload = error?.response?.data || { message: error?.message || "Unknown error" };
    console.error("Order creation failed:", payload);
    return res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: payload,
    });
  }
};

const verifypayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      return res.status(200).json({
        success: true,
        message: "Payment verification successful",
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      });
    }

    return res.status(400).json({ success: false, message: "Payment verification failed" });
  } catch (error) {
    const payload = error?.response?.data || { message: error?.message || "Unknown error" };
    console.error("Payment verification error:", payload);
    return res.status(500).json({
      success: false,
      message: "Internal server error during verification",
      error: payload,
    });
  }
};

const payment = {
    createorder,
    verifypayment
}

module.exports = payment;