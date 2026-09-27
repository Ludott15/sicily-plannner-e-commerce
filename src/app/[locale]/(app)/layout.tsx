import { requireUser } from "@/server/auth";

// Tutte le pagine del gruppo (app) richiedono il login.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
