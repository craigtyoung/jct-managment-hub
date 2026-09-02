/**
 * push.js — Web Push (VAPID) helper.
 * VAPID keys are generated once and persisted next to the data file (survives on
 * the Railway volume), so no manual env setup is needed. sendToStaff() fans a
 * payload out to every stored subscription for the given staff and prunes dead ones.
 */
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const db = require('./db');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'jct-data.json');
const VAPID_FILE = path.join(path.dirname(DATA_FILE), 'vapid.json');
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@joshuacreektennis.com';

function loadOrCreateVapid() {
  try {
    if (fs.existsSync(VAPID_FILE)) return JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
  } catch (e) { /* fall through to regenerate */ }
  const keys = webpush.generateVAPIDKeys();
  try { fs.writeFileSync(VAPID_FILE, JSON.stringify(keys)); console.log('Generated + saved new VAPID keys.'); }
  catch (e) { console.error('Could not persist VAPID keys:', e.message); }
  return keys;
}

const vapid = loadOrCreateVapid();
webpush.setVapidDetails(SUBJECT, vapid.publicKey, vapid.privateKey);

function publicKey() { return vapid.publicKey; }

// Fire-and-forget: send `payload` (object) to every subscription for these staff ids.
function sendToStaff(staffIds, payload) {
  const ids = (staffIds || []).map(Number).filter(Boolean);
  if (!ids.length) return;
  const subs = db.getSubscriptionsForStaff(ids);
  if (!subs.length) return;
  const body = JSON.stringify(payload);
  subs.forEach(row => {
    webpush.sendNotification(row.subscription, body).catch(err => {
      // 404/410 = subscription is gone; prune it so we stop trying.
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        try { db.removeSubscriptionByEndpoint(row.subscription.endpoint); } catch (e) {}
      }
    });
  });
}

module.exports = { publicKey, sendToStaff };
