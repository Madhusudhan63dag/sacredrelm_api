require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const Razorpay = require("razorpay"); // Add Razorpay SDK
const crypto = require("crypto"); // For payment verification
const axios = require("axios"); // Import axios for Shiprocket API
const otpStore = {};
const OTP_EXPIRY_MS = 5 * 60 * 1000;


// Handle fetch import based on Node.js version
let fetch;
try {
  // For Node.js >= 18 (with built-in fetch)
  if (!globalThis.fetch) {
    fetch = require("node-fetch");
  } else {
    fetch = globalThis.fetch;
  }
} catch (error) {
  console.error("Error importing fetch:", error);
  // Fallback to node-fetch
  fetch = require("node-fetch");
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'https://sacredrelm.com',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Add credentials support for cookies/auth headers if needed
}));
app.use(bodyParser.json());

// Razorpay Configuration
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // use SSL
  connectionTimeout: 30000, // 30 seconds
  greetingTimeout: 30000, // 30 seconds
  socketTimeout: 60000, // 60 seconds
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false // Accept self-signed certificates
  },
});


// Email Sending Route
app.post("/send-email", async (req, res) => {
  const { to, subject, message } = req.body;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: "Email sent successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Email sending failed!", error });
  }
});

// // Abandoned Order Follow-up Email Route
// app.post("/send-order-confirmation", async (req, res) => {
//   const { customerEmail, orderDetails, customerDetails } = req.body;

//   if (!customerEmail) {
//     return res.status(400).json({ success: false, message: "Customer email is required" });
//   }

//   /* ---------- build HTML e-mail ---------- */
//   const hasMultiple = Array.isArray(orderDetails.products) && orderDetails.products.length > 0;

//   const htmlContent = `
//     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//       <h2>Order Confirmation</h2>
//       <p>Dear ${customerDetails.firstName} ${customerDetails.lastName},</p>
//       <p>Thank you for your order! We're pleased to confirm that your order has been successfully placed.</p>

//       <h3>Order Details:</h3>
//       <p><strong>Order Number:</strong> ${orderDetails.orderNumber}</p>

//       ${hasMultiple
//         ? `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
//              <tr style="background-color: #f2f2f2;">
//                <th style="text-align:left;padding:8px;border:1px solid #ddd;">Product Name</th>
//                <th style="text-align:center;padding:8px;border:1px solid #ddd;">Quantity</th>
//                <th style="text-align:right;padding:8px;border:1px solid #ddd;">Price</th>
//              </tr>
//              ${orderDetails.products
//                .map(
//                  p => `<tr>
//                          <td style="padding:8px;border:1px solid #ddd;">${p.name || ""}</td>
//                          <td style="text-align:center;padding:8px;border:1px solid #ddd;">${p.quantity || ""}</td>
//                          <td style="text-align:right;padding:8px;border:1px solid #ddd;">${orderDetails.currency || "₹"} ${p.price || ""}</td>
//                        </tr>`
//                )
//                .join("")}
//            </table>`
//         : `<p><strong>Product:</strong> ${orderDetails.productName || "N/A"}<br>
//              <strong>Quantity:</strong> ${orderDetails.quantity || "1"}</p>`}

//       <p><strong>Total Amount:</strong> ${orderDetails.currency || "₹"} ${orderDetails.totalAmount}<br>
//          <strong>Payment Method:</strong> ${orderDetails.paymentMethod}<br>
//          <strong>Payment ID:</strong> ${orderDetails.paymentId || "N/A"}</p>

//       <h3>Customer Details:</h3>
//       <p><strong>Name:</strong> ${customerDetails.firstName} ${customerDetails.lastName}<br>
//          <strong>Email:</strong> ${customerEmail}<br>
//          <strong>Phone:</strong> ${customerDetails.phone || "Not provided"}</p>

//       <h3>Shipping Address:</h3>
//       <p>${customerDetails.address || ""}<br>
//          ${customerDetails.apartment ? customerDetails.apartment + "<br>" : ""}
//          ${customerDetails.city || ""}${customerDetails.city && customerDetails.state ? ", " : ""}${customerDetails.state || ""}${(customerDetails.city || customerDetails.state) && customerDetails.zip ? " - " : ""}${customerDetails.zip || ""}<br>
//          ${customerDetails.country || ""}</p>

//       <p>We will process your order shortly. You will receive another email once your order ships.</p>
//       <p>If you have any questions, please contact our customer service.</p>
//       <p>Thank you for shopping with us!</p>
//     </div>
//   `;

