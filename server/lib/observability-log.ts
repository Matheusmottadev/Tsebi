export {};

type LogLevel = "info" | "warn" | "error";

type LogPayload = {
  level: LogLevel;
  event: string;
  message?: string;
  route?: string;
  method?: string;
  requestId?: string;
  [key: string]: unknown;
};

type LogRecord = Record<string, unknown>;

type ExternalTarget =
  | {
      kind: "datadog";
      endpoint: string;
      headers: Record<string, string>;
      service: string;
      source: string;
      host: string;
      tags: string[];
    }
  | {
      kind: "axiom";
      endpoint: string;
      headers: Record<string, string>;
    }
  | {
      kind: "otlp";
      endpoint: string;
      headers: Record<string, string>;
      service: string;
    };

let cachedTarget: ExternalTarget | null | undefined;

function sanitizeValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 400 ? `${trimmed.slice(0, 397)}...` : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item)).slice(0, 20);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: typeof value.stack === "string" ? value.stack.split("\n").slice(0, 5).join("\n") : undefined,
    };
  }
  if (typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      next[key] = sanitizeValue(entry);
    }
    return next;
  }
  return String(value);
}

function writeConsole(level: LogLevel, record: LogRecord): void {
  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

function readEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

function parseHeaderList(rawValue: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const chunk of rawValue.split(",")) {
    const entry = String(chunk || "").trim();
    if (!entry) continue;
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!key || !value) continue;
    headers[key] = value;
  }
  return headers;
}

function getExternalTarget(): ExternalTarget | null {
  if (cachedTarget !== undefined) return cachedTarget;

  const datadogApiKey = readEnv("DATADOG_API_KEY");
  if (datadogApiKey) {
    const site = readEnv("DATADOG_SITE") || "datadoghq.com";
    const endpoint = `https://http-intake.logs.${site}/api/v2/logs`;
    cachedTarget = {
      kind: "datadog",
      endpoint,
      headers: {
        "content-type": "application/json",
        "dd-api-key": datadogApiKey,
      },
      service: readEnv("OBS_SERVICE_NAME") || readEnv("DATADOG_SERVICE") || "tsebi-api",
      source: readEnv("DATADOG_SOURCE") || "nodejs",
      host: readEnv("DATADOG_HOST") || readEnv("VERCEL_URL") || readEnv("HOSTNAME") || "unknown",
      tags: [readEnv("NODE_ENV"), "component:repairs"].filter(Boolean),
    };
    return cachedTarget;
  }

  const axiomToken = readEnv("AXIOM_TOKEN");
  const axiomDataset = readEnv("AXIOM_DATASET");
  if (axiomToken && axiomDataset) {
    cachedTarget = {
      kind: "axiom",
      endpoint: `https://api.axiom.co/v1/datasets/${encodeURIComponent(axiomDataset)}/ingest`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${axiomToken}`,
        "x-axiom-org-id": readEnv("AXIOM_ORG_ID") || "",
      },
    };
    return cachedTarget;
  }

  const otlpEndpoint = readEnv("OTEL_LOGS_HTTP_ENDPOINT");
  if (otlpEndpoint) {
    cachedTarget = {
      kind: "otlp",
      endpoint: otlpEndpoint,
      headers: {
        "content-type": "application/json",
        ...parseHeaderList(readEnv("OTEL_LOGS_HTTP_HEADERS")),
      },
      service: readEnv("OBS_SERVICE_NAME") || "tsebi-api",
    };
    return cachedTarget;
  }

  cachedTarget = null;
  return cachedTarget;
}

function buildRecord(level: LogLevel, payload: Omit<LogPayload, "level">): LogRecord {
  return sanitizeValue({
    timestamp: new Date().toISOString(),
    component: "repairs",
    level,
    ...payload,
  }) as LogRecord;
}

function toDatadogPayload(record: LogRecord, target: Extract<ExternalTarget, { kind: "datadog" }>): Record<string, unknown> {
  return {
    ...record,
    service: target.service,
    source: target.source,
    host: target.host,
    ddtags: target.tags.join(","),
  };
}

function toAxiomPayload(record: LogRecord): Record<string, unknown>[] {
  return [record];
}

function toOtlpPayload(record: LogRecord, target: Extract<ExternalTarget, { kind: "otlp" }>) {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: target.service } },
            { key: "component", value: { stringValue: "repairs" } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: "tsebi.repairs" },
            logRecords: [
              {
                timeUnixNano: `${Date.now()}000000`,
                severityText: String(record.level || "info").toUpperCase(),
                body: { stringValue: JSON.stringify(record) },
                attributes: Object.entries(record)
                  .filter(([key]) => key !== "level")
                  .map(([key, value]) => ({
                    key,
                    value: { stringValue: typeof value === "string" ? value : JSON.stringify(value) },
                  })),
              },
            ],
          },
        ],
      },
    ],
  };
}

async function sendExternalLog(record: LogRecord): Promise<void> {
  const target = getExternalTarget();
  if (!target) return;

  let body: string;
  if (target.kind === "datadog") {
    body = JSON.stringify(toDatadogPayload(record, target));
  } else if (target.kind === "axiom") {
    const headers = { ...target.headers };
    if (!headers["x-axiom-org-id"]) delete headers["x-axiom-org-id"];
    target.headers = headers;
    body = JSON.stringify(toAxiomPayload(record));
  } else {
    body = JSON.stringify(toOtlpPayload(record, target));
  }

  const response = await fetch(target.endpoint, {
    method: "POST",
    headers: target.headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`OBS_EXPORT_${target.kind.toUpperCase()}_${response.status}`);
  }
}

function writeLog(level: LogLevel, payload: Omit<LogPayload, "level">): void {
  const record = buildRecord(level, payload);
  writeConsole(level, record);

  void sendExternalLog(record).catch((error) => {
    writeConsole("warn", buildRecord("warn", {
      event: "repair_observability_export_failed",
      message: "Falha ao exportar evento de observabilidade.",
      exportTarget: getExternalTarget()?.kind || "none",
      exportError: error instanceof Error ? error : new Error(String(error || "OBS_EXPORT_FAILED")),
      originalEvent: record.event,
    }));
  });
}

function buildRequestLogContext(req: any, extra?: Record<string, unknown>) {
  return {
    route: String(req?.originalUrl || req?.baseUrl || req?.url || "").trim(),
    method: String(req?.method || "").trim().toUpperCase(),
    requestId:
      String(req?.headers?.["x-request-id"] || req?.headers?.["x-vercel-id"] || req?.id || "").trim() || undefined,
    ...extra,
  };
}

function toErrorMeta(error: any) {
  return {
    errorCode: String(error?.code || error?.message || "UNKNOWN_ERROR").trim(),
    errorStatus: Number(error?.status || 500) || 500,
    error: error instanceof Error ? error : new Error(String(error?.message || error || "UNKNOWN_ERROR")),
  };
}

module.exports = {
  logServerEvent: writeLog,
  buildRequestLogContext,
  toErrorMeta,
};
