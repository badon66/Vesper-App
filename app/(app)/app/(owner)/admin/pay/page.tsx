import type { Metadata } from "next";
import Link from "next/link";
import { MarkPaidForm } from "@/components/pay/mark-paid-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { namesById } from "@/lib/leads/queries";
import { leadName } from "@/lib/leads/status";
import { formatMoney, isOwed, payTotals, ratePercent, voidReason } from "@/lib/pay/earnings";
import { formatMoney as priceMoney } from "@/lib/pricing";
import { formatMeetingTime } from "@/lib/schedule/meetings";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Pay",
};

// How long a voided line stays on Pay, with its reason.
const VOID_DAYS = 30;

// Pay in Admin (Keenan): what each setter is owed (booking fees, and
// commission once the job is installed), the commission coming on sales not
// installed yet, what has been paid, and recent voided lines with their
// reason. He ticks the owed lines he has paid and marks them paid in one
// batch. The app records pay; it never moves money.
export default async function PayPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("earnings")
    .select(
      "id, profile_id, type, rate, base_amount, amount, status, payable_at, paid_at, note, created_at, updated_at, meeting:meetings!earnings_meeting_id_fkey(starts_at), lead:leads!earnings_lead_id_fkey(id, first_name, last_name, address_line)",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  const lines = (rows ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
    meeting: row.meeting as unknown as { starts_at: string } | null,
    lead: row.lead as unknown as { id: string; first_name: string; last_name: string | null; address_line: string } | null,
  }));
  type Line = (typeof lines)[number];
  const names = await namesById(supabase, lines.map((line) => line.profile_id));
  const setters = Array.from(new Set(lines.map((line) => line.profile_id))).sort((a, b) =>
    (names.get(a) ?? "").localeCompare(names.get(b) ?? ""),
  );
  const voidSince = requestTime() - VOID_DAYS * 24 * 60 * 60 * 1000;
  const leadText = (line: Line) => (line.lead ? `${leadName(line.lead)}, ${line.lead.address_line}` : null);
  const rateText = (line: Line) =>
    line.type === "booking"
      ? `at ${formatMoney(Number(line.rate))}`
      : line.base_amount !== null
        ? // The base is a quote amount, written the way every price in the app is ("$5,636", round 12), not in Pay's cents style.
          `${ratePercent(Number(line.rate))} of ${priceMoney(Number(line.base_amount))}`
        : `at ${ratePercent(Number(line.rate))}`;
  const describe = (line: Line) =>
    [
      line.type === "booking" ? "Booking fee" : "Commission",
      line.meeting ? formatMeetingTime(line.meeting.starts_at) : formatDate(line.created_at),
      leadText(line),
      rateText(line),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Pay</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Owed now: booking fees for Qualified meetings and commission on jobs you marked Installed, not paid yet. Commission
          coming: quotes you marked accepted, owed once the job is installed. Paid: lines you have marked paid. Voided lines
          show for {VOID_DAYS} days with their reason. Each line keeps the rate it was worked out at.
        </p>
      </div>
      {setters.length === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">
          Nothing yet. When you mark a meeting Qualified, the setter&apos;s booking fee shows here. When you mark a quote accepted
          on the lead page, the setter&apos;s commission shows here as coming, and it is owed once you mark the job Installed.
        </p>
      ) : (
        setters.map((setterId) => {
          const own = lines.filter((line) => line.profile_id === setterId);
          const totals = payTotals(own);
          const owed = own.filter(isOwed);
          const coming = own.filter((line) => line.status === "pending" && !line.payable_at);
          const paid = own.filter((line) => line.status === "paid").slice(0, 20);
          const voided = own.filter((line) => line.status === "void" && Date.parse(line.updated_at) >= voidSince).slice(0, 20);
          const name = names.get(setterId) ?? "A setter";
          return (
            <Card key={setterId} data-testid="pay-setter">
              <CardHeader>
                <CardTitle>{name}</CardTitle>
                <CardDescription>
                  Owed now {formatMoney(totals.owedNow)} · Commission coming {formatMoney(totals.pendingInstall)} · Paid{" "}
                  {formatMoney(totals.paid)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {owed.length > 0 ? (
                  <MarkPaidForm
                    setterName={name}
                    lines={owed.map((line) => ({ id: line.id, label: describe(line), amount: line.amount }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing owed right now.</p>
                )}
                {coming.length > 0 ? (
                  <div className="flex flex-col gap-1 text-sm" data-testid="pay-commission-coming">
                    <p className="font-semibold">Commission coming</p>
                    <p className="text-pretty text-muted-foreground">
                      Sold, not installed yet. Each is owed once you mark the job Installed on its lead page.
                    </p>
                    <ul className="flex flex-col divide-y border-y">
                      {coming.map((line) => (
                        <li key={line.id} className="flex items-center justify-between gap-3 py-1">
                          <span className="flex min-w-0 flex-col">
                            {line.lead ? (
                              <Link
                                href={`/app/leads/${line.lead.id}`}
                                className="inline-flex min-h-11 w-fit items-center underline underline-offset-4"
                              >
                                {leadText(line)}
                              </Link>
                            ) : (
                              <span>A lead</span>
                            )}
                            <span className="text-muted-foreground">
                              Sold {formatDate(line.created_at)} · {rateText(line)}
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">{formatMoney(line.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {paid.length > 0 ? (
                  <div className="text-sm text-muted-foreground">
                    <p className="font-semibold">Recently paid</p>
                    <ul className="list-disc pl-5">
                      {paid.map((line) => (
                        <li key={line.id}>
                          {describe(line)}: {formatMoney(line.amount)}
                          {line.paid_at ? `, paid ${formatDate(line.paid_at)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {voided.length > 0 ? (
                  <div className="text-sm text-muted-foreground" data-testid="pay-voided">
                    <p className="font-semibold">Voided in the last {VOID_DAYS} days</p>
                    <ul className="list-disc pl-5">
                      {voided.map((line) => {
                        const reason = voidReason(line.note);
                        return (
                          <li key={line.id}>
                            {describe(line)}: {formatMoney(line.amount)}, voided {formatDate(line.updated_at)}
                            {reason ? `: ${reason}` : ""}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
