import Link from "next/link";
import { KnockCard } from "@/components/knock/knock-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionProfile } from "@/lib/auth/profile";
import { followUpLabel } from "@/lib/leads/attention";
import {
  closeMyStaleKnockSessions,
  followUpsDue,
  lastNeighbourhood,
  openKnockSession,
} from "@/lib/leads/queries";
import { leadName } from "@/lib/leads/status";
import { roleLabel } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { calgaryToday } from "@/lib/time";
import { cn } from "@/lib/utils";

// A setter's Home: their knock session and their follow-ups due. Every query
// is scoped to this person, so View as shows exactly what they would see,
// and nothing is written while viewing (CLAUDE.md, View as).
export async function SalesHome({ profile, readOnly }: { profile: SessionProfile; readOnly: boolean }) {
  const supabase = await createClient();
  const today = calgaryToday();
  const [session, last, due] = await Promise.all([
    openKnockSession(supabase, profile.id),
    lastNeighbourhood(supabase, profile.id),
    followUpsDue(supabase, profile.id, today),
    readOnly ? null : closeMyStaleKnockSessions(supabase),
  ]);
  const firstName = profile.full_name.split(" ")[0] || profile.full_name;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {roleLabel(profile.role)}. Signed in as {profile.email}
        </p>
      </div>

      <KnockCard key={session?.id ?? "none"} session={session} lastNeighbourhood={last} />

      <Card>
        <CardHeader>
          <CardTitle>Follow-ups due</CardTitle>
          <CardDescription>Your Follow up leads dated today or earlier, the oldest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {due.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None due today. When you move a lead to Follow up, it shows here on the day you picked.
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border" aria-label="Follow-ups due">
              {due.map((lead) => {
                const label = lead.follow_up_on ? followUpLabel(lead.follow_up_on, today) : "Due today";
                return (
                  <li key={lead.id}>
                    <Link
                      href={`/app/leads/${lead.id}`}
                      className="flex min-h-16 flex-col justify-center gap-0.5 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <span className="font-semibold">{leadName(lead)}</span>
                      <span className="text-sm text-muted-foreground">
                        {lead.address_line}
                        {lead.neighbourhood ? `, ${lead.neighbourhood}` : ""}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          label.startsWith("Overdue") ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
