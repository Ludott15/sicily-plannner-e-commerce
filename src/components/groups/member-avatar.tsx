import { cn } from "@/lib/utils";

// Avatar di un membro: la foto se c'è, altrimenti le iniziali su calce-sunk (solo token).
// È decorativo: il nome accanto è il testo che lo legge.
export function initialsOf(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "·";
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
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
        initialsOf(name)
      )}
    </span>
  );
}
