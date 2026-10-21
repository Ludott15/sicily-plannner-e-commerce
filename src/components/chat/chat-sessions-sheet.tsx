"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { List, X } from "lucide-react";
import { Button } from "@/components/design";
import { trapFocus } from "@/components/ui/dialog";
import { ChatSessionList } from "./chat-session-list";
import type { ChatSessionListItem } from "./group-sessions";

// Elenco delle conversazioni su mobile: uno sheet a tutto schermo aperto dal pulsante "Conversazioni"
// della barra della pagina. Modale come il dialog del viaggio: il focus resta dentro, Esc chiude e il
// focus torna al pulsante. Il contenuto si monta solo quando è aperto. Su desktop la colonna laterale
// mostra lo stesso elenco, quindi questo componente sta solo sotto md.
export function ChatSessionsSheet({ sessions }: { sessions: readonly ChatSessionListItem[] }) {
  const t = useTranslations("Chat");
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  function show() {
    setOpen(true);
    ref.current?.showModal();
  }

  function hide() {
    ref.current?.close();
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={show} aria-haspopup="dialog" className="-ml-2">
        <List size={18} strokeWidth={1.5} aria-hidden="true" />
        {t("sessionsTitle")}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onKeyDown={(event) => trapFocus(event, ref.current)}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-calce p-0 text-lava backdrop:bg-calce/70"
      >
        {open && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-divider px-4 py-3">
              <h2 id={titleId} className="text-heading-3">
                {t("sessionsTitle")}
              </h2>
              <Button variant="ghost" size="sm" onClick={hide} aria-label={t("closeSessions")}>
                <X size={20} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <ChatSessionList sessions={sessions} onNavigate={hide} />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
