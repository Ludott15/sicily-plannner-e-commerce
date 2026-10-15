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
  return <ActionMenu variant="avatar" label={label} initials={initials} avatarUrl={avatarUrl ?? null} items={items} align="end" />;
}
