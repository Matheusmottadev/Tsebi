"use client";

import { useState } from "react";
import { Drawer } from "./Drawer";
import {
  createGiftCardAdmin,
  updateGiftCardAdmin,
  getGiftCardTransactionsAdmin,
  type CreateGiftCardAdminPayload,
  type GiftCardTransaction,
} from "@/services/admin";
import type { GiftCard } from "@/types";
import styles from "./DrawerForms.module.css";

interface Props {
  giftCard: GiftCard | null; // null = create mode
  csrfToken: string;
  onClose: () => void;
  onSaved: (card: GiftCard) => void;
}

const PRESET_VALUES = [5000, 10000, 20000, 50000]; // R$ 50, 100, 200, 500

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function formatReason(reason: string): string {
  const map: Record<string, string> = {
    purchase: "Compra",
    refund: "Estorno",
    admin_adjustment: "Ajuste admin",
  };
  return map[reason] || reason;
}

export function DrawerGiftCard({ giftCard, csrfToken, onClose, onSaved }: Props) {
  const isEdit = giftCard !== null;

  // Create mode state
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customValue, setCustomValue] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [useCustomCode, setUseCustomCode] = useState(false);

  // Shared state
  const [note, setNote] = useState(giftCard?.note || "");
  const [active, setActive] = useState(giftCard?.active !== false);
  const [expiresAt, setExpiresAt] = useState(
    giftCard?.expiresAt ? giftCard.expiresAt.slice(0, 16) : ""
  );

  // Transaction history (edit mode)
  const [transactions, setTransactions] = useState<GiftCardTransaction[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [txnsLoaded, setTxnsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "transactions">("details");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadTransactions = async () => {
    if (!giftCard || txnsLoaded) return;
    setLoadingTxns(true);
    try {
      const res = await getGiftCardTransactionsAdmin(giftCard.id);
      setTransactions(res.transactions);
      setTxnsLoaded(true);
    } catch {
      // ignore
    } finally {
      setLoadingTxns(false);
    }
  };

  const handleTabChange = (tab: "details" | "transactions") => {
    setActiveTab(tab);
    if (tab === "transactions") loadTransactions();
  };

  const getBalanceCents = (): number => {
    if (selectedPreset !== null) return selectedPreset;
    const val = parseFloat(customValue.replace(",", "."));
    if (!isNaN(val) && val > 0) return Math.round(val * 100);
    return 0;
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      if (isEdit && giftCard) {
        const res = await updateGiftCardAdmin(
          giftCard.id,
          { active, note, expiresAt: expiresAt || null },
          csrfToken
        );
        onSaved(res.giftCard);
      } else {
        const balanceCents = getBalanceCents();
        if (balanceCents <= 0) {
          setError("Informe o valor do gift card.");
          setSaving(false);
          return;
        }
        const payload: CreateGiftCardAdminPayload = {
          initialBalanceCents: balanceCents,
          active,
          note,
          expiresAt: expiresAt || null,
        };
        if (useCustomCode && customCode.trim().length >= 3) {
          payload.code = customCode.trim().toUpperCase();
        }
        const res = await createGiftCardAdmin(payload, csrfToken);
        onSaved(res.giftCard);
      }
      onClose();
    } catch (err: unknown) {
      setError((err as Error)?.message || "Erro ao salvar gift card.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={isEdit ? "Editar Gift Card" : "Novo Gift Card"}
      subtitle={isEdit ? giftCard!.code : "Criar novo gift card"}
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      disableSave={saving}
    >
      {isEdit && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => handleTabChange("details")}
            style={{
              flex: 1,
              padding: "8px 0",
              background: activeTab === "details" ? "#111" : "transparent",
              color: activeTab === "details" ? "#fff" : "#666",
              border: "1px solid #ddd",
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: 1.5,
            }}
          >
            DETALHES
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("transactions")}
            style={{
              flex: 1,
              padding: "8px 0",
              background: activeTab === "transactions" ? "#111" : "transparent",
              color: activeTab === "transactions" ? "#fff" : "#666",
              border: "1px solid #ddd",
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: 1.5,
            }}
          >
            TRANSAÇÕES
          </button>
        </div>
      )}

      {activeTab === "transactions" && isEdit ? (
        <div>
          {loadingTxns && <p style={{ color: "#999", fontSize: 13 }}>Carregando…</p>}
          {!loadingTxns && transactions.length === 0 && (
            <p style={{ color: "#999", fontSize: 13 }}>Nenhuma transação registrada.</p>
          )}
          {transactions.map((txn) => (
            <div
              key={txn.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid #f0f0f0",
                fontSize: 13,
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{formatReason(txn.reason)}</div>
                <div style={{ color: "#999", fontSize: 11, marginTop: 2 }}>{formatDate(txn.createdAt)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: txn.deltaCents < 0 ? "#c0392b" : "#27ae60", fontWeight: 600 }}>
                  {txn.deltaCents < 0 ? "-" : "+"}{formatCents(Math.abs(txn.deltaCents))}
                </div>
                <div style={{ color: "#999", fontSize: 11 }}>Saldo: {formatCents(txn.balanceAfterCents)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.stack}>
          {/* Edit mode: balance display */}
          {isEdit && giftCard && (
            <div
              style={{
                background: "#f8f8f6",
                borderRadius: 6,
                padding: "16px 20px",
                marginBottom: 4,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: 1.5, color: "#aaa", marginBottom: 8 }}>SALDO ATUAL</div>
              <div style={{ fontSize: 28, fontFamily: "Georgia, serif", color: "#111" }}>
                {formatCents(giftCard.balanceCents)}
              </div>
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    height: 4,
                    background: "#e8e8e8",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.round((giftCard.balanceCents / giftCard.initialBalanceCents) * 100)}%`,
                      background: "#111",
                      borderRadius: 2,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "#aaa" }}>
                  <span>R$ 0</span>
                  <span>Valor inicial: {formatCents(giftCard.initialBalanceCents)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Create mode: value selection */}
          {!isEdit && (
            <>
              <div>
                <label style={{ fontSize: 11, letterSpacing: 1.5, color: "#555", display: "block", marginBottom: 8 }}>
                  VALOR
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {PRESET_VALUES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => { setSelectedPreset(v); setCustomValue(""); }}
                      style={{
                        padding: "8px 16px",
                        border: selectedPreset === v ? "2px solid #111" : "1px solid #ddd",
                        background: selectedPreset === v ? "#111" : "transparent",
                        color: selectedPreset === v ? "#fff" : "#111",
                        cursor: "pointer",
                        fontSize: 13,
                        borderRadius: 2,
                      }}
                    >
                      {formatCents(v)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={styles.input} style={{ display: "block" }}>
                  <span style={{ fontSize: 11, letterSpacing: 1.5, color: "#555" }}>VALOR PERSONALIZADO (R$)</span>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="Ex: 150,00"
                    value={customValue}
                    onChange={(e) => { setCustomValue(e.target.value); setSelectedPreset(null); }}
                  />
                </label>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={useCustomCode} onChange={(e) => setUseCustomCode(e.target.checked)} />
                  Usar código personalizado
                </label>
                {useCustomCode && (
                  <input
                    className={styles.input}
                    style={{ marginTop: 8 }}
                    type="text"
                    placeholder="Ex: GC-PRESENTE-2025"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    maxLength={40}
                  />
                )}
                {!useCustomCode && (
                  <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                    Código será gerado automaticamente no formato GC-XXXX-XXXX-XXXX
                  </p>
                )}
              </div>
            </>
          )}

          {/* Shared fields */}
          <div>
            <label style={{ fontSize: 11, letterSpacing: 1.5, color: "#555", display: "block", marginBottom: 4 }}>
              NOTA INTERNA
            </label>
            <input
              className={styles.input}
              type="text"
              placeholder="Ex: Presente para cliente VIP"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, letterSpacing: 1.5, color: "#555", display: "block", marginBottom: 4 }}>
              EXPIRAÇÃO (OPCIONAL)
            </label>
            <input
              className={styles.input}
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Gift card ativo
            </label>
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
    </Drawer>
  );
}
