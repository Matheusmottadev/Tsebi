import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/account/LoginForm";
import { getMe } from "@/services/auth";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta Tsebi.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/login",
  },
};

export default async function LoginPage() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") || undefined;

  try {
    const user = await getMe({ cookie, cache: "no-store" });
    if (user) {
      redirect("/account");
    }
  } catch {}

  return (
    <main className="t-login-main">
      <div className="t-login-container">
        <div className="login-wrapper">
          <div className="login-layout">
            <section className="account-benefits auth-card">
              <h2>Tenha uma conta Tsebi</h2>
              <ul className="benefits-list">
                <li>
                  <strong>Acompanhe seus pedidos</strong>
                  <span>Visualize o status e o historico de compras em um so lugar.</span>
                </li>
                <li>
                  <strong>Checkout mais rápido</strong>
                  <span>Seus dados ficam salvos para futuras compras.</span>
                </li>
                <li>
                  <strong>Lista de desejos</strong>
                  <span>Salve suas Peças favoritas para comprar depois.</span>
                </li>
                <li>
                  <strong>Atendimento prioritario</strong>
                  <span>Acesso a suporte e servicos exclusivos da Tsebi.</span>
                </li>
              </ul>
            </section>

            <section className="login-form">
              <LoginForm />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

