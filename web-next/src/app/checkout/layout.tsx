import type { Metadata } from "next";
import "../../styles/legacy/checkout.css";

type CheckoutLayoutProps = {
  children: React.ReactNode;
};

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function CheckoutLayout({ children }: CheckoutLayoutProps) {
  return children;
}
