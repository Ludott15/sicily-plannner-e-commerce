import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthorizationForm } from "@/components/admin/media/authorization-form";
import { Link } from "@/lib/i18n/navigation";
import { deleteAuthorization, saveAuthorization } from "@/server/media/admin-actions.admin";
import { listAuthorizations } from "@/server/media/admin-queries.admin";

// Autorizzazioni per le immagini di beni culturali in consegna a enti pubblici. Un'immagine
// con "bene culturale" spuntato è bloccata senza un'autorizzazione valida (valid_until non
// passato): scaduta l'autorizzazione, la pagina passa al ripiego.
export default async function AdminAuthorizationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, rows] = await Promise.all([getTranslations("Admin"), listAuthorizations()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="is-display text-heading-1">{t("authorizationsTitle")}</h1>
        <Link href="/admin/media" className="text-body">
          {t("backToList")}
        </Link>
      </div>
      <p className="max-w-2xl text-body text-lava-muted">{t("authorizationsIntro")}</p>
      <section aria-labelledby="nuova-autorizzazione" className="flex flex-col gap-4">
        <h2 id="nuova-autorizzazione" className="is-display text-heading-2">
          {t("authorizationNew")}
        </h2>
        <AuthorizationForm
          action={saveAuthorization}
          values={{ authority: "", reference: "", issuedOn: today, validUntil: "", scope: "", documentUrl: null }}
        />
      </section>
      {rows.map((a) => (
        <section key={a.id} aria-label={`${a.authority} ${a.reference}`} className="flex flex-col gap-2">
          <p className="text-body-s text-lava-muted">
            {t("authorizationMediaCount", { count: a.mediaCount })}
            {a.validUntil < today && <span className="font-semibold text-danger"> · {t("authorizationExpired")}</span>}
          </p>
          <AuthorizationForm action={saveAuthorization} remove={deleteAuthorization} values={a} />
        </section>
      ))}
    </section>
  );
}