//   const mailOptions = {
//     from: process.env.EMAIL_USER,
//     to: customerEmail,
//     cc: process.env.EMAIL_USER,
//     subject: `Order Confirmation #${orderDetails.orderNumber}`,
//     html: htmlContent
//   };

//   /* ---------- build WhatsApp payload ---------- */
//   const recipient = customerDetails.phone;              // must be +<country><number>[12]
//   const templateId = "1160163365950061";  // keep in .env

//   // convert array of products → "Product1×2, Product2×1"
//   const productsText = hasMultiple
//     ? orderDetails.products.map(p => `${p.name}×${p.quantity}`).join(", ")
//     : `${orderDetails.productName || "Item"}×${orderDetails.quantity || 1}`;

//   const bodyVars = [
//     customerDetails.firstName,
//     orderDetails.orderNumber,
//     productsText,
//     orderDetails.totalAmount
//   ];

//   const whatsappPayload = {
//     to: recipient,
//     type: "template",
//     callback_data: "order_confirmation_sent",
//     template: {
//       id: templateId,
//       header_media_url: "https://sacredrelm.com/static/media/logo.aade94b43e178c164667.png",
//       body_text_variables: bodyVars.join("|")
//     }
//   };


//   try {
//     await axios.post(
//       `https://api.whatstool.business/developers/v2/messages/${process.env.WHATSAPP_API_NO}`,
//       whatsappPayload,
//       {
//         headers: {
//           "x-api-key": process.env.CAMPH_API_KEY,
//           "Content-Type": "application/json"
//         }
//       }
//     );
//   } catch (waErr) {
//     console.error("WhatsApp send failed:", waErr.response?.data || waErr.message);
//   }

