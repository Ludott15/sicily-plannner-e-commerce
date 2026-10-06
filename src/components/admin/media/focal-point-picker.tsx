"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type MouseEvent } from "react";
import { Button } from "@/components/design";
import { Field, TextInput } from "../fields";

// Punto focale: un clic sull'originale lo sposta lì e rigenera le varianti (4:5, 16:9, 1:1)
// ritagliate attorno a quel punto. Per chi usa la tastiera, le due percentuali qui sotto.
export function FocalPointPicker({
  mediaId,
  src,
  width,
  height,
  focalX,
  focalY,
  save,
}: {
  mediaId: string;
  src: string;
  width: number;
  height: number;
  focalX: number;
  focalY: number;
  save: (input: unknown) => Promise<{ ok: boolean }>;
}) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [point, setPoint] = useState({ x: focalX, y: focalY });
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function submit(x: number, y: number) {
    setPoint({ x, y });
    startTransition(async () => {
      const result = await save({ id: mediaId, x, y });
      setStatus(result.ok ? "saved" : "error");
      if (result.ok) router.refresh();
    });
  }

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    submit(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Il clic è una scorciatoia: lo stesso valore si imposta dai campi qui sotto. */}
      <div className="relative w-full max-w-2xl cursor-crosshair overflow-hidden rounded-md bg-calce-sunk" onClick={onClick}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={width} height={height} className="block h-auto w-full" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-on-ink shadow-card"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        />
      </div>
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          submit(Number(data.get("x")) / 100, Number(data.get("y")) / 100);
        }}
      >
        <Field label={t("mediaFocalX")} htmlFor="focal-x">
          <TextInput id="focal-x" name="x" type="number" min={0} max={100} step={1} defaultValue={Math.round(focalX * 100)} key={`x-${point.x}`} className="w-28" />
        </Field>
        <Field label={t("mediaFocalY")} htmlFor="focal-y">
          <TextInput id="focal-y" name="y" type="number" min={0} max={100} step={1} defaultValue={Math.round(focalY * 100)} key={`y-${point.y}`} className="w-28" />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("mediaFocalSave")}
        </Button>
        <span role="status" className="text-body-s text-lava-muted">
          {pending ? t("mediaFocalWorking") : status === "saved" ? t("saved") : status === "error" ? t("errors.failed") : ""}
        </span>
      </form>
    </div>
  );
}
