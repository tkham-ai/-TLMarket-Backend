/**
 * T&L Market — Order Backend
 * ─────────────────────────────────────────────────────────────
 * Handles:
 *   POST /create-payment-intent  → Stripe charge
 *   POST /confirm-order          → Send SMS via Twilio to cook + manager
 *
 * Setup:
 *   npm install express cors stripe twilio dotenv
 *   node server.js
 *
 * Uses .env for all secrets (never hardcode keys).
 */

require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const Stripe  = require("stripe");
const twilio  = require("twilio");
const path    = require("path");

const app    = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const tw     = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.use(cors());
app.use(express.json());

/* Serve the frontend (index.html + images/) from the same folder */
app.use(express.static(path.join(__dirname)));

/* ─────────────────────────────────────────────────────────────
   STEP 1 — Create Stripe PaymentIntent
   Called when customer clicks "Place Order"
   Returns a client_secret the browser uses to confirm payment
   ───────────────────────────────────────────────────────────── */
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, customerName, customerPhone, customerEmail } = req.body;

    if (!amount || amount < 50) {
      return res.status(400).json({ error: "Invalid order amount." });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,          // in cents, e.g. 1675 = $16.75
      currency: "usd",
      metadata: {
        customer_name:  customerName  || "",
        customer_phone: customerPhone || "",
        customer_email: customerEmail || "",
        store:          "T&L Market",
      },
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Stripe error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   STEP 2 — Confirm order + send SMS
   Called after Stripe payment succeeds in the browser.
   Sends two SMS messages:
     • Cook's phone  — compact order list for the kitchen
     • Manager's phone — full receipt with customer contact
   ───────────────────────────────────────────────────────────── */
app.post("/confirm-order", async (req, res) => {
  try {
    const {
      orderNum,
      customerName,
      customerPhone,
      customerEmail,
      pickupTime,
      notes,
      items,       // array of { name, qty, price }
      subtotal,
      tax,
      total,
      paymentIntentId,
    } = req.body;

    /* ── Build the order lines ──────────────────────────────── */
    const itemLines = items
      .map(i => `  ${i.qty}x ${i.name} — $${(i.price * i.qty).toFixed(2)}`)
      .join("\n");

    /* ── COOK SMS — short kitchen ticket ───────────────────── */
    const cookMsg =
`🍽 NEW ORDER ${orderNum}
Pickup: ${pickupTime}
─────────────────
${itemLines}
─────────────────
TOTAL: $${total}
${notes ? "NOTE: " + notes : ""}
Customer: ${customerName} ${customerPhone ? "(" + customerPhone + ")" : ""}`;

    /* ── MANAGER SMS — full receipt ─────────────────────────── */
    const managerMsg =
`📋 ORDER RECEIPT ${orderNum}
T&L Market — 1335 Middle St
─────────────────────────────
Customer: ${customerName}
Phone:    ${customerPhone || "—"}
Email:    ${customerEmail || "—"}
Pickup:   ${pickupTime}
─────────────────────────────
${itemLines}
─────────────────────────────
Subtotal: $${subtotal}
Tax 4.712%: $${tax}
TOTAL:    $${total}
─────────────────────────────
Payment ID: ${paymentIntentId}
${notes ? "Customer note: " + notes : ""}`;

    /* ── Send SMS ───────────────────────────────────────────── */
    const sends = [];

    if (process.env.COOK_PHONE) {
      sends.push(
        tw.messages.create({
          body: cookMsg,
          from: process.env.TWILIO_PHONE_NUMBER,
          to:   process.env.COOK_PHONE,
        })
      );
    }

    if (process.env.MANAGER_PHONE) {
      sends.push(
        tw.messages.create({
          body: managerMsg,
          from: process.env.TWILIO_PHONE_NUMBER,
          to:   process.env.MANAGER_PHONE,
        })
      );
    }

    const results = await Promise.allSettled(sends);
    const failures = results
      .filter(r => r.status === "rejected")
      .map(r => r.reason?.message);

    if (failures.length) {
      console.warn("Some SMS failed:", failures);
    }

    res.json({
      success: true,
      orderNum,
      smsSent: results.filter(r => r.status === "fulfilled").length,
      smsErrors: failures,
    });

  } catch (err) {
    console.error("Confirm-order error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── Start ────────────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │  T&L Market server running on :${PORT}    │
  │  Frontend: http://localhost:${PORT}        │
  │  Stripe:   ${process.env.STRIPE_SECRET_KEY?.startsWith("sk_test") ? "TEST MODE ✓" : "LIVE MODE"} ${" ".repeat(20)}│
  │  Twilio:   ${process.env.TWILIO_ACCOUNT_SID ? "configured ✓" : "NOT configured ✗"}${" ".repeat(19)}│
  └─────────────────────────────────────────┘
  `);
});
