import type { ReactNode } from "react";
import { Car, Footprints } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { WhyLine, type Why } from "./why-line";

// ItineraryStop (docs/design/components/ItineraryStop/README.md)
// Una tappa dentro <Route>: orario, punto sulla linea del percorso, contenuto.
// - Punto lava per le tappe, coccio per la tappa in corso (now) durante il viaggio.
// - Voti solo nei viaggi di gruppo (StopVotes), sempre presenti su ogni tappa.
// - Il perché: "Per il gruppo" con motivo aggregato, mai le preferenze dei singoli.
// - Meta troncata a due righe.
// Il riordino trascinando la card arriva con l'itinerary builder (milestone 5).

export function ItineraryStop({
  time,
  title,
  href,
  meta,
  thumbUrl,
  now = false,
  active = false,
  why,
  votes,
  children,
}: {
  time?: string;
  title: string;
  href?: string;
  meta?: string;
  thumbUrl?: string | null;
  now?: boolean;
  /** Tappa attiva sulla mappa (navigazione): la scheda si evidenzia. */
  active?: boolean;
  why?: Why;
  votes?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li
      className={cn("is-stop", now && "is-stop--now", active && "is-stop--active")}
      aria-current={now ? "step" : undefined}
      data-active={active ? "true" : undefined}
    >
      <div className="is-stop__time">{time}</div>
      <div>
        <span className="is-stop__dot" />
      </div>
      <div className="is-stop__body">
        <div className="is-stop__thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumbUrl && <img src={thumbUrl} alt="" loading="lazy" />}
        </div>
        <div>
          <p className="is-stop__title">{href ? <Link href={href}>{title}</Link> : title}</p>
          {meta && <p className="is-stop__meta">{meta}</p>}
          {why && <WhyLine why={why} />}
          {votes}
          {children}
        </div>
      </div>
    </li>
  );
}

// Trasferimento tra due tappe: punto vuoto mare, solo mezzo, durata e distanza.
export function TransferStop({ mode, text }: { mode: "car" | "walk"; text: string }) {
  const Icon = mode === "car" ? Car : Footprints;
  return (
    <li className="is-stop is-stop--transfer">
      <div className="is-stop__time" />
      <div>
        <span className="is-stop__dot" />
      </div>
      <div className="is-stop__body">
        <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
        {text}
      </div>
    </li>
  );
}
