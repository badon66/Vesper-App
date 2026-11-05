import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatTime } from "@/lib/time";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
// "4:32 p.m." already ends a sentence; "16:32" needs the full stop.
const sentenceEnd = (text: string) => (text.endsWith(".") ? text : `${text}.`);

export type LiveSession = { neighbourhood: string; started_at: string; doors_knocked: number; conversations: number };

// The way into Session from Home (Keenan, 2026-11-05): Start knocking, or,
// while the person is out, a bar for their live session that opens it.
export function SessionLink({ session }: { session: LiveSession | null }) {
  // A quiet row, not a second gold button: the gold Session tab is right
  // below, and this one opens Session, where the neighbourhood is picked.
  if (!session) {
    return (
      <Link
        href="/app/session"
        className="flex min-h-14 items-center justify-between gap-3 rounded-lg border px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="home-start-knocking"
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">Start knocking</span>
          <span className="text-sm text-muted-foreground">Pick the neighbourhood on Session.</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
      </Link>
    );
  }
  return (
    <Link
      href="/app/session"
      className="flex min-h-16 items-center justify-between gap-3 rounded-lg border-2 border-primary bg-card px-4 py-3 text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="home-session-bar"
    >
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold text-pretty">Knocking in {session.neighbourhood}</span>
        <span className="text-sm text-muted-foreground">
          Since {sentenceEnd(formatTime(session.started_at))} {plural(session.doors_knocked, "door", "doors")},{" "}
          {plural(session.conversations, "conversation", "conversations")}.
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
    </Link>
  );
}
