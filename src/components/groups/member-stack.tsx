import type { GroupMemberView } from "@/server/groups/queries";
import { MemberAvatar } from "./member-avatar";

// Avatar dei membri sovrapposti (brief 6.1, intestazione del gruppo). Solo decorativi: il conteggio
// dei membri è scritto accanto, quindi lo leggono gli screen reader. Server Component.
const SHOWN = 5;

export function MemberStack({ members }: { members: readonly GroupMemberView[] }) {
  return (
    <span aria-hidden="true" className="flex -space-x-3">
      {members.slice(0, SHOWN).map((member) => (
        <MemberAvatar
          key={member.userId}
          name={member.displayName}
          avatarUrl={member.avatarUrl}
          className="border-2 border-calce"
        />
      ))}
    </span>
  );
}
