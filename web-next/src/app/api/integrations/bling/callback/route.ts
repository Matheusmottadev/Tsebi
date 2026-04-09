import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http";
import { studioAuthMe } from "@/services/admin";
import { trocarCodigoBlingPorToken } from "../../../../../../../lib/bling";

function renderHtmlPage(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; padding: 32px; background: #0f0f10; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .card { max-width: 760px; margin: 0 auto; background: #17181b; border: 1px solid #27272a; border-radius: 16px; padding: 28px; }
      h1 { margin: 0 0 8px; font-size: 24px; font-weight: 600; }
      p { color: #b4b4b8; line-height: 1.6; }
      pre { white-space: pre-wrap; word-break: break-word; background: #0f1012; color: #e4e4e7; border: 1px solid #27272a; border-radius: 12px; padding: 16px; font-size: 12px; line-height: 1.6; }
      .success { color: #8ce0a0; }
      .error { color: #f0a6a6; }
      .muted { color: #8b8b91; font-size: 12px; }
      a { color: #c4d7ff; }
    </style>
  </head>
  <body>
    <div class="card">
      ${body}
    </div>
  </body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

async function assertAdminCallbackSession(request: NextRequest): Promise<null | NextResponse> {
  const cookie = request.headers.get("cookie") || undefined;

  try {
    const me = await studioAuthMe({ cookie, cache: "no-store" });
    if (!me.authenticated || !me.admin) {
      return renderHtmlPage(
        "Login necessário",
        `<h1>Login necessário</h1><p>Abra esta URL estando logado no admin da Tsebi para concluir a conexão com o Bling.</p>`,
        401
      );
    }
    return null;
  } catch (error) {
    if (error instanceof HttpError) {
      return renderHtmlPage(
        "Login necessário",
        `<h1>Login necessário</h1><p>Abra esta URL estando logado no admin da Tsebi para concluir a conexão com o Bling.</p>`,
        401
      );
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const denied = await assertAdminCallbackSession(request);
  if (denied) return denied;

  const error = String(request.nextUrl.searchParams.get("error") || "").trim();
  const code = String(request.nextUrl.searchParams.get("code") || "").trim();

  if (error) {
    return renderHtmlPage(
      "Falha na autorização",
      `<h1 class="error">Falha na autorização</h1><p>O Bling retornou o erro <strong>${error}</strong>. Volte ao aplicativo do Bling e tente novamente.</p>`,
      400
    );
  }

  if (!code) {
    return renderHtmlPage(
      "Código ausente",
      `<h1 class="error">Código ausente</h1><p>A callback foi aberta sem o <code>authorization_code</code> do Bling.</p>`,
      400
    );
  }

  try {
    const redirectUri = `${request.nextUrl.origin}/api/integrations/bling/callback`;
    const tokens = await trocarCodigoBlingPorToken(code, redirectUri);

    const envSnippet = [
      `BLING_ACCESS_TOKEN=${tokens.access_token}`,
      `BLING_REFRESH_TOKEN=${tokens.refresh_token || ""}`,
    ].join("\n");

    return renderHtmlPage(
      "Bling conectado",
      `<h1 class="success">Bling conectado com sucesso</h1>
<p>A troca do código OAuth foi concluída. Copie os tokens abaixo e atualize as variáveis do ambiente publicado.</p>
<pre>${envSnippet}</pre>
<p class="muted">Esses tokens foram carregados na memória do processo atual, mas você ainda deve salvar as envs em produção para a integração continuar funcionando após novo deploy.</p>
<p><a href="/admin/nfse/configuracoes">Abrir configurações de NFS-e</a></p>`
    );
  } catch (err) {
    return renderHtmlPage(
      "Erro ao conectar Bling",
      `<h1 class="error">Erro ao conectar Bling</h1><p>${String(err instanceof Error ? err.message : err)}</p>`,
      500
    );
  }
}
