const nodemailer = require("nodemailer");
const axios = require("axios"); // Import axios for Shiprocket API



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

const sendEmail = async (req, res) => {
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
};

const sendOrderConfirmation = async (req, res) => {
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
};

const sendAbandonedOrderEmail = async (req, res) => {
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
};


const notificationController = {
  sendEmail,
  sendOrderConfirmation,
  sendAbandonedOrderEmail
};
module.exports = notificationController;