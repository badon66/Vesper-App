import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/time";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
// "4:32 p.m." already ends a sentence; "16:32" needs the full stop.
const sentenceEnd = (text: string) => (text.endsWith(".") ? text : `${text}.`);

export type LiveSession = { neighbourhood: string; started_at: string; doors_knocked: number; conversations: number };

// The way into Session from Home (Keenan, 2026-11-05): Start knocking, or,
// while the person is out, a bar for their live session that opens it.
export function SessionLink({ session }: { session: LiveSession | null }) {
  if (!session) {
    return (
      <Button asChild size="lg" className="h-14 w-full text-lg" data-testid="home-start-knocking">
        <Link href="/app/session">Start knocking</Link>
      </Button>
    );
  }
  return (
    <Link
      href="/app/session"
      className="flex min-h-16 items-center justify-between gap-3 rounded-xl border-2 border-primary bg-card px-4 py-3 text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
