/**
 * T&L Market — Order Backend
 * ─────────────────────────────────────────────
 * Backend API:
 *
 * GET  /
 *      Health check
 *
 * POST /create-payment-intent
 *      Create Stripe PaymentIntent
 *
 * POST /confirm-order
 *      Send SMS via Twilio
 *
 * Hosted:
 *      Render.com
 *
 * Frontend:
 *      GitHub Pages
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const twilio = require("twilio");

const app = express();


// -----------------------------
// Environment setup
// -----------------------------

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const tw = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);


// -----------------------------
// Middleware
// -----------------------------

app.use(
  cors({
    origin: "https://tkham-ai.github.io",
  })
);

app.use(express.json());


// -----------------------------
// Health Check
// -----------------------------

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "T&L Market Backend",
    stripe:
      process.env.STRIPE_SECRET_KEY?.startsWith("sk_test")
        ? "TEST MODE"
        : "LIVE MODE",
    twilio: process.env.TWILIO_ACCOUNT_SID
      ? "configured"
      : "not configured",
  });
});


// -----------------------------
// STEP 1
// Create Stripe PaymentIntent
// -----------------------------

app.post("/create-payment-intent", async (req, res) => {

  try {

    const {
      amount,
      customerName,
      customerPhone,
      customerEmail
    } = req.body;


    if (!amount || amount < 50) {
      return res.status(400).json({
        error: "Invalid order amount."
      });
    }


    const paymentIntent =
      await stripe.paymentIntents.create({

        amount,

        currency: "usd",

        metadata: {

          customer_name: customerName || "",

          customer_phone: customerPhone || "",

          customer_email: customerEmail || "",

          store: "T&L Market"

        },

        automatic_payment_methods: {
          enabled: true
        }

      });


    res.json({

      clientSecret:
        paymentIntent.client_secret

    });


  } catch(err) {

    console.error(
      "Stripe error:",
      err.message
    );


    res.status(500).json({

      error: err.message

    });

  }

});


// -----------------------------
// STEP 2
// Confirm order + SMS
// -----------------------------

app.post("/confirm-order", async (req,res)=>{

try {


const {

orderNum,

customerName,

customerPhone,

customerEmail,

pickupTime,

notes,

items,

subtotal,

tax,

total,

paymentIntentId

}=req.body;



const itemLines =
items
.map(i =>
`${i.qty}x ${i.name} — $${(i.price*i.qty).toFixed(2)}`
)
.join("\n");



const cookMsg =
`🍽 NEW ORDER ${orderNum}

Pickup:
${pickupTime}

${itemLines}

TOTAL:
$${total}

${notes ? "NOTE: "+notes : ""}

Customer:
${customerName}
${customerPhone || ""}`;



const managerMsg =
`📋 ORDER RECEIPT ${orderNum}

T&L Market
1335 Middle St

Customer:
${customerName}

Phone:
${customerPhone || "-"}

Email:
${customerEmail || "-"}

Pickup:
${pickupTime}


${itemLines}


Subtotal:
$${subtotal}

Tax:
$${tax}

TOTAL:
$${total}


Payment:
${paymentIntentId}

${notes || ""}`;



const sends=[];



if(process.env.COOK_PHONE){

sends.push(

tw.messages.create({

body:cookMsg,

from:
process.env.TWILIO_PHONE_NUMBER,

to:
process.env.COOK_PHONE

})

);

}



if(process.env.MANAGER_PHONE){

sends.push(

tw.messages.create({

body:managerMsg,

from:
process.env.TWILIO_PHONE_NUMBER,

to:
process.env.MANAGER_PHONE

})

);

}



const results =
await Promise.allSettled(sends);



res.json({

success:true,

orderNum,

smsSent:
results.filter(
r=>r.status==="fulfilled"
).length

});


}
catch(err){

console.error(
"Confirm order error:",
err.message
);


res.status(500).json({

error:err.message

});

}


});


// -----------------------------
// Start Server
// -----------------------------

const PORT =
process.env.PORT || 3001;


app.listen(PORT,()=>{


console.log(`

=================================
T&L Market Backend Running

Port:
${PORT}

Stripe:
${
process.env.STRIPE_SECRET_KEY?.startsWith("sk_test")
?
"TEST MODE ✓"
:
"LIVE MODE"
}

Twilio:
${
process.env.TWILIO_ACCOUNT_SID
?
"configured ✓"
:
"NOT configured"
}

=================================

`);


});