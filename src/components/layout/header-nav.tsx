"use client";

import { usePathname, Link } from "@/lib/i18n/navigation";
import { ActionMenu, type ActionMenuItem, type MenuIcon } from "@/components/layout/action-menu";
import { isNavCurrent } from "@/components/layout/nav-links";

// Navigazione principale dell'intestazione da md in su: Itinerari, Attività, Guide, il menu Servizi.
// Shop è una voce a sé solo da lg; fra md e lg sta nel menu Servizi, così le voci non si sovrappongono.
// Le etichette arrivano già tradotte dal server; qui si calcola solo la voce attiva
// (aria-current="page" sulla voce; aria-current="true" sul trigger Servizi se una sua voce è attiva).
export type HeaderNavLink = { href: string; label: string; icon?: MenuIcon };

type Props = {
  mainLabel: string;
  primary: readonly HeaderNavLink[];
  servicesLabel: string;
  services: readonly HeaderNavLink[];
  shop: HeaderNavLink;
};

const LINK_CLASS =
  "rounded-md text-lava no-underline hover:underline hover:underline-offset-[6px] aria-[current=page]:underline aria-[current=page]:underline-offset-[6px]";

export function HeaderNav({ mainLabel, primary, servicesLabel, services, shop }: Props) {
  const pathname = usePathname();
  const servicesItems: ActionMenuItem[] = [
    ...services.map((item): ActionMenuItem => ({
      kind: "link",
      href: item.href,
      label: item.label,
      icon: item.icon,
      current: isNavCurrent(pathname, item.href),
    })),
    // Shop nel menu solo sotto lg: da lg è già nella barra.
    { kind: "link", href: shop.href, label: shop.label, current: isNavCurrent(pathname, shop.href), className: "lg:hidden" },
  ];
  const servicesActive = services.some((item) => isNavCurrent(pathname, item.href));

  return (
    <nav aria-label={mainLabel} className="hidden items-center gap-5 font-medium md:flex lg:gap-6">
      {primary.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`${LINK_CLASS} text-body`}
          aria-current={isNavCurrent(pathname, item.href) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
      <ActionMenu variant="text" text={servicesLabel} items={servicesItems} align="start" active={servicesActive} />
      <Link
        href={shop.href}
        className={`${LINK_CLASS} hidden text-body lg:inline`}
        aria-current={isNavCurrent(pathname, shop.href) ? "page" : undefined}
      >
        {shop.label}
      </Link>
    </nav>
  );
}
