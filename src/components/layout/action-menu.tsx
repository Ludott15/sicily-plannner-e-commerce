"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import { Bell, BookOpen, ChevronDown, CalendarDays, Compass, Copy, Link2, LogOut, Map as MapIcon, MessageCircle, Pencil, Plane, Plus, Printer, Receipt, Settings, Star, Trash2, Trophy, User, Users, BedDouble, Car, Ship } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

// Menu di azioni accessibile (brief 6.1). Tre aspetti: "more" (pulsante ⋯ delle pagine), "text" (voce
// del menu di navigazione, es. Esplora) e "avatar" (menu personale con iniziali o foto).
// Voci: link interno, azione-modulo verso un'azione server (es. Esci), azione lato client, separatore.
// Esc chiude e riporta il focus al pulsante; frecce, Home e Fine spostano il focus; Tab chiude.
// Le icone si scelgono per nome (MenuIcon): le icone React non attraversano il confine server/client.

const ICONS = {
  user: User,
  bell: Bell,
  trophy: Trophy,
  star: Star,
  settings: Settings,
  logout: LogOut,
  map: MapIcon,
  users: Users,
  printer: Printer,
  calendar: CalendarDays,
  copy: Copy,
  pencil: Pencil,
  trash: Trash2,
  plus: Plus,
  link: Link2,
  compass: Compass,
  plane: Plane,
  bed: BedDouble,
  car: Car,
  ship: Ship,
  message: MessageCircle,
  book: BookOpen,
  receipt: Receipt,
} as const;

export type MenuIcon = keyof typeof ICONS;

type ItemBase = { label: string; icon?: MenuIcon; danger?: boolean };

export type ActionMenuItem =
  | (ItemBase & { kind: "link"; href: string; current?: boolean; className?: string })
  | (ItemBase & { kind: "form"; action: (formData: FormData) => void | Promise<void>; fields?: Record<string, string> })
  | (ItemBase & { kind: "button"; onSelect: () => void; disabled?: boolean })
  | { kind: "separator" };

type MenuProps = { items: ActionMenuItem[]; align?: "start" | "end" };

export type ActionMenuProps =
  | ({ variant: "more"; label: string } & MenuProps)
  | ({ variant: "text"; text: string; active?: boolean } & MenuProps)
  | ({ variant: "avatar"; label: string; initials: string | null; avatarUrl?: string | null } & MenuProps);

const ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-body-s font-medium no-underline transition-colors hover:bg-calce-sunk focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-45";

export function ActionMenu(props: ActionMenuProps) {
  const { items, align = "end" } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const menuLabel = props.variant === "text" ? props.text : props.label;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Il primo elemento riceve il focus all'apertura.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [open]);

  function menuItems(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
  }

  function closeAndFocusTrigger() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const elements = menuItems();
    if (elements.length === 0) return;
    const current = elements.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        closeAndFocusTrigger();
        break;
      case "Tab":
        setOpen(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        elements[current < 0 ? 0 : (current + 1) % elements.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        elements[current <= 0 ? elements.length - 1 : current - 1]?.focus();
        break;
      case "Home":
        event.preventDefault();
        elements[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        elements[elements.length - 1]?.focus();
        break;
    }
  }

  function renderItem(item: ActionMenuItem, index: number) {
    if (item.kind === "separator") return <div key={`sep-${index}`} role="separator" className="my-1 h-px bg-divider" />;
    const Icon = item.icon ? ICONS[item.icon] : null;
    const tone = item.danger ? "text-danger" : "text-lava";
    const content = (
      <>
        {Icon && <Icon size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />}
        <span>{item.label}</span>
      </>
    );
    if (item.kind === "link") {
      return (
        <Link
          key={`${item.href}-${index}`}
          href={item.href}
          role="menuitem"
          aria-current={item.current ? "page" : undefined}
          className={cn(ITEM_CLASS, tone, item.className)}
          onClick={() => setOpen(false)}
        >
          {content}
        </Link>
      );
    }
    if (item.kind === "form") {
      return (
        <form key={`form-${index}`} action={item.action}>
          {Object.entries(item.fields ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button type="submit" role="menuitem" className={cn(ITEM_CLASS, tone)}>
            {content}
          </button>
        </form>
      );
    }
    return (
      <button
        key={`button-${index}`}
        type="button"
        role="menuitem"
        disabled={item.disabled}
        className={cn(ITEM_CLASS, tone)}
        onClick={() => {
          closeAndFocusTrigger();
          item.onSelect();
        }}
      >
        {content}
      </button>
    );
  }

  let trigger: ReactNode;
  if (props.variant === "text") {
    trigger = (
      <>
        <span>{props.text}</span>
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </>
    );
  } else if (props.variant === "avatar") {
    trigger = (
      <span className="grid size-9 place-items-center overflow-hidden rounded-pill bg-coccio-tint text-body-s font-semibold text-coccio-text">
        {props.avatarUrl ? (
          <Image src={props.avatarUrl} alt="" width={36} height={36} unoptimized className="size-9 object-cover" />
        ) : props.initials ? (
          <span aria-hidden="true">{props.initials}</span>
        ) : (
          <User size={20} strokeWidth={1.5} aria-hidden="true" />
        )}
      </span>
    );
  } else {
    trigger = <MoreGlyph />;
  }

  const triggerClass = cn(
    "inline-flex items-center justify-center gap-1 rounded-pill text-lava transition-colors hover:bg-calce-sunk focus-visible:outline-2 focus-visible:outline-focus",
    props.variant === "text" ? "min-h-11 px-3 text-body font-medium" : "size-11",
    props.variant === "text" && props.active && "underline underline-offset-[6px]",
  );

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={props.variant === "text" && props.active ? "true" : undefined}
        aria-controls={open ? menuId : undefined}
        aria-label={props.variant === "text" ? undefined : props.label}
        onClick={() => setOpen((current) => !current)}
        className={triggerClass}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "is-panel absolute top-full z-30 mt-2 flex min-w-56 flex-col gap-0.5 p-1.5",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map(renderItem)}
        </div>
      )}
    </div>
  );
}

// Pulsante ⋯: tre punti orizzontali, puramente decorativi (il nome è l'aria-label del pulsante).
function MoreGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
