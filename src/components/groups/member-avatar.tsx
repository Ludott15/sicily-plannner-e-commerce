import { User } from "lucide-react";
import { cn } from "@/lib/utils";

// Avatar di un membro: la foto se c'è, altrimenti le iniziali su calce-sunk (solo token).
// Senza iniziali alfanumeriche (nome vuoto o solo simboli) mostra l'icona della persona.
// È decorativo: il nome accanto è il testo che lo legge.
export function initialsOf(name: string | null): string | null {
  const initials = (name ?? "")
    .trim()
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((char): char is string => char !== undefined)
    .slice(0, 2)
    .map((char) => char.toUpperCase())
    .join("");
  return initials === "" ? null : initials;
}

export function MemberAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string | null;
  avatarUrl: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-calce-sunk text-body-s font-semibold text-lava",
        className,
      )}
    >
      {avatarUrl ? (
        // Avatar piccolo da un URL qualsiasi del profilo: next/image richiederebbe gli host in configurazione.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        (initialsOf(name) ?? <User size={20} strokeWidth={1.5} aria-hidden="true" />)
      )}
    </span>
  );
}
