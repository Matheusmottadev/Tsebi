/**
 * Notification Scheduler
 * Runs automatic push notifications for:
 *  1. Abandoned checkout — user began checkout but didn't purchase (3–48h window)
 *  2. Low-stock wishlist  — product in user's wishlist is running low (≤3 units)
 *
 * Uses Firebase FCM (same helper as admin.ts send endpoint).
 * Writes to auto_notification_log to enforce per-user cooldowns and avoid spam.
 */

export {};

const { query } = require("../lib/db");

// ─── Firebase helper ──────────────────────────────────────────────────────────

function getFirebaseMessaging(): any | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
    }
    return admin.messaging();
  } catch (e: any) {
    console.error("[notif-scheduler] Firebase init error:", e?.message);
    return null;
  }
}

async function sendFcmToUser(
  userId: string,
  payload: { title: string; body: string; notificationType: string; deepLink?: string }
): Promise<number> {
  const messaging = getFirebaseMessaging();
  if (!messaging) return 0;

  const tokenRows: { fcm_token: string }[] = await query(
    "SELECT fcm_token FROM device_tokens WHERE user_id = $1",
    [userId]
  );
  const tokens = tokenRows.map((r: any) => r.fcm_token).filter(Boolean);
  if (tokens.length === 0) return 0;

  try {
    const msg: any = {
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: {
        notificationType: payload.notificationType,
        deepLink: payload.deepLink || "/account",
      },
    };
    const res = await messaging.sendEachForMulticast(msg);

    // Clean stale tokens
    if (res.responses) {
      const stale: string[] = [];
      res.responses.forEach((r: any, idx: number) => {
        if (
          !r.success &&
          (r.error?.code === "messaging/registration-token-not-registered" ||
            r.error?.code === "messaging/invalid-registration-token")
        ) {
          stale.push(tokens[idx]);
        }
      });
      if (stale.length > 0) {
        await query("DELETE FROM device_tokens WHERE fcm_token = ANY($1)", [stale]).catch(() => {});
      }
    }

    return res.successCount || 0;
  } catch (err: any) {
    console.error("[notif-scheduler] FCM error for user", userId, err?.message);
    return 0;
  }
}

// ─── 1. Abandoned checkout ────────────────────────────────────────────────────
// Window: user did begin_checkout between 3h and 48h ago, no purchase since.
// Cooldown: one notification per user per 24h for this trigger type.

const ABANDONED_CART_MIN_HOURS = 3;
const ABANDONED_CART_MAX_HOURS = 48;
const ABANDONED_CART_COOLDOWN_HOURS = 24;

export async function runAbandonedCheckoutNotifications(): Promise<void> {
  const label = "[notif-scheduler:abandoned-checkout]";
  try {
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.log(label, "Firebase not configured, skipping.");
      return;
    }

    // Users who started checkout but didn't buy, not recently notified
    const candidates: { user_id: string }[] = await query(`
      SELECT DISTINCT be.user_id::uuid AS user_id
      FROM behavior_events be
      WHERE be.event_name = 'begin_checkout'
        AND be.user_id IS NOT NULL
        AND be.occurred_at < now() - ($1 || ' hours')::INTERVAL
        AND be.occurred_at > now() - ($2 || ' hours')::INTERVAL
        AND NOT EXISTS (
          SELECT 1 FROM behavior_events p
          WHERE p.user_id = be.user_id
            AND p.event_name = 'purchase'
            AND p.occurred_at > be.occurred_at
        )
        AND NOT EXISTS (
          SELECT 1 FROM auto_notification_log anl
          WHERE anl.user_id = be.user_id::uuid
            AND anl.trigger_type = 'abandoned_cart'
            AND anl.sent_at > now() - ($3 || ' hours')::INTERVAL
        )
        AND EXISTS (
          SELECT 1 FROM device_tokens dt
          WHERE dt.user_id = be.user_id::uuid
        )
    `, [
      String(ABANDONED_CART_MIN_HOURS),
      String(ABANDONED_CART_MAX_HOURS),
      String(ABANDONED_CART_COOLDOWN_HOURS),
    ]);

    console.log(label, `Found ${candidates.length} candidate(s).`);

    const messages = [
      { title: "Você esqueceu algo?", body: "Seus itens ainda estão reservados. Complete seu pedido agora." },
      { title: "Sua seleção está esperando", body: "Peças exclusivas têm estoque limitado. Finalize antes que esgotem." },
      { title: "Algo ficou para trás", body: "Seus itens estão salvos. Quando quiser continuar, estaremos aqui." },
    ];

    let sent = 0;
    for (const { user_id } of candidates) {
      const msg = messages[Math.floor(Math.random() * messages.length)];
      const count = await sendFcmToUser(user_id, {
        title: msg.title,
        body: msg.body,
        notificationType: "pedido",
        deepLink: "/checkout",
      });
      if (count > 0) {
        await query(
          "INSERT INTO auto_notification_log (user_id, trigger_type) VALUES ($1, 'abandoned_cart')",
          [user_id]
        );
        sent++;
      }
    }

    if (sent > 0 || candidates.length > 0) {
      console.log(label, `Sent to ${sent}/${candidates.length} user(s).`);
    }
  } catch (err: any) {
    console.error(label, "Error:", err?.message);
  }
}

