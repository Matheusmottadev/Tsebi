import type { ReactNode } from "react";
import { BodyClassName } from "@/components/BodyClassName";
import "../../styles/legacy/account.css";

type LoginLayoutProps = {
  children: ReactNode;
};

export default function LoginLayout({ children }: LoginLayoutProps) {
  return (
    <>
      <BodyClassName className="login-page" />
      {children}
    </>
  );
}
