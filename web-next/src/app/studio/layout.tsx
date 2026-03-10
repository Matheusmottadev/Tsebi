import { redirect } from "next/navigation";

type StudioLayoutProps = {
  children: React.ReactNode;
};

export default function StudioLayout(_: StudioLayoutProps) {
  redirect("/admin");
}
