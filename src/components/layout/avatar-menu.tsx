import { ActionMenu, type ActionMenuItem } from "./action-menu";

// Menu personale (brief 6.1): avatar con le iniziali o la foto, che apre le voci dell'account.
// Senza iniziali (ospite) mostra l'icona della persona. Server Component: passa solo dati serializzabili.
export function AvatarMenu({
  label,
  initials,
  avatarUrl,
  items,
}: {
  label: string;
  initials: string | null;
  avatarUrl?: string | null;
  items: ActionMenuItem[];
}) {
  // Un valore senza lettere o cifre (es. un simbolo) non è un'iniziale: si mostra l'icona della persona.
  const shownInitials = initials && /[\p{L}\p{N}]/u.test(initials) ? initials : null;
  return <ActionMenu variant="avatar" label={label} initials={shownInitials} avatarUrl={avatarUrl ?? null} items={items} align="end" />;
}