//   try {
//     await transporter.sendMail(mailOptions);
//     return res.status(200).json({ success: true, message: "Order confirmation e-mail sent" });
//   } catch (mailErr) {
//     console.error("E-mail send failed:", mailErr);
//     return res.status(500).json({ success: false, message: "Both WhatsApp and e-mail failed", error: mailErr.message });
//   }
// });
app.post("/send-order-confirmation", async (req, res) => {
  const { customerEmail, orderDetails, customerDetails } = req.body;

  if (!customerEmail) {
    return res.status(400).json({ success: false, message: "Customer email is required" });
  }

  /* ---------- build HTML e-mail (moved up to avoid blocking) ---------- */
  const hasMultiple = Array.isArray(orderDetails.products) && orderDetails.products.length > 0;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Order Confirmation</h2>
      <p>Dear ${customerDetails.firstName} ${customerDetails.lastName},</p>
      <p>Thank you for your order! We're pleased to confirm that your order has been successfully placed.</p>

      <h3>Order Details:</h3>
      <p><strong>Order Number:</strong> ${orderDetails.orderNumber}</p>

      ${hasMultiple
        ? `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
             <tr style="background-color: #f2f2f2;">
               <th style="text-align:left;padding:8px;border:1px solid #ddd;">Product Name</th>
               <th style="text-align:center;padding:8px;border:1px solid #ddd;">Quantity</th>
               <th style="text-align:right;padding:8px;border:1px solid #ddd;">Price</th>
             </tr>
             ${orderDetails.products
               .map(
                 p => `<tr>
                         <td style="padding:8px;border:1px solid #ddd;">${p.name || ""}</td>
                         <td style="text-align:center;padding:8px;border:1px solid #ddd;">${p.quantity || ""}</td>
                         <td style="text-align:right;padding:8px;border:1px solid #ddd;">${orderDetails.currency || "₹"} ${p.price || ""}</td>
                       </tr>`
               )
               .join("")}
           </table>`
        : `<p><strong>Product:</strong> ${orderDetails.productName || "N/A"}<br>
             <strong>Quantity:</strong> ${orderDetails.quantity || "1"}</p>`}

      <p><strong>Total Amount:</strong> ${orderDetails.currency || "₹"} ${orderDetails.totalAmount}<br>
         <strong>Payment Method:</strong> ${orderDetails.paymentMethod}<br>
         <strong>Payment ID:</strong> ${orderDetails.paymentId || "N/A"}</p>

      <h3>Customer Details:</h3>
      <p><strong>Name:</strong> ${customerDetails.firstName} ${customerDetails.lastName}<br>
         <strong>Email:</strong> ${customerEmail}<br>
         <strong>Phone:</strong> ${customerDetails.phone || "Not provided"}</p>

      <h3>Shipping Address:</h3>
      <p>${customerDetails.address || ""}<br>
         ${customerDetails.apartment ? customerDetails.apartment + "<br>" : ""}
         ${customerDetails.city || ""}${customerDetails.city && customerDetails.state ? ", " : ""}${customerDetails.state || ""}${(customerDetails.city || customerDetails.state) && customerDetails.zip ? " - " : ""}${customerDetails.zip || ""}<br>
         ${customerDetails.country || ""}</p>

      <p>We will process your order shortly. You will receive another email once your order ships.</p>
      <p>If you have any questions, please contact our customer service.</p>
      <p>Thank you for shopping with us!</p>
    </div>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    cc: process.env.EMAIL_USER,
    subject: `Order Confirmation #${orderDetails.orderNumber}`,
    html: htmlContent
  };

  /* ---------- build WhatsApp payload ---------- */
  const recipient = customerDetails.phone;
  const templateId = "1160163365950061";

  const productsText = hasMultiple
    ? orderDetails.products.map(p => `${p.name}×${p.quantity}`).join(", ")
    : `${orderDetails.productName || "Item"}×${orderDetails.quantity || 1}`;

  const bodyVars = [
    customerDetails.firstName,
    orderDetails.orderNumber,
    productsText,
    orderDetails.totalAmount
  ];

  const whatsappPayload = {
    to: recipient,
    type: "template",
    callback_data: "order_confirmation_sent",
    template: {
      id: templateId,
      header_media_url: "https://sacredrelm.com/static/media/logo.aade94b43e178c164667.png",
      body_text_variables: bodyVars.join("|")
    }
  };

  /* ---------- PARALLEL EXECUTION WITH TIMEOUT HANDLING ---------- */
  const TIMEOUT_MS = 8000; // 8 second timeout for each service

  // Create timeout wrapper function
  const withTimeout = (promise, timeoutMs, serviceName) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`${serviceName} timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  };

  // WhatsApp sending function with timeout
  const sendWhatsApp = () => {
    return withTimeout(
      axios.post(
        `https://api.whatstool.business/developers/v2/messages/${process.env.WHATSAPP_API_NO}`,
        whatsappPayload,
        {
          headers: {
            "x-api-key": process.env.CAMPH_API_KEY,
            "Content-Type": "application/json"
          },
          timeout: 6000 // Axios-level timeout
        }
      ),
      TIMEOUT_MS,
      'WhatsApp'
    );
  };

  // Email sending function with timeout
  const sendEmail = () => {
    return withTimeout(
      transporter.sendMail(mailOptions),
      TIMEOUT_MS,
      'Email'
    );
  };

  /* ---------- EXECUTE BOTH OPERATIONS IN PARALLEL ---------- */
  try {
    // Use Promise.allSettled to handle both success and failure cases
    const [whatsappResult, emailResult] = await Promise.allSettled([
      sendWhatsApp(),
      sendEmail()
    ]);

    // Analyze results
    const whatsappSuccess = whatsappResult.status === 'fulfilled';
    const emailSuccess = emailResult.status === 'fulfilled';

    // Log any failures for debugging
    if (!whatsappSuccess) {
      console.error("WhatsApp send failed:", whatsappResult.reason?.response?.data || whatsappResult.reason?.message || whatsappResult.reason);
    }
    if (!emailSuccess) {
      console.error("Email send failed:", emailResult.reason?.message || emailResult.reason);
    }

    // Response logic based on results
    if (emailSuccess && whatsappSuccess) {
      return res.status(200).json({ 
        success: true, 
        message: "Order confirmation sent via email and WhatsApp successfully" 
      });
    } else if (emailSuccess && !whatsappSuccess) {
      return res.status(200).json({ 
        success: true, 
        message: "Order confirmation sent via email successfully. WhatsApp delivery failed.",
        warnings: ["WhatsApp notification failed"]
      });
    } else if (!emailSuccess && whatsappSuccess) {
      return res.status(200).json({ 
        success: true, 
        message: "Order confirmation sent via WhatsApp successfully. Email delivery failed.",
        warnings: ["Email notification failed"] 
      });
    } else {
      // Both failed
      return res.status(500).json({ 
        success: false, 
        message: "Failed to send order confirmation via both email and WhatsApp",
        errors: {
          email: emailResult.reason?.message || "Email sending failed",
          whatsapp: whatsappResult.reason?.message || "WhatsApp sending failed"
        }
      });
    }

  } catch (error) {
    // This shouldn't happen with Promise.allSettled, but just in case
    console.error("Unexpected error in order confirmation:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Unexpected error occurred while sending order confirmation",
      error: error.message 
    });
  }
});




