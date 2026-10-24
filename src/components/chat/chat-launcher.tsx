"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/design";
import { trapFocus } from "@/components/ui/dialog";
import { ChatPanel } from "./chat-panel";

// "Chiedi all'assistente" nella pagina del viaggio: apre la variante compatta dell'assistente legata al
// viaggio (itineraryId). Stesso layout della pagina assistente senza la colonna delle conversazioni: in
// testa il titolo e la chiusura, sotto i messaggi e il compositore fisso. Su desktop è una colonna a
// destra, su mobile occupa tutta l'altezza. È un <dialog> modale: il focus resta dentro, Esc lo chiude e il
// focus torna al pulsante. Il contenuto si monta solo quando è aperto.
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
        className="m-0 h-dvh max-h-none w-full max-w-none bg-calce p-0 text-lava backdrop:bg-calce/70 md:ml-auto md:h-[calc(100dvh_-_2rem)] md:my-4 md:w-[min(440px,100vw)] md:rounded-lg md:border md:border-card-edge md:shadow-card"
      >
        {open && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
              <h2 id={titleId} className="is-display min-w-0 truncate text-heading-3">
                {t("title", { title })}
              </h2>
              <Button variant="ghost" size="sm" onClick={hide} aria-label={t("close")} className="px-2">
                <X size={20} strokeWidth={1.5} aria-hidden="true" />
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-5 pb-4">
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
