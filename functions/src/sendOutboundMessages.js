// functions/src/sendOutboundMessages.js
//
// Ye function Firestore ke "outbound_messages" collection par trigger hota hai.
// Jab bhi DataContext.js ka queueAutomatedMessage() ek naya document banata hai,
// ye function automatically chal jaata hai aur actual WhatsApp/Email bhejta hai.
//
// IMPORTANT: Isse deploy karne ke liye tenant ki settings (API keys) ek
// "tenants/{companyId}/settings/notifications" document me honi chahiye:
//
// {
//   whatsappEnabled: true,
//   whatsappProvider: "aisensy",       // ya "meta_cloud", "gupshup", "wati"
//   whatsappApiKey: "...",
//   whatsappSenderId: "...",           // AiSensy me isse "API key" hi kaafi hota hai
//   emailEnabled: true,
//   emailProvider: "sendgrid",
//   emailApiKey: "...",
//   emailFromAddress: "orders@yourclient.com"
// }

const functions = require('firebase-functions/v1'); // v1 namespace explicitly - naye package version me zaroori
const admin = require('firebase-admin');
// Note: axios yahan top-level par require nahi kar rahe - har function ke
// andar lazy require kar rahe hain. Isse module load (jo Windows par
// deployment ke waqt discovery timeout ka कारण ban raha tha) fast hota hai.

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ---------- WhatsApp senders (provider-wise) ----------

async function sendViaAiSensy(settings, to, templateName, variables) {
  const axios = require('axios');
  // AiSensy ka Campaign API - sabse popular India me
  return axios.post('https://backend.aisensy.com/campaign/t1/api/v2', {
    apiKey: settings.whatsappApiKey,
    campaignName: templateName, // AiSensy me campaign hi template hota hai
    destination: to,
    userName: variables.customer_name || 'Customer',
    templateParams: Object.values(variables).map(String),
  });
}

async function sendViaMetaCloud(settings, to, templateName, variables) {
  const axios = require('axios');
  const url = `https://graph.facebook.com/v19.0/${settings.whatsappSenderId}/messages`;
  return axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: Object.values(variables).map((v) => ({ type: 'text', text: String(v) })),
          },
        ],
      },
    },
    { headers: { Authorization: `Bearer ${settings.whatsappApiKey}` } }
  );
}

async function sendViaGupshup(settings, to, templateName, variables) {
  const axios = require('axios');
  return axios.post(
    'https://api.gupshup.io/wa/api/v1/template/msg',
    new URLSearchParams({
      channel: 'whatsapp',
      source: settings.whatsappSenderId,
      destination: to,
      template: JSON.stringify({ id: templateName, params: Object.values(variables) }),
    }),
    { headers: { apikey: settings.whatsappApiKey } }
  );
}

async function sendWhatsapp(settings, to, templateName, variables) {
  switch (settings.whatsappProvider) {
    case 'aisensy':
      return sendViaAiSensy(settings, to, templateName, variables);
    case 'meta_cloud':
      return sendViaMetaCloud(settings, to, templateName, variables);
    case 'gupshup':
      return sendViaGupshup(settings, to, templateName, variables);
    default:
      throw new Error(`Unknown WhatsApp provider: ${settings.whatsappProvider}`);
  }
}

// ---------- Email sender ----------

async function sendEmail(settings, to, templateName, variables) {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(settings.emailApiKey);

  // Simple text body from variables - aap chahe to HTML templates bhi bana sakte hain
  const bodyLines = Object.entries(variables)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  return sgMail.send({
    to,
    from: settings.emailFromAddress,
    subject: templateName.replace(/_/g, ' '),
    text: bodyLines,
  });
}

// ---------- Core processing logic (reusable) ----------
// Isko index.js dono jagah se call karta hai: turant wale messages ke liye
// aur 15-minute wale scheduled check ke liye (drip campaigns).

async function processOutboundMessage(snap, context) {
    const message = snap.data();
    const { type, to, templateName, variables, companyId } = message;

    if (!companyId) {
      console.error('Message missing companyId, cannot look up tenant settings:', context.params.messageId);
      await snap.ref.update({ status: 'failed', error: 'missing companyId' });
      return;
    }

    // 🔒 SECURITY LAYER 1: SuperAdmin ne is company ke liye Automation
    // Add-on enable kiya hai ya nahi - server-side check (UI lock ke
    // bharose nahi rehte, koi Firestore me directly settings likh sakta hai)
    const companySnap = await db.collection('companies').doc(companyId).get();
    if (!companySnap.exists || companySnap.data()?.automationAddonEnabled !== true) {
      await snap.ref.update({ status: 'skipped', reason: 'automation addon not enabled by SuperAdmin' });
      return;
    }

    // 🔒 SECURITY LAYER 2: Tenant ki apni settings uthao
    const settingsSnap = await db
      .collection('tenants')
      .doc(companyId)
      .collection('settings')
      .doc('notifications')
      .get();

    if (!settingsSnap.exists) {
      await snap.ref.update({ status: 'skipped', reason: 'no settings configured' });
      return;
    }
    const settings = settingsSnap.data();

    // Feature-gate check - yahi tenant-level on/off ka control point hai
    if (type === 'whatsapp' && !settings.whatsappEnabled) {
      await snap.ref.update({ status: 'skipped', reason: 'whatsapp not enabled for tenant' });
      return;
    }
    if (type === 'email' && !settings.emailEnabled) {
      await snap.ref.update({ status: 'skipped', reason: 'email not enabled for tenant' });
      return;
    }

    try {
      if (type === 'whatsapp') {
        await sendWhatsapp(settings, to, templateName, variables);
      } else if (type === 'email') {
        await sendEmail(settings, to, templateName, variables);
      } else {
        throw new Error(`Unknown message type: ${type}`);
      }

      await snap.ref.update({ status: 'sent', sentAt: new Date().toISOString() });
    } catch (err) {
      console.error('Send failed:', err.message);
      const retryCount = (message.retryCount || 0) + 1;

      await snap.ref.update({
        status: retryCount >= 3 ? 'failed' : 'pending',
        retryCount,
        lastError: err.message,
      });
    }
}

module.exports = { processOutboundMessage };