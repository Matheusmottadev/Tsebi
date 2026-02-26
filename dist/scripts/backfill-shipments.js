const dotenv = require("dotenv");
const { query } = require("../server/lib/db");
dotenv.config();
function parseArg(name, fallback = "") {
    const arg = process.argv.find((item) => item.startsWith(`--${name}=`));
    if (!arg)
        return fallback;
    return arg.slice(name.length + 3);
}
function parseNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
function normalizeStatus(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw)
        return "ETIQUETA_COMPRADA";
    return raw;
}
async function main() {
    const dryRun = parseArg("dry-run", "1") !== "0";
    const limit = Math.max(1, parseNumber(parseArg("limit", "200"), 200));
    const orders = await query(`
    SELECT
      o.id,
      o.tracking_code,
      o.current_status,
      o.shipping_selected_provider,
      o.shipping_selected_service_code,
      o.shipping_price_cents,
      o.shipping_deadline_days,
      o.created_at,
      o.updated_at,
      (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_name = 'orders'
          AND c.column_name = 'tracking_status'
      ) AS has_tracking_status
    FROM orders o
    LEFT JOIN shipments s
      ON s.order_id = o.id
    WHERE COALESCE(o.tracking_code, '') <> ''
      AND s.order_id IS NULL
    ORDER BY o.created_at DESC
    LIMIT $1
    `, [limit]);
    if (orders.rows.length === 0) {
        console.log("Nenhum pedido para backfill.");
        return;
    }
    console.log(`Pedidos encontrados: ${orders.rows.length}. dry-run=${dryRun ? "1" : "0"}`);
    let inserted = 0;
    for (const row of orders.rows) {
        const provider = String(row.shipping_selected_provider || "melhorenvio").trim().toLowerCase();
        const serviceCode = String(row.shipping_selected_service_code || "manual").trim();
        let trackingStatus = "";
        if (row.has_tracking_status) {
            const statusResult = await query(`SELECT tracking_status FROM orders WHERE id = $1::uuid LIMIT 1`, [row.id]);
            trackingStatus = String(statusResult.rows[0]?.tracking_status || "");
        }
        const status = normalizeStatus(trackingStatus) ||
            normalizeStatus(row.current_status) ||
            "ETIQUETA_COMPRADA";
        const payload = {
            source: "backfill_shipments",
            orderStatus: row.current_status || "",
            trackingStatus
        };
        if (dryRun) {
            console.log(`DRY-RUN: ${row.id} -> tracking ${row.tracking_code}`);
            continue;
        }
        await query(`
      INSERT INTO shipments (
        order_id,
        provider,
        service_code,
        label_external_id,
        tracking_code,
        status,
        price_cents,
        deadline_days,
        raw_payload
      ) VALUES (
        $1::uuid,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb
      )
      ON CONFLICT (order_id) DO UPDATE
      SET
        provider = EXCLUDED.provider,
        service_code = EXCLUDED.service_code,
        tracking_code = EXCLUDED.tracking_code,
        status = EXCLUDED.status,
        price_cents = EXCLUDED.price_cents,
        deadline_days = EXCLUDED.deadline_days,
        raw_payload = COALESCE(shipments.raw_payload, '{}'::jsonb) || EXCLUDED.raw_payload,
        updated_at = NOW()
      `, [
            row.id,
            provider,
            serviceCode,
            "",
            String(row.tracking_code || "").trim(),
            status,
            Math.max(0, Number(row.shipping_price_cents || 0)),
            row.shipping_deadline_days == null ? null : Math.max(0, Number(row.shipping_deadline_days || 0)),
            JSON.stringify(payload)
        ]);
        inserted += 1;
    }
    if (!dryRun) {
        console.log(`Backfill concluído. Inseridos/atualizados: ${inserted}.`);
    }
}
main().catch((error) => {
    console.error("Backfill falhou:", error?.message || error);
    process.exit(1);
});
//# sourceMappingURL=backfill-shipments.js.map