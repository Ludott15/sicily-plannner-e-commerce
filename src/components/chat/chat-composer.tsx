"use client";

import { useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/design";

// Compositore dell'assistente (brief B): textarea che cresce fino a 6 righe, Invio invia e Maiusc+Invio
// va a capo, bottone a icona che diventa "Interrompi" durante la risposta. Il contatore compare solo
// vicino al limite; sotto stanno la nota sull'assistente e i messaggi rimasti per oggi.
// Il testo resta controllato dal pannello: qui non c'è stato di invio.

// Dal 80% del limite il contatore si mostra.
const COUNTER_FROM_RATIO = 0.8;

export type ChatComposerProps = {
  inputId: string;
  hintId: string;
  value: string;
  maxLength: number;
  canType: boolean;
  streaming: boolean;
  remainingText: string | null;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
};

export function ChatComposer({
  inputId,
  hintId,
  value,
  maxLength,
  canType,
  streaming,
  remainingText,
  onChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const t = useTranslations("Chat");
  const formRef = useRef<HTMLFormElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Altezza sul contenuto: il massimo sta nel CSS (sei righe), oltre la textarea scorre.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [value]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  const showCounter = value.length >= Math.floor(maxLength * COUNTER_FROM_RATIO);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="sr-only">
        {t("inputLabel")}
      </label>
      <div className="is-chat-composer">
        <textarea
          id={inputId}
          ref={areaRef}
          name="message"
          rows={1}
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={!canType}
          aria-describedby={hintId}
          className="is-chat-composer__input"
        />
        {streaming ? (
          <Button type="button" variant="secondary" onClick={onStop} className="shrink-0">
            <Square size={14} strokeWidth={1.5} aria-hidden="true" className="fill-current" />
            {t("stop")}
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            aria-label={t("send")}
            disabled={!canType || value.trim() === ""}
            className="size-11 shrink-0 px-0"
          >
            <ArrowUp size={20} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        )}
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 text-caption text-lava-muted">
        <span id={hintId}>
          <span className="sr-only">{t("inputHint")} </span>
          {t("note")}
          {remainingText ? ` ${remainingText}` : null}
        </span>
        {showCounter && <span>{t("counter", { count: value.length, max: maxLength })}</span>}
      </p>
    </form>
  );
}
