"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const webpush = require("web-push");
const { query } = require("./db");
// Configura VAPID uma vez ao carregar o módulo
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_EMAIL) {
    webpush.setVapidDetails(process.env.VAPID_EMAIL, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}
function buildWebPushSub(row) {
    return {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
    };
}
// Salva ou atualiza uma subscription (upsert por endpoint)
async function saveSubscription(userId, sub, userAgent) {
    await query(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint)
     DO UPDATE SET user_id = $1, p256dh = $3, auth = $4, user_agent = $5`, [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent || null]);
}
// Envia push para todos os dispositivos de um usuário
async function sendPushToUser(userId, payload) {
    if (!userId)
        return;
    const { rows } = await query(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, [userId]);
    const expiredEndpoints = [];
    await Promise.allSettled(rows.map(async (row) => {
        try {
            await webpush.sendNotification(buildWebPushSub(row), JSON.stringify(payload));
            await query(`UPDATE push_subscriptions SET last_sent_at = now() WHERE id = $1`, [row.id]);
        }
        catch (err) {
            const status = err?.statusCode;
            if (status === 410 || status === 404) {
                // Subscription expirada ou inválida — remove do banco
                expiredEndpoints.push(row.endpoint);
            }
            else {
                // eslint-disable-next-line no-console
                console.error("[PUSH_SEND_FAILED]", { userId, endpoint: row.endpoint, status });
            }
        }
    }));
    if (expiredEndpoints.length > 0) {
        await Promise.allSettled(expiredEndpoints.map((ep) => query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [ep])));
    }
}
// Broadcast para todos os subscribers (novo produto, flash sale, etc.)
async function sendPushBroadcast(payload) {
    const { rows } = await query(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions`);
    const expiredEndpoints = [];
    await Promise.allSettled(rows.map(async (row) => {
        try {
            await webpush.sendNotification(buildWebPushSub(row), JSON.stringify(payload));
            await query(`UPDATE push_subscriptions SET last_sent_at = now() WHERE id = $1`, [row.id]);
        }
        catch (err) {
            const status = err?.statusCode;
            if (status === 410 || status === 404) {
                expiredEndpoints.push(row.endpoint);
            }
        }
    }));
    if (expiredEndpoints.length > 0) {
        await Promise.allSettled(expiredEndpoints.map((ep) => query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [ep])));
    }
}
// Remove uma subscription específica (unsubscribe)
async function deleteSubscription(endpoint) {
    await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}
module.exports = { saveSubscription, sendPushToUser, sendPushBroadcast, deleteSubscription };
//# sourceMappingURL=push-notification-service.js.map