"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Clock, Image, Link2, Search, Smartphone, X } from "lucide-react";
import {
  cancelScheduledNotification,
  fetchScheduledNotifications,
  listProductsAdmin,
  sendNotificationAdmin,
  type AdminScheduledNotification,
  type NotificationTarget,
  type NotificationType,
} from "@/services/admin";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";
import type { Product } from "@/types";

type DrawerNovaNotificacaoProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

// ─── Consts ────────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: NotificationType; label: string; color: string }[] = [
  { value: "colecao", label: "COLEÇÃO", color: "#1a1a1a" },
  { value: "promocao", label: "PROMOÇÃO", color: "#7c4e00" },
  { value: "wishlist", label: "WISHLIST", color: "#6b2080" },
  { value: "pedido", label: "PEDIDO", color: "#0a4f7a" },
  { value: "reparo", label: "REPARO", color: "#2e5c1e" },
  { value: "atendimento", label: "ATENDIMENTO", color: "#8b1a1a" },
  { value: "custom", label: "OUTRO", color: "#444" },
];

const TARGET_OPTIONS: { value: NotificationTarget; label: string; hasExtra?: boolean }[] = [
  { value: "all", label: "Todos os dispositivos" },
  { value: "orders", label: "Usuários com pedidos" },
  { value: "wishlist", label: "Usuários com wishlist" },
  { value: "wishlist_product", label: "Com produto específico na wishlist", hasExtra: true },
  { value: "inactive", label: "Inativos há X dias", hasExtra: true },
  { value: "city", label: "Por cidade", hasExtra: true },
  { value: "state", label: "Por estado", hasExtra: true },
];

const COLLECTION_OPTIONS = [
  { value: "", label: "Nenhuma" },
  { value: "Genesis", label: "Gênesis" },
  { value: "Alicerce", label: "Alicerce" },
];

