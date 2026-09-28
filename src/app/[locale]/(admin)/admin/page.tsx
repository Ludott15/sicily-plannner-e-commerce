import { redirect } from "@/lib/i18n/navigation";

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/admin/attivita", locale });
}
