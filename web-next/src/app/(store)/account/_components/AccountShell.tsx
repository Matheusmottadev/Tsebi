"use client";

import { useEffect, useState } from "react";
import type { PublicUser } from "@/types";
import { AccountNav } from "./AccountNav";
import { AccountOverview } from "./AccountOverview";
import { ProfileTab } from "./ProfileTab";
import { OrdersTab } from "./OrdersTab";
import { AppointmentsTab } from "./AppointmentsTab";
import { WishlistTab } from "./WishlistTab";
import { RecommendationsTab } from "./RecommendationsTab";
import { RepairsTab } from "./RepairsTab";
import styles from "../account.module.css";

export const ACCOUNT_TABS = [
  "overview",
  "profile",
  "orders",
  "appointments",
  "wishlist",
  "recommendations",
  "repairs",
] as const;

export type AccountTab = (typeof ACCOUNT_TABS)[number];

function normalizeTab(hash: string): AccountTab {
  const key = hash.replace(/^#/, "").toLowerCase().trim() as AccountTab;
  return ACCOUNT_TABS.includes(key) ? key : "overview";
}

export function AccountShell({ user }: { user: PublicUser }) {
  const [activeTab, setActiveTab] = useState<AccountTab>("overview");

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
      </div>
    </>
  );
}
