const BLING_BASE = "https://api.bling.com.br/Api/v3";
const BLING_TOKEN_URL = `${BLING_BASE}/oauth/token`;

let cachedToken: { access_token: string; expires_at: number } | null = null;

type BlingTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
};

function getBlingBasicAuthorization(): string {
  const clientId = String(process.env.BLING_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.BLING_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais do Bling não configuradas.");
  }

  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function buildTokenHeaders(): HeadersInit {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: getBlingBasicAuthorization(),
    "enable-jwt": "1",
  };
}

function cacheBlingToken(data: BlingTokenResponse): string {
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + Number(data.expires_in || 0) * 1000,
  };

  process.env.BLING_ACCESS_TOKEN = data.access_token;
  if (data.refresh_token) {
    process.env.BLING_REFRESH_TOKEN = data.refresh_token;
  }

  return data.access_token;
}

async function renovarTokenDoBling(refreshToken: string): Promise<string> {
  const res = await fetch(BLING_TOKEN_URL, {
    method: "POST",
    headers: buildTokenHeaders(),
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error("Falha ao renovar token do Bling");

  const data = (await res.json()) as BlingTokenResponse;
  return cacheBlingToken(data);
}

export async function trocarCodigoBlingPorToken(code: string, redirectUri: string): Promise<BlingTokenResponse> {
  const res = await fetch(BLING_TOKEN_URL, {
    method: "POST",
    headers: buildTokenHeaders(),
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data || typeof data.access_token !== "string") {
    const message =
      typeof data?.error_description === "string"
        ? data.error_description
        : typeof data?.message === "string"
          ? data.message
          : `Falha ao trocar o código do Bling (${res.status}).`;
    throw new Error(message);
  }

  const tokenData = data as unknown as BlingTokenResponse;
  cacheBlingToken(tokenData);
  return tokenData;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
    return cachedToken.access_token;
  }

  const refreshToken = String(process.env.BLING_REFRESH_TOKEN || "").trim();
  if (!refreshToken) {
    throw new Error("BLING_REFRESH_TOKEN não configurado.");
  }

  return renovarTokenDoBling(refreshToken);
}

async function blingFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();

  const res = await fetch(`${BLING_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "enable-jwt": "1",
      ...options.headers,
    },
  });

  if (res.status === 401) {
    cachedToken = null;
    const refreshToken = String(process.env.BLING_REFRESH_TOKEN || "").trim();
    const token2 = await renovarTokenDoBling(refreshToken);
    return fetch(`${BLING_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token2}`,
        "enable-jwt": "1",
        ...options.headers,
      },
    });
  }

  return res;
}

export async function emitirNFSeNoBling(payload: Record<string, unknown>) {
  const res = await blingFetch("/nfse", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || `Erro Bling: ${res.status}`);
  }

  return data;
}

export async function cancelarNFSeNoBling(blingId: string) {
  const res = await blingFetch(`/nfse/${blingId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Erro ao cancelar no Bling: ${res.status}`);
  return true;
}

export async function consultarNFSeNoBling(blingId: string) {
  const res = await blingFetch(`/nfse/${blingId}`);
  if (!res.ok) throw new Error(`Erro ao consultar no Bling: ${res.status}`);
  return res.json();
}
