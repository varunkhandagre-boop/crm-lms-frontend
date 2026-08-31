// functions/src/index.js
const functions = require('firebase-functions/v1'); // v1 namespace explicitly - naye package version me zaroori
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const { processOutboundMessage: processFn } = require('./sendOutboundMessages.js');

// Trigger 1: Naya message queue hone par - agar "abhi" ke liye hai to turant bhejo
exports.processOutboundMessage = functions.firestore
  .document('outbound_messages/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const scheduledFor = new Date(message.scheduledFor);
    const now = new Date();

    // Agar future date hai (jaise 3-din baad wala follow-up), abhi kuch mat karo -
    // scheduled function (neeche) ise sahi time par utha lega
    if (scheduledFor > now) {
      console.log(`Message ${context.params.messageId} scheduled for later: ${scheduledFor}`);
      return null;
    }

    return processFn(snap, context);
  });

// Trigger 2: Har 15 minute me check karo - kya koi "pending" future-dated
// message ab due ho chuka hai? (drip campaigns / follow-ups ke liye zaroori)
exports.processDueScheduledMessages = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const now = new Date().toISOString();

    const dueMessages = await db
      .collection('outbound_messages')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', now)
      .limit(50) // ek baar me zyada load na ho
      .get();

    console.log(`Found ${dueMessages.size} due messages to process`);

    const results = await Promise.allSettled(
      dueMessages.docs.map((doc) => processFn(doc, { params: { messageId: doc.id } }))
    );

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Failed to process ${dueMessages.docs[i].id}:`, r.reason);
      }
    });

    return null;
  });