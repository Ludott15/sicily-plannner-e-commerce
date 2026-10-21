"use client";

import { usePathname, Link } from "@/lib/i18n/navigation";
import { ActionMenu, type ActionMenuItem, type MenuIcon } from "@/components/layout/action-menu";
import { isNavCurrent } from "@/components/layout/nav-links";

// Navigazione principale dell'intestazione da md in su: Itinerari, Attività, Guide, il menu Servizi,
// Shop. Le etichette arrivano già tradotte dal server; qui si calcola solo la voce attiva
// (aria-current="page" sulla voce, sottolineatura anche sul menu Servizi se una sua voce è attiva).
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
  const servicesItems: ActionMenuItem[] = services.map((item) => ({
    kind: "link",
    href: item.href,
    label: item.label,
    icon: item.icon,
    current: isNavCurrent(pathname, item.href),
  }));
  const servicesActive = services.some((item) => isNavCurrent(pathname, item.href));

  return (
    <nav aria-label={mainLabel} className="hidden items-center gap-6 text-[15px] font-medium md:flex">
      {primary.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={LINK_CLASS}
          aria-current={isNavCurrent(pathname, item.href) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
      <ActionMenu variant="text" text={servicesLabel} items={servicesItems} align="start" active={servicesActive} />
      <Link
        href={shop.href}
        className={LINK_CLASS}
        aria-current={isNavCurrent(pathname, shop.href) ? "page" : undefined}
      >
        {shop.label}
      </Link>
    </nav>
  );
}
