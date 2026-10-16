import { getTranslations, setRequestLocale } from "next-intl/server";
import { SupplierForm } from "@/components/admin/supplier-form";
import type { SupplierFormValues } from "@/lib/shop/form-values";
import { listSuppliersAdmin, saveSupplier } from "@/server/shop/suppliers.admin";

// Fornitori (passo 7.1): chi spedisce i prodotti al cliente. Solo admin (il layout risponde 404 agli altri).
// Ogni salvataggio scrive admin_audit_log dal codice server.
export default async function SuppliersAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, rows] = await Promise.all([getTranslations("Admin.shop"), listSuppliersAdmin()]);

  const empty: SupplierFormValues = {
    id: null,
    name: "",
    kind: "manual",
    contactEmail: "",
    portalUrl: null,
    adapterKey: null,
    notes: null,
    isActive: true,
  };

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="is-display text-heading-1">{t("suppliersTitle")}</h1>
        <p className="max-w-2xl text-body text-lava-muted">{t("suppliersIntro")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="is-display text-heading-2">{t("newSupplier")}</h2>
        <SupplierForm action={saveSupplier} values={empty} />
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-10">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-3">
              <h2 className="is-display text-heading-2">{row.name}</h2>
              <SupplierForm action={saveSupplier} values={row} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
