import type { ReactNode } from "react";
import { BodyClassName } from "@/components/BodyClassName";
import "../../../styles/legacy/account.css";
import "../../../styles/legacy/conta.css";
import "../../../styles/legacy/order-tracking.css";

type StoreAccountLayoutProps = {
  children: ReactNode;
};

export default function StoreAccountLayout({ children }: StoreAccountLayoutProps) {
  return <BodyClassName className="conta-page">{children}</BodyClassName>;
}
