"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicUser } from "@/types";
import { logout } from "@/services/auth";
import { AccountNav } from "./AccountNav";
import { AccountOverview } from "./AccountOverview";
import { ProfileTab } from "./ProfileTab";
import { OrdersTab } from "./OrdersTab";
import { AppointmentsTab } from "./AppointmentsTab";
import { WishlistTab } from "./WishlistTab";
import { RecommendationsTab } from "./RecommendationsTab";
import { RepairsTab } from "./RepairsTab";
import { GiftCardsTab } from "./GiftCardsTab";
import styles from "../account.module.css";

export const ACCOUNT_TABS = [
  "overview",
  "profile",
  "orders",
  "appointments",
  "wishlist",
  "recommendations",
  "repairs",
  "gift_cards",
] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number];

function normalizeTab(hash: string): AccountTab {
  const key = hash.replace(/^#/, "").toLowerCase().trim() as AccountTab;
  return ACCOUNT_TABS.includes(key) ? key : "overview";
}

export function AccountShell({ user }: { user: PublicUser }) {
  const [activeTab, setActiveTab] = useState<AccountTab>("overview");
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const sync = () => setActiveTab(normalizeTab(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (tab: AccountTab) => {
    window.location.hash = tab;
    setActiveTab(tab);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      router.push("/login");
    }
  };

  return (
    <>
      <AccountNav activeTab={activeTab} onNavigate={navigate} />
      <div className={styles.content}>
        {activeTab === "overview" && <AccountOverview user={user} onNavigate={navigate} />}
        {activeTab === "profile" && <ProfileTab user={user} />}
        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "appointments" && <AppointmentsTab user={user} />}
        {activeTab === "wishlist" && <WishlistTab />}
        {activeTab === "recommendations" && <RecommendationsTab />}
        {activeTab === "repairs" && <RepairsTab user={user} />}
        {activeTab === "gift_cards" && <GiftCardsTab />}
      </div>
      <div className={styles.logoutRow}>
        <button
          type="button"
          className={styles.logoutBtn}
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "Saindo…" : "Sair da conta"}
        </button>
      </div>
    </>
  );
}
