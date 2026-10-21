"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { Button, buttonClass } from "@/components/design";
import { Dialog } from "@/components/ui/dialog";
import { useRouter } from "@/lib/i18n/navigation";
import { deleteChatSession, renameChatSession } from "@/server/chat/actions";

// Azioni di una conversazione salvata, dietro un menu "...": rinomina ed elimina. Il menu è il Menu di
// Base UI: il pannello sta in un portale e si posiziona da solo (non viene tagliato dai contenitori con
// overflow), e Esc, il clic fuori e le frecce li gestisce la libreria. Le due azioni aprono un <dialog>
// fuori dal menu, così restano aperte quando il menu si chiude. Partono da onSubmit/onClick con
// startTransition (mai <form action>), così un errore non cancella quello che si è scritto. Eliminare
// toglie solo la conversazione: le modifiche già applicate al viaggio restano.
export function ChatSessionActions({ sessionId, title }: { sessionId: string; title: string }) {
  const t = useTranslations("Chat.session");
  const router = useRouter();
  const inputId = useId();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    <>
      <BaseMenu.Root>
        <BaseMenu.Trigger aria-label={t("menu")} className={buttonClass("ghost", "sm", "shrink-0 px-2 text-lava-muted")}>
          <Ellipsis size={20} strokeWidth={1.5} aria-hidden="true" />
        </BaseMenu.Trigger>
        <BaseMenu.Portal>
          <BaseMenu.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="is-overlay">
            <BaseMenu.Popup aria-label={t("menu")} className="is-panel is-chat-menu">
              <BaseMenu.Item
                className="is-chat-menu__item"
                onClick={() => {
                  setRenameOpen(true);
                }}
              >
                <Pencil size={18} strokeWidth={1.5} aria-hidden="true" />
                {t("rename")}
              </BaseMenu.Item>
              <BaseMenu.Item
                className="is-chat-menu__item"
                onClick={() => {
                  setDeleteOpen(true);
                }}
              >
                <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
                {t("delete")}
              </BaseMenu.Item>
            </BaseMenu.Popup>
          </BaseMenu.Positioner>
        </BaseMenu.Portal>
      </BaseMenu.Root>

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
    </>
  );
}