function formatScheduledDate(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function asScheduledNotifications(value: unknown): AdminScheduledNotification[] {
  return Array.isArray(value) ? (value as AdminScheduledNotification[]) : [];
}

function toLocalDateTimeInputMin(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function targetLabel(target: string): string {
  return TARGET_OPTIONS.find((t) => t.value === target)?.label || target;
}

function typeLabel(type: string): string {
  return TYPE_OPTIONS.find((t) => t.value === type)?.label || type;
}

// ─── iPhone preview ────────────────────────────────────────────────────────────

function IPhonePreview({
  title,
  body,
  imageUrl,
  notificationType,
}: {
  title: string;
  body: string;
  imageUrl?: string;
  notificationType: NotificationType;
}) {
  const typeInfo = TYPE_OPTIONS.find((t) => t.value === notificationType);
  return (
    <div style={{ padding: "16px 0 4px" }}>
      <p className={form.label} style={{ marginBottom: 10 }}>
        <Smartphone size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
        Pré-visualização
      </p>
      <div
        style={{
          background: "linear-gradient(145deg, #1c1c1e, #2c2c2e)",
          borderRadius: 16,
          padding: "12px 14px",
          maxWidth: 300,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
      >
        {/* Status bar */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, opacity: 0.5 }}>
          <span style={{ color: "#fff", fontSize: 9, fontFamily: "system-ui" }}>9:41</span>
          <span style={{ color: "#fff", fontSize: 9, fontFamily: "system-ui" }}>●●● ▲ 100%</span>
        </div>
        {/* Notification card */}
        <div
          style={{
            background: "rgba(255,255,255,0.14)",
            backdropFilter: "blur(20px)",
            borderRadius: 12,
            padding: "10px 12px",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          {/* App icon placeholder */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#000",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <span style={{ color: "#fff", fontSize: 9, letterSpacing: 0, fontWeight: 700 }}>T</span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
              <span style={{ color: "#fff", fontSize: 10, fontWeight: 600, fontFamily: "system-ui", letterSpacing: -0.2 }}>
                Tsebi
              </span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, fontFamily: "system-ui" }}>agora</span>
            </div>
            {typeInfo && (
              <div
                style={{
                  display: "inline-block",
                  background: typeInfo.color,
                  color: "#fff",
                  fontSize: 7,
                  padding: "1px 5px",
                  borderRadius: 3,
                  letterSpacing: "0.08em",
                  marginBottom: 3,
                  textTransform: "uppercase",
                  fontFamily: "system-ui",
                }}
              >
                {typeInfo.label}
              </div>
            )}
            <p
              style={{
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                margin: "0 0 2px",
                fontFamily: "system-ui",
                lineHeight: 1.3,
                letterSpacing: -0.2,
              }}
            >
              {title || "Título da notificação"}
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: 10,
                margin: 0,
                fontFamily: "system-ui",
                lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {body || "Mensagem da notificação aparece aqui."}
            </p>
            {imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageUrl}
                alt=""
                style={{ marginTop: 6, width: "100%", borderRadius: 6, objectFit: "cover", maxHeight: 72, display: "block" }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Scheduled list ────────────────────────────────────────────────────────────

function ScheduledList({
  items,
  onCancel,
}: {
  items: AdminScheduledNotification[];
  onCancel: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ borderTop: "1px solid #e8e8e8", paddingTop: 16, marginTop: 4 }}>
      <p className={form.label} style={{ marginBottom: 10 }}>
        <Clock size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
        Agendadas pendentes ({items.length})
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              border: "1px solid #e8e8e8",
              padding: "10px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: "#111", lineHeight: 1.3 }}>
                {item.title}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 10, color: "#666", lineHeight: 1.3 }}>
                {item.body}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 9, color: "#999", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {typeLabel(item.notification_type)} · {targetLabel(item.target)} · {formatScheduledDate(item.scheduled_at)}
              </p>
            </div>
            <button
              onClick={() => onCancel(item.id)}
              style={{
                flexShrink: 0,
                border: 0,
                background: "transparent",
                color: "#999",
                cursor: "pointer",
                padding: 2,
                display: "flex",
                alignItems: "center",
              }}
              title="Cancelar agendamento"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Product picker ────────────────────────────────────────────────────────────

function ProductPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (sku: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await listProductsAdmin({ query: query.trim(), pageSize: 8 });
        setResults(res.rows || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [query]);

  function pick(p: Product) {
    const sku = String((p as any).sku || p.id || "");
    setSelectedName(p.name);
    setQuery("");
    setResults([]);
    onChange(sku, p.name);
  }

  return (
    <div>
      {value ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid #e0e0e0",
            padding: "9px 12px",
            fontSize: 12,
            color: "#111",
          }}
        >
          <span style={{ flex: 1 }}>{selectedName || value}</span>
          <button
            onClick={() => { onChange("", ""); setSelectedName(""); }}
            style={{ border: 0, background: "transparent", cursor: "pointer", color: "#999", padding: 0, display: "flex" }}
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <div style={{ position: "relative" }}>
            <Search
              size={13}
              style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#aaa", pointerEvents: "none" }}
            />
            <input
              className={form.input}
              style={{ paddingLeft: 32 }}
              placeholder="Buscar produto por nome ou SKU…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {(results.length > 0 || loading) ? (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                border: "1px solid #e0e0e0",
                background: "#fff",
                zIndex: 20,
                maxHeight: 200,
                overflowY: "auto",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              }}
            >
              {loading ? (
                <div style={{ padding: "10px 14px", fontSize: 11, color: "#888" }}>Buscando…</div>
              ) : results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pick(p)}
                  style={{
                    display: "block",
                    width: "100%",
                    border: 0,
                    background: "transparent",
                    padding: "9px 14px",
                    textAlign: "left",
                    cursor: "pointer",
                    borderBottom: "1px solid #f0f0f0",
                    fontSize: 12,
                    color: "#111",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f7f7f7")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  <span style={{ color: "#999", marginLeft: 6, fontSize: 10 }}>{(p as any).sku || p.id}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function DrawerNovaNotificacao({ isOpen, onClose, onSaved }: DrawerNovaNotificacaoProps) {
  // Core fields
  const [notificationType, setNotificationType] = useState<NotificationType>("custom");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // Targeting
  const [target, setTarget] = useState<NotificationTarget>("all");
  const [productSku, setProductSku] = useState("");
  const [filterDaysInactive, setFilterDaysInactive] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterState, setFilterState] = useState("");

  // Personalisation (collapsible)
  const [showPersonalisation, setShowPersonalisation] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [deepLink, setDeepLink] = useState("");

  // Scheduling (collapsible)
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  // State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Scheduled queue
  const [scheduled, setScheduled] = useState<AdminScheduledNotification[]>([]);

  // Load scheduled on open
  useEffect(() => {
    if (!isOpen) return;
    fetchScheduledNotifications()
      .then((r) => setScheduled(asScheduledNotifications(r?.rows)))
      .catch(() => setScheduled([]));
  }, [isOpen]);

  function reset() {
    setNotificationType("custom");
    setTitle("");
    setBody("");
    setTarget("all");
    setProductSku("");
    setFilterDaysInactive("");
    setFilterCity("");
    setFilterState("");
    setShowPersonalisation(false);
    setCollectionName("");
    setImageUrl("");
    setDeepLink("");
    setScheduleEnabled(false);
    setScheduledAt("");
    setErrorMessage("");
    setSuccessMessage("");
  }

  const isValid =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (target !== "wishlist_product" || productSku.trim().length > 0) &&
    (target !== "inactive" || (filterDaysInactive.trim().length > 0 && Number(filterDaysInactive) > 0)) &&
    (target !== "city" || filterCity.trim().length > 0) &&
    (target !== "state" || filterState.trim().length > 0) &&
    (!scheduleEnabled || scheduledAt.trim().length > 0);

  async function handleSave() {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const scheduledDate = scheduleEnabled && scheduledAt ? new Date(scheduledAt) : null;
      if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
        setErrorMessage("Data de agendamento inválida. Escolha outra data e hora.");
        return;
      }

      const payload: Parameters<typeof sendNotificationAdmin>[0] = {
        title: title.trim(),
        body: body.trim(),
        target,
        notificationType,
        imageUrl: imageUrl.trim() || undefined,
        deepLink: deepLink.trim() || undefined,
        productSku: productSku.trim() || undefined,
        collectionName: collectionName || undefined,
        filterDaysInactive: filterDaysInactive ? Number(filterDaysInactive) : undefined,
        filterCity: filterCity.trim() || undefined,
        filterState: filterState.trim() || undefined,
        scheduledAt: scheduledDate ? scheduledDate.toISOString() : undefined,
      };
      const result = await sendNotificationAdmin(payload);

      if (result.scheduled) {
        setSuccessMessage(`Notificação agendada para ${formatScheduledDate(result.scheduledAt || scheduledAt)}.`);
        fetchScheduledNotifications()
          .then((r) => setScheduled(asScheduledNotifications(r?.rows)))
          .catch(() => setScheduled([]));
        // Don't close — let user see confirmation + scheduled list
      } else {
        setSuccessMessage(`Notificação enviada para ${result.sent ?? 0} dispositivo(s).`);
        setTimeout(() => {
          reset();
          onSaved();
          onClose();
        }, 1800);
      }
    } catch {
      setErrorMessage("Não foi possível enviar a notificação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelScheduled(id: string) {
    try {
      await cancelScheduledNotification(id);
      setScheduled((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // silent
    }
  }

  const saveLabel = isSubmitting
    ? scheduleEnabled ? "Agendando…" : "Enviando…"
    : scheduleEnabled ? "Agendar" : "Enviar agora";

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => { reset(); onClose(); }}
      title="Nova Notificação"
      subtitle="Push notification para dispositivos iOS"
      onSave={handleSave}
      saveLabel={saveLabel}
      cancelLabel="Cancelar"
      disableSave={!isValid || isSubmitting}
      stickyFooter
    >
      <div className={form.stack}>

        {/* ── Feedback messages ── */}
        {errorMessage ? (
          <p style={{ color: "#9f1f1f", fontSize: 12, margin: 0 }}>{errorMessage}</p>
        ) : null}
        {successMessage ? (
          <p style={{ color: "#2e5c1e", fontSize: 12, margin: 0 }}>{successMessage}</p>
        ) : null}

        {/* ── Tipo / categoria ── */}
        <div className={form.field} style={{ marginBottom: 8 }}>
          <label className={form.label}>Tipo / Categoria</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setNotificationType(opt.value)}
                style={{
                  border: notificationType === opt.value ? `1.5px solid ${opt.color}` : "1px solid #d8d8d8",
                  background: notificationType === opt.value ? opt.color : "#fff",
                  color: notificationType === opt.value ? "#fff" : "#555",
                  padding: "5px 10px",
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  cursor: "pointer",
                  fontFamily: "var(--font-jost), sans-serif",
                  fontWeight: notificationType === opt.value ? 500 : 300,
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Título ── */}
        <div className={form.field}>
          <label className={form.label} htmlFor="notif-title">Título</label>
          <input
            id="notif-title"
            className={form.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Nova coleção disponível"
            maxLength={100}
          />
          <small className={form.helper} style={{ display: "block", marginTop: 4 }}>
            {title.length}/100
          </small>
        </div>

        {/* ── Mensagem ── */}
        <div className={form.field}>
          <label className={form.label} htmlFor="notif-body">Mensagem</label>
          <textarea
            id="notif-body"
            className={form.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ex: Descubra as novas peças da coleção Inverno."
            rows={3}
            maxLength={300}
          />
          <small className={form.helper} style={{ display: "block", marginTop: 4 }}>
            {body.length}/300
          </small>
        </div>

        {/* ── Destinatários ── */}
        <div className={form.field}>
          <label className={form.label} htmlFor="notif-target">Destinatários</label>
          <select
            id="notif-target"
            className={form.select}
            value={target}
            onChange={(e) => {
              setTarget(e.target.value as NotificationTarget);
              setProductSku("");
              setFilterDaysInactive("");
              setFilterCity("");
              setFilterState("");
            }}
          >
            {TARGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Target extra fields */}
        {target === "wishlist_product" ? (
          <div className={form.field}>
            <label className={form.label}>Produto na Wishlist</label>
            <ProductPicker
              value={productSku}
              onChange={(sku) => setProductSku(sku)}
            />
            {!productSku ? (
              <small className={form.helper} style={{ marginTop: 4, display: "block" }}>
                Selecione um produto para filtrar usuários que o têm na wishlist.
              </small>
            ) : null}
          </div>
        ) : null}

        {target === "inactive" ? (
          <div className={form.field}>
            <label className={form.label} htmlFor="notif-inactive">Inativos há quantos dias?</label>
            <input
              id="notif-inactive"
              className={form.input}
              type="number"
              min={1}
              max={9999}
              value={filterDaysInactive}
              onChange={(e) => setFilterDaysInactive(e.target.value)}
              placeholder="Ex: 30"
            />
          </div>
        ) : null}

        {target === "city" ? (
          <div className={form.field}>
            <label className={form.label} htmlFor="notif-city">Cidade</label>
            <input
              id="notif-city"
              className={form.input}
              type="text"
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              placeholder="Ex: São Paulo"
            />
          </div>
        ) : null}

        {target === "state" ? (
          <div className={form.field}>
            <label className={form.label} htmlFor="notif-state">Estado (sigla)</label>
            <input
              id="notif-state"
              className={form.input}
              type="text"
              maxLength={2}
              value={filterState}
              onChange={(e) => setFilterState(e.target.value.toUpperCase())}
              placeholder="Ex: SP"
            />
          </div>
        ) : null}

        {/* ── Personalização (collapsible) ── */}
        <div className={form.optional}>
          <button
            className={form.optionalBtn}
            onClick={() => setShowPersonalisation((v) => !v)}
            type="button"
          >
            <Image size={12} />
            Personalização avançada
            {showPersonalisation ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showPersonalisation ? (
            <div className={form.optionalContent}>
              <div className={form.field}>
                <label className={form.label} htmlFor="notif-collection">Coleção em destaque</label>
                <select
                  id="notif-collection"
                  className={form.select}
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                >
                  {COLLECTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className={form.field}>
                <label className={form.label} htmlFor="notif-image">
                  <Image size={9} style={{ marginRight: 4, verticalAlign: "middle" }} />
                  URL da imagem (opcional)
                </label>
                <input
                  id="notif-image"
                  className={form.input}
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://media.tsebi.com.br/..."
                />
                <small className={form.helper} style={{ marginTop: 4, display: "block" }}>
                  Imagem exibida abaixo do texto na notificação (iOS 15+).
                </small>
              </div>

              <div className={form.field}>
                <label className={form.label} htmlFor="notif-deeplink">
                  <Link2 size={9} style={{ marginRight: 4, verticalAlign: "middle" }} />
                  Deep link (opcional)
                </label>
                <input
                  id="notif-deeplink"
                  className={form.input}
                  type="text"
                  value={deepLink}
                  onChange={(e) => setDeepLink(e.target.value)}
                  placeholder="Ex: /account, /product/SKU123"
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Agendamento (collapsible) ── */}
        <div className={form.optional}>
          <button
            className={form.optionalBtn}
            onClick={() => setScheduleEnabled((v) => !v)}
            type="button"
          >
            <Clock size={12} />
            {scheduleEnabled ? "Enviar agendado" : "Agendar para depois"}
            {scheduleEnabled ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {scheduleEnabled ? (
            <div className={form.optionalContent}>
              <div className={form.field}>
                <label className={form.label} htmlFor="notif-schedule">Data e hora do envio</label>
                <input
                  id="notif-schedule"
                  className={form.input}
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={toLocalDateTimeInputMin(new Date(Date.now() + 60_000))}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* ── iPhone Preview ── */}
        <IPhonePreview
          title={title}
          body={body}
          imageUrl={imageUrl || undefined}
          notificationType={notificationType}
        />

        {/* ── Scheduled queue ── */}
        <ScheduledList items={scheduled} onCancel={handleCancelScheduled} />

      </div>
    </Drawer>
  );
}
