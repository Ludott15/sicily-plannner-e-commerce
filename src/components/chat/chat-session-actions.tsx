"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/design";
import { Dialog } from "@/components/ui/dialog";
import { useRouter } from "@/lib/i18n/navigation";
import { deleteChatSession, renameChatSession } from "@/server/chat/actions";

// Azioni di una conversazione salvata, dietro un menu "...": rinomina ed elimina. Le due azioni passano
// da un <dialog> e partono da onSubmit/onClick con startTransition (mai <form action>), così un errore
// non cancella quello che si è scritto. Eliminare toglie solo la conversazione: le modifiche già
// applicate al viaggio restano. Il menu si chiude con Esc o un clic fuori, e Esc riporta il focus
// sul pulsante "...".
export function ChatSessionActions({ sessionId, title }: { sessionId: string; title: string }) {
  const t = useTranslations("Chat.session");
  const router = useRouter();
  const inputId = useId();
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!menuOpen) return;
    const first = wrapRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = String(data.get("title") ?? "").trim();
    if (!next) {
      setError(t("error"));
      return;
    }
    data.set("sessionId", sessionId);
    data.set("title", next);
    setError(null);
    startTransition(async () => {
      const result = await renameChatSession(data);
      if (result.status === "ok") {
        setCurrentTitle(next);
        setRenameOpen(false);
        router.refresh();
        return;
      }
      setError(t("error"));
    });
  }

  function onDelete() {
    const data = new FormData();
    data.set("sessionId", sessionId);
    setError(null);
    startTransition(async () => {
      const result = await deleteChatSession(data);
      if (result.status === "ok") {
        router.push("/chat");
        router.refresh();
        return;
      }
      setError(t("error"));
    });
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        aria-label={t("menu")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => setMenuOpen((open) => !open)}
        className="px-2 text-lava-muted"
      >
        <Ellipsis size={20} strokeWidth={1.5} aria-hidden="true" />
      </Button>

      {menuOpen && (
        <ul id={menuId} role="menu" aria-label={t("menu")} className="is-chat-menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="is-chat-menu__item"
              onClick={() => {
                setMenuOpen(false);
                setRenameOpen(true);
              }}
            >
              <Pencil size={18} strokeWidth={1.5} aria-hidden="true" />
              {t("rename")}
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="is-chat-menu__item"
              onClick={() => {
                setMenuOpen(false);
                setDeleteOpen(true);
              }}
            >
              <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
              {t("delete")}
            </button>
          </li>
        </ul>
      )}

      <Dialog open={renameOpen} title={t("rename")} onClose={() => setRenameOpen(false)}>
        <form onSubmit={onRename} className="flex flex-col gap-4" aria-busy={pending}>
          <div className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-body-s font-semibold">
              {t("renameLabel")}
            </label>
            <input
              id={inputId}
              name="title"
              type="text"
              defaultValue={currentTitle}
              maxLength={120}
              required
              className="min-h-11 w-full rounded-md border-[1.5px] border-border-control bg-calce px-3 text-body text-lava focus-visible:outline-2 focus-visible:outline-focus"
            />
          </div>
          {error && (
            <p role="alert" className="text-body-s text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {t("save")}
            </Button>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={deleteOpen} title={t("deleteTitle")} description={t("deleteText")} onClose={() => setDeleteOpen(false)}>
        <div className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="text-body-s text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={pending} onClick={onDelete}>
              {t("confirmDelete")}
            </Button>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
