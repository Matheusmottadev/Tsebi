"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./OrderTracker.module.css";

export type OrderStatus =
  | "recebido"
  | "confirmado"
  | "enviado"
  | "saiu_para_entregar"
  | "entregue"
  | "cancelado"
  | "falhou";

export interface OrderTrackerProps {
  status: OrderStatus;
}

const STEPS = [
  { id: "recebido",           label: "RECEBIDO"       },
  { id: "confirmado",         label: "CONFIRMADO"     },
  { id: "enviado",            label: "ENVIADO"        },
  { id: "saiu_para_entregar", label: "SAIU P/ ENTREGA"},
  { id: "entregue",           label: "ENTREGUE"       },
] as const;

const STATUS_IDX: Record<string, number> = {
  recebido: 0, confirmado: 1, enviado: 2, saiu_para_entregar: 3, entregue: 4,
};

const STATUS_MESSAGES: Record<OrderStatus, string> = {
  recebido:           "Aguardando confirmação do pedido",
  confirmado:         "Pedido confirmado — preparando envio",
  enviado:            "Pedido enviado — a caminho",
  saiu_para_entregar: "Saiu para entrega — chegando em breve",
  entregue:           "Pedido entregue",
  cancelado:          "Pedido cancelado",
  falhou:             "Falha no processamento do pedido",
};

type DotState = "done" | "active" | "future" | "error" | "errorActive";
type LineType  = "done" | "active" | "future" | "cancel";

type LineGeom = { left: number; width: number; top: number };

function getDotState(i: number, status: OrderStatus, currentIdx: number): DotState {
  if (status === "cancelado") return i === 4 ? "errorActive" : "error";
  if (status === "falhou")    return i === 0 ? "errorActive" : "future";
  if (i < currentIdx)  return "done";
  if (i === currentIdx) return "active";
  return "future";
}

function getLineType(i: number, status: OrderStatus, currentIdx: number): LineType {
  if (status === "cancelado") return "cancel";
  if (status === "falhou")    return "future";
  if (i < currentIdx)  return "done";
  if (i === currentIdx && currentIdx < 4) return "active";
  return "future";
}

const DOT_CLASS: Record<DotState, string> = {
  done:        styles.dotDone,
  active:      styles.dotActive,
  future:      styles.dotFuture,
  error:       styles.dotError,
  errorActive: styles.dotErrorActive,
};

const LINE_CLASS: Record<LineType, string> = {
  done:   styles.lineDone,
  active: styles.lineActive,
  future: styles.lineFuture,
  cancel: styles.lineCancel,
};

export function OrderTracker({ status }: OrderTrackerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotRefs      = useRef<(HTMLDivElement | null)[]>([]);
  const [lines, setLines] = useState<LineGeom[]>([]);

  const currentIdx = STATUS_IDX[status] ?? 0;

  const recalc = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const next: LineGeom[] = [];

    for (let i = 0; i < STEPS.length - 1; i++) {
      const a = dotRefs.current[i];
      const b = dotRefs.current[i + 1];
      if (!a || !b) continue;
      const aR = a.getBoundingClientRect();
      const bR = b.getBoundingClientRect();
      const centerY = (aR.top + aR.bottom) / 2 - cRect.top;
      const left    = aR.right - cRect.left + 8;
      const width   = bR.left  - aR.right   - 16;
      next.push({ left, width: Math.max(0, width), top: centerY - 1 });
    }

    setLines(next);
  }, []);

  useEffect(() => {
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [recalc]);

  const isError = status === "cancelado" || status === "falhou";

  return (
    <div ref={containerRef} className={styles.wrap}>
      {/* Dots + labels */}
      <div className={styles.steps}>
        {STEPS.map((step, i) => {
          const dotState = getDotState(i, status, currentIdx);

          let labelText: string;
          let labelCls:  string;

          if (status === "cancelado") {
            labelText = i === 4 ? "CANCELADO" : "";
            labelCls  = i === 4 ? styles.labelError : "";
          } else if (status === "falhou") {
            labelText = i === 0 ? "FALHOU" : step.label;
            labelCls  = i === 0 ? styles.labelError : styles.labelFuture;
          } else {
            labelText = step.label;
            labelCls  = i <= currentIdx ? styles.labelDone : styles.labelFuture;
          }

          return (
            <div key={step.id} className={styles.step}>
              <div
                ref={(el) => { dotRefs.current[i] = el; }}
                className={`${styles.dot} ${DOT_CLASS[dotState]}`}
              />
              <span className={`${styles.label} ${labelCls}`}>{labelText}</span>
            </div>
          );
        })}
      </div>

      {/* Lines — absolutely positioned after measuring dots */}
      {lines.map((geom, i) => {
        const type = getLineType(i, status, currentIdx);
        return (
          <div
            key={i}
            className={`${styles.line} ${LINE_CLASS[type]}`}
            style={{ left: geom.left, width: geom.width, top: geom.top }}
          >
            {type === "active" && <div className={styles.lineLoader} />}
          </div>
        );
      })}

      {/* Status message */}
      <p className={isError ? styles.messageError : styles.message}>
        {STATUS_MESSAGES[status]}
      </p>
    </div>
  );
}
