"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/design";
import { trapFocus } from "@/components/ui/dialog";
import { ChatPanel } from "./chat-panel";

// "Chiedi all'assistente" nella pagina del viaggio: apre il pannello legato al viaggio (itineraryId).
// Su desktop è una colonna a destra, su mobile occupa tutta l'altezza. È un <dialog> modale: il focus
// resta dentro, Esc lo chiude e il focus torna al pulsante. Il contenuto si monta solo quando è aperto.
export function ChatLauncher({
  itineraryId,
  title,
  enabled,
  remainingToday,
  limit,
}: {
  itineraryId: string;
  title: string;
  enabled: boolean;
  remainingToday: number;
  limit: number;
}) {
  const t = useTranslations("Chat.launcher");
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
      <Button variant="secondary" size="sm" onClick={show} aria-haspopup="dialog">
        {t("open")}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onKeyDown={(event) => trapFocus(event, ref.current)}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-calce p-0 text-lava backdrop:bg-calce/70 md:ml-auto md:w-[min(440px,100vw)]"
      >
        {open && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-divider px-4 py-3">
              <h2 id={titleId} className="min-w-0 truncate text-heading-3">
                {t("title", { title })}
              </h2>
              <Button variant="ghost" size="sm" onClick={hide} aria-label={t("close")}>
                <X size={20} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <ChatPanel
                variant="sheet"
                itineraryId={itineraryId}
                enabled={enabled}
                remainingToday={remainingToday}
                limit={limit}
              />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
