import type { Metadata } from "next";
import Link from "next/link";
import { NotForYourRole } from "@/components/not-for-your-role";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { leadName } from "@/lib/leads/status";
import { formatMoney, payTotals } from "@/lib/pay/earnings";
import { formatMeetingTime, MEETING_STATUS_LABELS } from "@/lib/schedule/meetings";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "My pay",
};

// A setter's own pay (CLAUDE.md, Setter pay): owed now, pending install and
// paid, then every booking on their leads with how it went and its fee.
// Nothing about anyone else. Every query names this person, so View as
// shows exactly what they would see.
export default async function MyPayPage() {
  const me = await requireProfile();
  if (me.role !== "sales") {
    return <NotForYourRole message="My pay is for sales associates. Setters' pay is under Admin, Pay." />;
  }
  const supabase = await createClient();
  const [{ data: earnings }, { data: meetings }] = await Promise.all([
    supabase
      .from("earnings")
      .select("id, meeting_id, type, amount, status, payable_at, paid_at, note, created_at")
      .eq("profile_id", me.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("meetings")
      .select("id, starts_at, status, outcome_reason, lead:leads!meetings_lead_id_fkey(id, first_name, last_name, address_line)")
      .eq("setter_id", me.id)
      .neq("status", "moved")
      .order("starts_at", { ascending: false })
      .limit(200),
  ]);
  const lines = (earnings ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
  const totals = payTotals(lines);
  const feeByMeeting = new Map(lines.filter((row) => row.meeting_id).map((row) => [row.meeting_id as string, row]));
  const commissions = lines.filter((row) => row.type === "commission");
  const now = requestTime();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">My pay</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your booking fees and commission. Keenan pays outside the app and marks it here.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3" data-testid="pay-totals">
        {[
          ["Owed now", totals.owedNow],
          ["Pending install", totals.pendingInstall],
          ["Paid", totals.paid],
        ].map(([label, amount]) => (
          <div key={label as string} className="flex flex-col gap-1 rounded-md border p-3">
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
            <span className="text-xl font-bold tabular-nums">{formatMoney(amount as number)}</span>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Owed now: fees for meetings Keenan marked Qualified, not paid yet. Pending install: commission
        on sales waiting for the install. Paid: everything Keenan has marked paid.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Bookings</CardTitle>
          <CardDescription>Every meeting booked on your leads, newest first. Only Qualified earns the fee.</CardDescription>
        </CardHeader>
        <CardContent>
          {(meetings ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bookings yet. Book a meeting from Schedule or a lead, and it shows here with its outcome.
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border" aria-label="Bookings" data-testid="pay-lines">
              {(meetings ?? []).map((meeting) => {
                const lead = meeting.lead as unknown as { id: string; first_name: string; last_name: string | null; address_line: string } | null;
                const fee = feeByMeeting.get(meeting.id);
                const started = new Date(meeting.starts_at).getTime() <= now;
                const outcome =
                  meeting.status === "booked" || meeting.status === "confirmed"
                    ? started
                      ? "Waiting for Keenan"
                      : "Upcoming"
                    : meeting.status === "not_qualified" && meeting.outcome_reason
                      ? `Not qualified: ${meeting.outcome_reason}`
                      : MEETING_STATUS_LABELS[meeting.status];
                const feeText = !fee
                  ? "No fee"
                  : fee.status === "paid"
                    ? `${formatMoney(fee.amount)} paid${fee.paid_at ? ` ${formatDate(fee.paid_at)}` : ""}`
                    : fee.status === "void"
                      ? "Fee voided"
                      : `${formatMoney(fee.amount)} owed`;
                return (
                  <li key={meeting.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
                    <span className="font-semibold">{formatMeetingTime(meeting.starts_at)}</span>
                    {lead ? (
                      <Link href={`/app/leads/${lead.id}`} className="w-fit underline underline-offset-4">
                        {leadName(lead)}, {lead.address_line}
                      </Link>
                    ) : null}
                    <span>{outcome}</span>
                    <span className="font-semibold">{feeText}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {commissions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Commission</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y rounded-md border">
              {commissions.map((line) => (
                <li key={line.id} className="flex justify-between px-4 py-3 text-sm">
                  <span>{formatDate(line.created_at)}</span>
                  <span className="font-semibold">
                    {formatMoney(line.amount)} {line.status === "paid" ? "paid" : line.payable_at ? "owed" : "pending install"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
