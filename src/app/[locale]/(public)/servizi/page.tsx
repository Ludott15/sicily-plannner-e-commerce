import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "@/lib/i18n/navigation";
import { canonicalFor } from "@/lib/seo";

// Hub "Organizza il viaggio": le verticali dei servizi, raggruppate. Ogni card porta alla pagina della
// verticale. Le prenotazioni si fanno sul sito del partner; la nota di trasparenza è in fondo.

type ServiceCard = { href: string; title: string; text: string };
type ServiceGroup = { id: string; title: string; cards: ServiceCard[] };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Services" });
  return {
    title: t("title"),
    description: t("intro"),
    alternates: canonicalFor(locale, "/servizi"),
  };
}

export default async function ServicesHubPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tVert] = await Promise.all([getTranslations("Services"), getTranslations("Verticals")]);

  const groups: ServiceGroup[] = [
    {
      id: "stay",
      title: t("groupStay"),
      cards: [{ href: "/dove-dormire", title: t("lodgingTitle"), text: t("lodgingText") }],
    },
    {
      id: "move",
      title: t("groupMove"),
      cards: [
        { href: "/noleggio-auto", title: t("carTitle"), text: t("carText") },
        { href: "/traghetti", title: t("ferryTitle"), text: t("ferryText") },
        { href: "/treni-e-bus", title: t("trainTitle"), text: t("trainText") },
        { href: "/transfer", title: t("transferTitle"), text: t("transferText") },
        { href: "/barche", title: t("boatTitle"), text: t("boatText") },
      ],
    },
    {
      id: "see",
      title: t("groupSee"),
      cards: [
        { href: "/attivita", title: t("activitiesTitle"), text: t("activitiesText") },
        { href: "/musei-e-biglietti", title: t("ticketsTitle"), text: t("ticketsText") },
      ],
    },
    {
      id: "before",
      title: t("groupBefore"),
      cards: [
        { href: "/voli", title: t("flightsTitle"), text: t("flightsText") },
        { href: "/assicurazione-viaggio", title: t("insuranceTitle"), text: t("insuranceText") },
        { href: "/esim", title: t("esimTitle"), text: t("esimText") },
        { href: "/deposito-bagagli", title: t("luggageTitle"), text: t("luggageText") },
      ],
    },
  ];

  return (
    <PageContainer width="work">
      <PageHeader
        title={t("title")}
        subtitle={t("intro")}
        breadcrumb={[{ label: tVert("servicesCrumb"), href: "/servizi" }]}
        breadcrumbLabel={tVert("servicesLabel")}
      />

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`services-${group.id}`} className="flex flex-col gap-4">
          <h2 id={`services-${group.id}`} className="text-heading-2">
            {group.title}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.cards.map((card) => (
              <li key={card.href}>
                <Link
                  href={card.href}
                  className="flex h-full flex-col gap-2 rounded-lg border border-card-edge bg-calce-raised p-5 shadow-card hover:border-lava-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="text-heading-3">{card.title}</span>
                  <span className="text-body text-lava-muted">{card.text}</span>
                  <span className="mt-auto pt-2 text-body-s font-semibold">{t("open")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-caption text-lava-muted">
        {tVert.rich("transparency", {
          affiliates: (chunks) => (
            <Link href="/affiliazioni" className="underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </PageContainer>
  );
}