// ─── 2. Low-stock wishlist ─────────────────────────────────────────────────────
// Finds products with total stock_qty ≤ LOW_STOCK_THRESHOLD.
// Finds users who favorited that product (any favorite_toggle event).
// Cooldown: one notification per user+product per 7 days.

const LOW_STOCK_THRESHOLD = 3;
const LOW_STOCK_COOLDOWN_DAYS = 7;

export async function runLowStockWishlistNotifications(): Promise<void> {
  const label = "[notif-scheduler:low-stock-wishlist]";
  try {
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.log(label, "Firebase not configured, skipping.");
      return;
    }

    // Low-stock products
    const lowStockProducts: { id: string; name: string; sku: string; stock_qty: number }[] = await query(`
      SELECT id, name, sku, stock_qty
      FROM products
      WHERE active = true
        AND stock_qty > 0
        AND stock_qty <= $1
      ORDER BY stock_qty ASC
    `, [String(LOW_STOCK_THRESHOLD)]);

    if (lowStockProducts.length === 0) {
      return;
    }

    console.log(label, `Found ${lowStockProducts.length} low-stock product(s).`);

    let totalSent = 0;

    for (const product of lowStockProducts) {
      // Users who favorited this product and have a device token, not recently notified
      const candidates: { user_id: string }[] = await query(`
        SELECT DISTINCT be.user_id::uuid AS user_id
        FROM behavior_events be
        WHERE be.event_name = 'favorite_toggle'
          AND be.product_id = $1
          AND be.user_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM auto_notification_log anl
            WHERE anl.user_id = be.user_id::uuid
              AND anl.trigger_type = 'low_stock_wishlist'
              AND anl.product_id = $2
              AND anl.sent_at > now() - ($3 || ' days')::INTERVAL
          )
          AND EXISTS (
            SELECT 1 FROM device_tokens dt
            WHERE dt.user_id = be.user_id::uuid
          )
      `, [product.id, product.id, String(LOW_STOCK_COOLDOWN_DAYS)]);

      for (const { user_id } of candidates) {
        const stockMsg =
          product.stock_qty === 1
            ? "Último item disponível!"
            : `Restam apenas ${product.stock_qty} unidades.`;

        const count = await sendFcmToUser(user_id, {
          title: "Quase esgotado",
          body: `${product.name} — ${stockMsg}`,
          notificationType: "wishlist",
          deepLink: `/product/${product.sku || product.id}`,
        });

        if (count > 0) {
          await query(
            "INSERT INTO auto_notification_log (user_id, trigger_type, product_id) VALUES ($1, 'low_stock_wishlist', $2)",
            [user_id, product.id]
          );
          totalSent++;
        }
      }
    }

    if (totalSent > 0) {
      console.log(label, `Sent ${totalSent} low-stock notification(s).`);
    }
  } catch (err: any) {
    console.error(label, "Error:", err?.message);
  }
}

// ─── Scheduler registration ───────────────────────────────────────────────────

let _schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startNotificationScheduler(): void {
  if (_schedulerTimer) return; // Already running

  const INTERVAL_MINUTES = Math.min(
    Math.max(Number(process.env.NOTIF_SCHEDULER_INTERVAL_MINUTES || "60"), 30),
    360
  );

  console.log(`[notif-scheduler] Starting — interval: ${INTERVAL_MINUTES}min`);

  async function runAll() {
    await runAbandonedCheckoutNotifications();
    await runLowStockWishlistNotifications();
    // Also process any pending scheduled_notifications
    await runScheduledNotifications();
  }

  // Optionally run on boot
  if (process.env.NOTIF_SCHEDULER_RUN_ON_BOOT === "true") {
    runAll().catch((e) => console.error("[notif-scheduler] boot run error:", e?.message));
  }

  _schedulerTimer = setInterval(() => {
    runAll().catch((e) => console.error("[notif-scheduler] interval error:", e?.message));
  }, INTERVAL_MINUTES * 60 * 1000);

  if (_schedulerTimer.unref) _schedulerTimer.unref();
}

// ─── Process scheduled_notifications queue ────────────────────────────────────