app.post("/send-abandoned-order-email", async (req, res) => {
  const { customerEmail, orderDetails, customerDetails } = req.body;
  
  console.log("Received abandoned order follow-up request:", { 
    customerEmail, 
    orderDetails: JSON.stringify(orderDetails),
    customerDetails: JSON.stringify(customerDetails) 
  });
  
  if (!customerEmail) {
    return res.status(400).json({
      success: false,
      message: "Customer email is required"
    });
  }
  
  // Format the email content
  const emailSubject = `We noticed you didn't complete your order #${orderDetails.orderNumber}`;
  
  // Check if orderDetails.products is an array for multiple products
  const hasMultipleProducts = Array.isArray(orderDetails.products) && orderDetails.products.length > 0;
  
  // Generate product table content
  let productsContent = '';
  
  if (hasMultipleProducts) {
    // Create a table for multiple products
    productsContent = `Products:
  +${'-'.repeat(40)}+${'-'.repeat(10)}+${'-'.repeat(15)}+
  | Product Name                            | Quantity | Price        |
  +${'-'.repeat(40)}+${'-'.repeat(10)}+${'-'.repeat(15)}+
  `;

    // Add each product as a row in the table
    orderDetails.products.forEach(product => {
      const name = (product.name || '').padEnd(40).substring(0, 40);
      const quantity = (product.quantity?.toString() || '').padEnd(10).substring(0, 10);
      const price = ((orderDetails.currency || '₹') + ' ' + (product.price || '')).padEnd(15).substring(0, 15);
      
      productsContent += `| ${name} | ${quantity} | ${price} |
  `;
    });
    
    productsContent += `+${'-'.repeat(40)}+${'-'.repeat(10)}+${'-'.repeat(15)}+`;
  } else {
    // Single product format
    productsContent = `Product: ${orderDetails.productName || 'N/A'}
  Quantity: ${orderDetails.quantity || '1'}`;
  }
  
  // Enhanced email template with better formatting for customer details
  const emailContent = `
    Dear ${customerDetails.firstName} ${customerDetails.lastName},
    
    We noticed that you recently started an order on our website but didn't complete the checkout process.
    
    Customer Details:
    - Name: ${customerDetails.firstName} ${customerDetails.lastName}
    - Email: ${customerDetails.email}
    - Phone: ${customerDetails.phone || 'Not provided'}
    
    Address Information:
    ${customerDetails.address || 'Address not provided'}
    ${customerDetails.apartment ? customerDetails.apartment + '\n' : ''}
    ${customerDetails.city || ''}${customerDetails.city && customerDetails.state ? ', ' : ''}${customerDetails.state || ''}${(customerDetails.city || customerDetails.state) && customerDetails.zip ? ' - ' : ''}${customerDetails.zip || ''}
    ${customerDetails.country || ''}
    
    Order Details:
    - Order ID: ${orderDetails.orderNumber}
    ${productsContent}
    - Total Amount: ${orderDetails.currency || '₹'} ${orderDetails.totalAmount}
    
    We'd love to know if you experienced any issues during checkout or if you have any questions about our product.
    You can simply reply to this email, and we'll be happy to assist you.
    
    If you'd like to complete your purchase, you can return to our website and try again.
    
    Thank you for considering our products!
    Best regards,
    
  `;
  
  // Add HTML version of the email
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Your Shopping Cart is Waiting</h2>
      <p>Dear ${customerDetails.firstName} ${customerDetails.lastName},</p>
      
      <p>We noticed that you recently started an order on our website but didn't complete the checkout process.</p>
      
      <h3>Order Details:</h3>
      <p><strong>Order Number:</strong> ${orderDetails.orderNumber}</p>
      
      ${hasMultipleProducts ? 
        `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background-color: #f2f2f2;">
            <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">Product Name</th>
            <th style="text-align: center; padding: 8px; border: 1px solid #ddd;">Quantity</th>
            <th style="text-align: right; padding: 8px; border: 1px solid #ddd;">Price</th>
          </tr>
          ${orderDetails.products.map(product => 
            `<tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${product.name || ''}</td>
              <td style="text-align: center; padding: 8px; border: 1px solid #ddd;">${product.quantity || ''}</td>
              <td style="text-align: right; padding: 8px; border: 1px solid #ddd;">${orderDetails.currency || '₹'} ${product.price || ''}</td>
            </tr>`
          ).join('')}
        </table>` 
        : 
        `<p><strong>Product:</strong> ${orderDetails.productName || 'N/A'}<br>
        <strong>Quantity:</strong> ${orderDetails.quantity || '1'}</p>`
      }
      
      <p><strong>Total Amount:</strong> ${orderDetails.currency || '₹'} ${orderDetails.totalAmount}</p>
      
      <h3>Customer Details:</h3>
      <p>
        <strong>Name:</strong> ${customerDetails.firstName} ${customerDetails.lastName}<br>
        <strong>Email:</strong> ${customerDetails.email}<br>
        <strong>Phone:</strong> ${customerDetails.phone || 'Not provided'}
      </p>
      
      <h3>Shipping Address:</h3>
      <p>
        ${customerDetails.address || ''}<br>
        ${customerDetails.apartment ? customerDetails.apartment + '<br>' : ''}
        ${customerDetails.city || ''}${customerDetails.city && customerDetails.state ? ', ' : ''}${customerDetails.state || ''}${(customerDetails.city || customerDetails.state) && customerDetails.zip ? ' - ' : ''}${customerDetails.zip || ''}<br>
        ${customerDetails.country || ''}
      </p>
      
      <p>We'd love to know if you experienced any issues during checkout or if you have any questions about our product.</p>
      <p>You can simply reply to this email, and we'll be happy to assist you.</p>
      
      <p>If you'd like to complete your purchase, you can return to our website and try again.</p>
      
      <p>Thank you for considering our products!</p>
      
      <p>Best regards,<br></p>
    </div>
  `;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    cc: process.env.EMAIL_USER, // CC to admin email
    subject: emailSubject,
    html: htmlContent // Add HTML version for better formatting
  };

  try {
    console.log("Attempting to send abandoned order follow-up email to:", customerEmail);
    const info = await transporter.sendMail(mailOptions);
    console.log("Abandoned order follow-up email sent successfully:", info.messageId);
    res.status(200).json({ success: true, message: "Abandoned order follow-up email sent successfully!" });
  } catch (error) {
    console.error("Error sending abandoned order follow-up email:", error);
    res.status(500).json({ success: false, message: "Failed to send abandoned order follow-up email", error: error.message });
  }
});

// Create Razorpay Order
app.post("/create-order", async (req, res) => {
  try {
    const { amount, currency, receipt, notes } = req.body;
    
    const options = {
      amount: amount * 100, // Convert to paise (Razorpay requires amount in smallest currency unit)
      currency: currency || "INR",
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes || {},
    };
    
    const order = await razorpay.orders.create(options);
    
    res.status(200).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID, // Send key_id to frontend for initialization
    });
  } catch (error) {
    console.error("Order creation failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: error.message,
    });
  }
});

// Verify Razorpay Payment
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // Verify signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");
      
    const isAuthentic = expectedSignature === razorpay_signature;
    
    if (isAuthentic) {
      // Payment verification successful
      res.status(200).json({ 
        success: true,
        message: "Payment verification successful",
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id
      });
    } else {
      // Payment verification failed
      res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during verification",
      error: error.message,
    });
  }
});


app.post("/send-advance-payment-confirmation", async (req, res) => {
  const { customerEmail, orderDetails, customerDetails, productName } = req.body;
  
  // Log the incoming request data
  console.log("Received advance payment confirmation request:", { 
    customerEmail, 
    orderDetails: JSON.stringify(orderDetails),
    customerDetails: JSON.stringify(customerDetails),
    productName
  });
  
  if (!customerEmail) {
    return res.status(400).json({
      success: false,
      message: "Customer email is required"
    });
  }
  
  // Format the email content
  const emailSubject = `Advance Payment Confirmed - Order #${orderDetails.orderNumber}`;
  
  // Check if orderDetails.products is an array for multiple products
  const hasMultipleProducts = Array.isArray(orderDetails.products) && orderDetails.products.length > 0;
  
  // Generate product table content
  let productsContent = '';
  
  if (hasMultipleProducts) {
    // Create a table for multiple products
    productsContent = `Products:
    +${'-'.repeat(40)}+${'-'.repeat(10)}+${'-'.repeat(15)}+
    | Product Name                            | Quantity | Price        |
    +${'-'.repeat(40)}+${'-'.repeat(10)}+${'-'.repeat(15)}+`;

    // Add each product as a row in the table
    orderDetails.products.forEach(product => {
      const name = (product.name || '').padEnd(40).substring(0, 40);
      const quantity = (product.quantity?.toString() || '').padEnd(10).substring(0, 10);
      const price = ((orderDetails.currency || '₹') + ' ' + (product.price || '')).padEnd(15).substring(0, 15);
      
      productsContent += `| ${name} | ${quantity} | ${price} |`;
    });
    
    productsContent += `+${'-'.repeat(40)}+${'-'.repeat(10)}+${'-'.repeat(15)}+`;
  } else {
    // Single product format
    productsContent = `Product: ${orderDetails.productName || 'N/A'}
    Quantity: ${orderDetails.quantity || '1'}`;
  }
  
  // Add HTML version of the email with advance payment focus
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Advance Payment Confirmed</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa;">
            <tr>
                <td align="center" style="padding: 20px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
                        
                        <!-- Header with Advance Payment Focus -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); padding: 40px 30px; text-align: center;">
                                <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
                                    <img src="https://cdn-icons-png.flaticon.com/512/3135/3135706.png" alt="Advance Payment" style="width: 50px; height: 50px;">
                                </div>
                                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">Advance Payment Received!</h1>
                                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">Your order is confirmed with partial payment</p>
                            </td>
                        </tr>
                        
                        <!-- Main Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                
                                <!-- Greeting -->
                                <div style="margin-bottom: 30px;">
                                    <h2 style="color: #2c3e50; margin: 0 0 15px; font-size: 24px; font-weight: 600;">Hello ${customerDetails.firstName}! 👋</h2>
                                    <p style="color: #5a6c7d; line-height: 1.6; margin: 0; font-size: 16px;">
                                        Great news! We've successfully received your advance payment and your order is now confirmed. Here are the complete details:
                                    </p>
                                </div>
                                
                                <!-- Payment Status Card -->
                                <div style="background: linear-gradient(145deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 12px; padding: 25px; margin-bottom: 30px; border: 2px solid #ff9800;">
                                    <div style="display: flex; align-items: center; margin-bottom: 20px;">
                                        <img src="https://cdn-icons-png.flaticon.com/512/3135/3135706.png" alt="Payment" style="width: 24px; height: 24px; margin-right: 10px;">
                                        <h3 style="color: #e65100; margin: 0; font-size: 20px; font-weight: 600;">💰 Payment Summary</h3>
                                    </div>
                                    
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 8px 0; color: #5a6c7d; font-weight: 500;">Order Total:</td>
                                            <td style="padding: 8px 0; color: #2c3e50; font-weight: 700, text-align: right; font-size: 18px;">${orderDetails.currency || '₹'} ${orderDetails.totalAmount}</td>
                                        </tr>
                                        <tr style="background-color: rgba(76, 175, 80, 0.1);">
                                            <td style="padding: 12px 8px; color: #2e7d32; font-weight: 600; border-radius: 8px;">✅ Advance Paid:</td>
                                            <td style="padding: 12px 8px; color: #2e7d32; font-weight: 800; text-align: right; font-size: 20px; border-radius: 8px;">${orderDetails.currency || '₹'} ${orderDetails.advanceAmount || orderDetails.paidAmount}</td>
                                        </tr>
                                        <tr style="background-color: rgba(255, 152, 0, 0.1);">
                                            <td style="padding: 12px 8px; color: #f57c00; font-weight: 600; border-radius: 8px;">⏳ Balance Due on Delivery:</td>
                                            <td style="padding: 12px 8px; color: #f57c00; font-weight: 800; text-align: right; font-size: 20px; border-radius: 8px;">${orderDetails.currency || '₹'} ${orderDetails.balanceAmount || (orderDetails.totalAmount - (orderDetails.advanceAmount || orderDetails.paidAmount))}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #5a6c7d; font-weight: 500;">Payment Method:</td>
                                            <td style="padding: 8px 0; color: #2c3e50; font-weight: 600; text-align: right;">${orderDetails.paymentMethod} (Advance)</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #5a6c7d; font-weight: 500;">Payment ID:</td>
                                            <td style="padding: 8px 0; color: #2c3e50; font-weight: 600; text-align: right; font-size: 12px;">${orderDetails.paymentId || 'N/A'}</td>
                                        </tr>
                                    </table>
                                </div>
                                
                                <!-- Order Summary Card -->
                                <div style="background: linear-gradient(145deg, #f8f9ff 0%, #e8f2ff 100%); border-radius: 12px; padding: 25px; margin-bottom: 30px; border: 1px solid #e3f2fd;">
                                    <div style="display: flex; align-items: center; margin-bottom: 20px;">
                                        <img src="https://cdn-icons-png.flaticon.com/512/3081/3081559.png" alt="Order" style="width: 24px; height: 24px; margin-right: 10px;">
                                        <h3 style="color: #2c3e50; margin: 0; font-size: 20px; font-weight: 600;">📦 Order Details</h3>
                                    </div>
                                    
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 8px 0; color: #5a6c7d; font-weight: 500;">Order Number:</td>
                                            <td style="padding: 8px 0; color: #2c3e50; font-weight: 700; text-align: right;">#${orderDetails.orderNumber}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #5a6c7d; font-weight: 500;">Product:</td>
                                            <td style="padding: 8px 0; color: #2c3e50; font-weight: 600; text-align: right;">${orderDetails.productName || productName || 'N/A'}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #5a6c7d; font-weight: 500;">Quantity:</td>
                                            <td style="padding: 8px 0; color: #2c3e50; font-weight: 600; text-align: right;">${orderDetails.quantity || '1'}</td>
                                        </tr>
                                    </table>
                                </div>
                                
                                <!-- Important Notice for COD Balance -->
                                <div style="background: linear-gradient(145deg, #fff8e1 0%, #ffecb3 100%); border: 2px solid #ffc107; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
                                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                                        <img src="https://cdn-icons-png.flaticon.com/512/1828/1828843.png" alt="Important" style="width: 24px; height: 24px; margin-right: 10px;">
                                        <h3 style="color: #f57c00; margin: 0; font-size: 18px; font-weight: 600;">🚨 Important: Balance Payment on Delivery</h3>
                                    </div>
                                    <div style="color: #ef6c00; font-size: 16px; line-height: 1.6;">
                                        <p style="margin: 0 0 10px;"><strong>Please keep ready:</strong> ${orderDetails.currency || '₹'} ${orderDetails.balanceAmount || (orderDetails.totalAmount - (orderDetails.advanceAmount || orderDetails.paidAmount))} for cash payment when your order arrives.</p>
                                        <p style="margin: 0; font-size: 14px; color: #8d4e00;">Our delivery partner will collect the remaining balance amount in cash upon delivery. Please ensure you have the exact amount ready.</p>
                                    </div>
                                </div>
                                
                                <!-- Customer & Shipping Info -->
                                <div style="display: flex; gap: 20px; margin-bottom: 30px;">
                                    <!-- Customer Details -->
                                    <div style="flex: 1; background-color: #f8f9ff; border: 1px solid #e3f2fd; border-radius: 8px; padding: 20px;">
                                        <div style="display: flex; align-items: center; margin-bottom: 15px;">
                                            <img src="https://cdn-icons-png.flaticon.com/512/3135/3135715.png" alt="Customer" style="width: 20px; height: 20px; margin-right: 8px;">
                                            <h4 style="color: #2c3e50; margin: 0; font-size: 16px; font-weight: 600;">Customer Details</h4>
                                        </div>
                                        <p style="color: #2c3e50; margin: 0 0 8px; font-weight: 600;">${customerDetails.firstName} ${customerDetails.lastName}</p>
                                        <p style="color: #5a6c7d; margin: 0 0 5px; font-size: 14px;">${customerEmail}</p>
                                        <p style="color: #5a6c7d; margin: 0; font-size: 14px;">${customerDetails.phone || 'Phone not provided'}</p>
                                    </div>
                                    
                                    <!-- Shipping Address -->
                                    <div style="flex: 1; background-color: #f8f9ff; border: 1px solid #e3f2fd; border-radius: 8px; padding: 20px;">
                                        <div style="display: flex; align-items: center; margin-bottom: 15px;">
                                            <img src="https://cdn-icons-png.flaticon.com/512/854/854929.png" alt="Shipping" style="width: 20px; height: 20px; margin-right: 8px;">
                                            <h4 style="color: #2c3e50; margin: 0; font-size: 16px; font-weight: 600;">Delivery Address</h4>
                                        </div>
                                        <div style="color: #5a6c7d; font-size: 14px; line-height: 1.5;">
                                            ${customerDetails.address || ''}<br>
                                            ${customerDetails.apartment ? customerDetails.apartment + '<br>' : ''}
                                            ${customerDetails.city || ''}${customerDetails.city && customerDetails.state ? ', ' : ''}${customerDetails.state || ''}${(customerDetails.city || customerDetails.state) && customerDetails.zip ? ' - ' : ''}${customerDetails.zip || ''}<br>
                                            ${customerDetails.country || ''}
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Status Timeline for Advance Payment -->
                                <div style="background: linear-gradient(145deg, #e8f5e8 0%, #f0f8f0 100%); border: 1px solid #c8e6c9; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
                                    <div style="display: flex; align-items: center; margin-bottom: 20px;">
                                        <img src="https://cdn-icons-png.flaticon.com/512/2143/2143150.png" alt="Timeline" style="width: 24px; height: 24px; margin-right: 10px;">
                                        <h3 style="color: #2c3e50; margin: 0; font-size: 20px; font-weight: 600;">📋 Order Progress</h3>
                                    </div>
                                    
                                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                                        <div style="width: 12px; height: 12px; background-color: #27ae60; border-radius: 50%; margin-right: 15px;"></div>
                                        <div>
                                            <p style="color: #27ae60; margin: 0; font-weight: 600; font-size: 14px;">✓ Advance Payment Received</p>
                                            <p style="color: #5a6c7d; margin: 0; font-size: 12px;">${orderDetails.currency || '₹'} ${orderDetails.advanceAmount || orderDetails.paidAmount} paid successfully</p>
                                        </div>
                                    </div>
                                    
                                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                                        <div style="width: 12px; height: 12px; background-color: #f39c12; border-radius: 50%; margin-right: 15px;"></div>
                                        <div>
                                            <p style="color: #f39c12; margin: 0; font-weight: 600; font-size: 14px;">⏳ Processing Your Order</p>
                                            <p style="color: #5a6c7d; margin: 0; font-size: 12px;">We're preparing your order for shipment</p>
                                        </div>
                                    </div>
                                    
                                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                                        <div style="width: 12px; height: 12px; background-color: #bdc3c7; border-radius: 50%; margin-right: 15px;"></div>
                                        <div>
                                            <p style="color: #5a6c7d; margin: 0; font-weight: 600; font-size: 14px;">📦 Out for Delivery</p>
                                            <p style="color: #5a6c7d; margin: 0; font-size: 12px;">You'll receive tracking details once shipped</p>
                                        </div>
                                    </div>
                                    
                                    <div style="display: flex; align-items: center;">
                                        <div style="width: 12px; height: 12px; background-color: #bdc3c7; border-radius: 50%; margin-right: 15px;"></div>
                                        <div>
                                            <p style="color: #5a6c7d; margin: 0; font-weight: 600; font-size: 14px;">💰 Balance Payment & Delivery</p>
                                            <p style="color: #5a6c7d; margin: 0; font-size: 12px;">Pay ${orderDetails.currency || '₹'} ${orderDetails.balanceAmount || (orderDetails.totalAmount - (orderDetails.advanceAmount || orderDetails.paidAmount))} in cash upon delivery</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Call to Action -->
                                <div style="text-align: center; margin-bottom: 30px;">
                                    <p style="color: #5a6c7d; margin: 0 0 20px; font-size: 16px;">Questions about your advance payment order?</p>
                                    <a href="mailto:israelitesshopping171@gmail.com" style="display: inline-block; background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 25px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(255, 152, 0, 0.4);">Contact Support</a>
                                </div>
                                
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #2c3e50; padding: 30px; text-align: center;">
                                <div style="margin-bottom: 20px;">
                                    <img src="https://cdn-icons-png.flaticon.com/512/3176/3176363.png" alt="Store Logo" style="width: 60px; height: 60px; opacity: 0.8;">
                                </div>
                                <p style="color: white; margin: 0 0 10px; font-size: 18px; font-weight: 600;">Thank you for your advance payment!</p>
                                <p style="color: rgba(255,255,255,0.8); margin: 0 0 20px; font-size: 14px;">Your order is confirmed and will be delivered soon. Don't forget the balance payment!</p>
                                
                                <p style="color: rgba(255,255,255,0.6); margin: 0; font-size: 12px;">
                                    © 2025 ${orderDetails.productName || productName || 'Our Store'}. All rights reserved.<br>
                                    This email was sent to ${customerEmail}
                                </p>
                            </td>
                        </tr>
                        
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
  `;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    cc: process.env.EMAIL_USER, // CC to admin email
    subject: emailSubject,
    html: htmlContent // Add HTML version for better formatting
  };

  try {
    console.log("Attempting to send advance payment confirmation email to:", customerEmail);
    const info = await transporter.sendMail(mailOptions);
    console.log("Advance payment confirmation email sent successfully:", info.messageId);
    res.status(200).json({ success: true, message: "Advance payment confirmation email sent successfully!" });
  } catch (error) {
    console.error("Error sending advance payment confirmation email:", error);
    res.status(500).json({ success: false, message: "Failed to send advance payment confirmation email", error: error.message });
  }
});





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
app.post("/generate-otp", async (req, res) => {
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
});

// API to verify OTP
app.post("/verify-otp", (req, res) => {
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
});




// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});