async function runScheduledNotifications(): Promise<void> {
  const label = "[notif-scheduler:scheduled]";
  try {
    const pending: {
      id: string;
      title: string;
      body: string;
      target: string;
      notification_type: string;
      image_url: string | null;
      deep_link: string | null;
      product_sku: string | null;
      collection_name: string | null;
      filter_days_inactive: number | null;
      filter_city: string | null;
      filter_state: string | null;
    }[] = await query(
      `SELECT * FROM scheduled_notifications
       WHERE status = 'pending' AND scheduled_at <= now()
       ORDER BY scheduled_at ASC
       LIMIT 20`
    );

    if (pending.length === 0) return;
    console.log(label, `Processing ${pending.length} scheduled notification(s).`);

    for (const sn of pending) {
      try {
        // Mark as processing first (avoid double-send on concurrent runs)
        await query(
          "UPDATE scheduled_notifications SET status = 'processing' WHERE id = $1 AND status = 'pending'",
          [sn.id]
        );

        // Resolve tokens (same logic as admin.ts resolveTargetTokens)
        const tokenRows: { fcm_token: string }[] = await resolveScheduledTokens(sn);
        const tokens = tokenRows.map((r: any) => r.fcm_token).filter(Boolean);

        let sent = 0;
        const messaging = getFirebaseMessaging();
        if (messaging && tokens.length > 0) {
          const notification: any = { title: sn.title, body: sn.body };
          if (sn.image_url) notification.imageUrl = sn.image_url;

          const batchSize = 500;
          for (let i = 0; i < tokens.length; i += batchSize) {
            const batch = tokens.slice(i, i + batchSize);
            const msg: any = { tokens: batch, notification };
            const data: Record<string, string> = {
              notificationType: sn.notification_type || "custom",
            };
            if (sn.deep_link) data.deepLink = sn.deep_link;
            if (sn.collection_name) data.collectionName = sn.collection_name;
            if (sn.product_sku) data.productSku = sn.product_sku;
            msg.data = data;
            const res = await messaging.sendEachForMulticast(msg);
            sent += res.successCount || 0;
          }
        }

        // Log result and mark sent
        const logResult = await query(
          `INSERT INTO notification_logs
            (title, body, target, notification_type, image_url, deep_link, product_sku,
             collection_name, filter_days_inactive, filter_city, filter_state, sent_count, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'sent')
           RETURNING id`,
          [
            sn.title, sn.body, sn.target, sn.notification_type,
            sn.image_url, sn.deep_link, sn.product_sku, sn.collection_name,
            sn.filter_days_inactive, sn.filter_city, sn.filter_state, sent,
          ]
        );

        await query(
          "UPDATE scheduled_notifications SET status = 'sent', sent_at = now(), log_id = $2 WHERE id = $1",
          [sn.id, logResult[0]?.id || null]
        );

        console.log(label, `Sent scheduled notification "${sn.title}" → ${sent}/${tokens.length} devices.`);
      } catch (err: any) {
        console.error(label, `Failed for id=${sn.id}:`, err?.message);
        await query(
          "UPDATE scheduled_notifications SET status = 'failed' WHERE id = $1",
          [sn.id]
        ).catch(() => {});
      }
    }
  } catch (err: any) {
    console.error(label, "Error:", err?.message);
  }
}

async function resolveScheduledTokens(sn: {
  target: string;
  product_sku: string | null;
  filter_days_inactive: number | null;
  filter_city: string | null;
  filter_state: string | null;
}): Promise<{ fcm_token: string }[]> {
  const { target, product_sku, filter_days_inactive, filter_city, filter_state } = sn;

  if (target === "all" || !target) {
    return query("SELECT fcm_token FROM device_tokens");
  }
  if (target === "orders") {
    return query(
      "SELECT DISTINCT dt.fcm_token FROM device_tokens dt INNER JOIN orders o ON o.user_id = dt.user_id"
    );
  }
  if (target === "wishlist") {
    return query(
      `SELECT DISTINCT dt.fcm_token
       FROM device_tokens dt
       WHERE dt.user_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM behavior_events be
           WHERE be.user_id = dt.user_id::text
             AND be.event_name = 'favorite_toggle'
         )`
    );
  }
  if (target === "wishlist_product" && product_sku) {
    return query(
      `SELECT DISTINCT dt.fcm_token
       FROM device_tokens dt
       WHERE dt.user_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM behavior_events be
           INNER JOIN products p ON p.id::text = be.product_id
           WHERE be.user_id = dt.user_id::text
             AND be.event_name = 'favorite_toggle'
             AND p.sku = $1
         )`,
      [product_sku]
    );
  }
  if (target === "inactive" && filter_days_inactive && filter_days_inactive > 0) {
    return query(
      `SELECT DISTINCT dt.fcm_token
       FROM device_tokens dt
       WHERE dt.user_id IS NOT NULL
         AND dt.user_id NOT IN (
           SELECT DISTINCT user_id FROM orders
           WHERE created_at >= now() - ($1 || ' days')::INTERVAL
             AND user_id IS NOT NULL
         )`,
      [String(filter_days_inactive)]
    );
  }
  if (target === "city" && filter_city) {
    return query(
      `SELECT DISTINCT dt.fcm_token
       FROM device_tokens dt
       INNER JOIN orders o ON o.user_id = dt.user_id
       WHERE lower(o.shipping_json->>'city') = lower($1)`,
      [filter_city]
    );
  }
  if (target === "state" && filter_state) {
    return query(
      `SELECT DISTINCT dt.fcm_token
       FROM device_tokens dt
       INNER JOIN orders o ON o.user_id = dt.user_id
       WHERE lower(o.shipping_json->>'state') = lower($1)`,
      [filter_state]
    );
  }
  return [];
}

module.exports = {
  startNotificationScheduler,
  runAbandonedCheckoutNotifications,
  runLowStockWishlistNotifications,
};
