import type { Metadata } from "next";
import { MarkPaidForm } from "@/components/pay/mark-paid-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { namesById } from "@/lib/leads/queries";
import { leadName } from "@/lib/leads/status";
import { formatMoney, isOwed, payTotals } from "@/lib/pay/earnings";
import { formatMeetingTime } from "@/lib/schedule/meetings";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = {
  title: "Pay",
};

// Pay in Admin (Keenan): what each setter is owed, pending install and
// paid. He ticks the owed lines he has paid and marks them paid in one
// batch. The app records pay; it never moves money.
export default async function PayPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("earnings")
    .select(
      "id, profile_id, type, rate, amount, status, payable_at, paid_at, note, created_at, meeting:meetings!earnings_meeting_id_fkey(starts_at), lead:leads!earnings_lead_id_fkey(id, first_name, last_name, address_line)",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  const lines = (rows ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
    meeting: row.meeting as unknown as { starts_at: string } | null,
    lead: row.lead as unknown as { id: string; first_name: string; last_name: string | null; address_line: string } | null,
  }));
  const names = await namesById(supabase, lines.map((line) => line.profile_id));
  const setters = Array.from(new Set(lines.map((line) => line.profile_id))).sort((a, b) =>
    (names.get(a) ?? "").localeCompare(names.get(b) ?? ""),
  );
  const describe = (line: (typeof lines)[number]) =>
    [
      line.type === "booking" ? "Booking fee" : "Commission",
      line.meeting ? formatMeetingTime(line.meeting.starts_at) : formatDate(line.created_at),
      line.lead ? `${leadName(line.lead)}, ${line.lead.address_line}` : null,
      line.type === "booking" ? `at ${formatMoney(Number(line.rate))}` : `at ${Math.round(Number(line.rate) * 10000) / 100}%`,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Pay</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Owed now: booking fees for Qualified meetings, not yet paid. Pending install: commission
          waiting for the install. Paid: lines you have marked paid. Each line keeps the rate it was
          worked out at.
        </p>
      </div>
      {setters.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet. When you mark a meeting Qualified, the setter&apos;s booking fee shows here.
        </p>
      ) : (
        setters.map((setterId) => {
          const own = lines.filter((line) => line.profile_id === setterId);
          const totals = payTotals(own);
          const owed = own.filter(isOwed);
          const pendingInstall = own.filter((line) => line.status === "pending" && !line.payable_at);
          const paid = own.filter((line) => line.status === "paid").slice(0, 20);
          const name = names.get(setterId) ?? "A setter";
          return (
            <Card key={setterId} data-testid="pay-setter">
              <CardHeader>
                <CardTitle>{name}</CardTitle>
                <CardDescription>
                  Owed now {formatMoney(totals.owedNow)} · Pending install {formatMoney(totals.pendingInstall)} · Paid{" "}
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
                {pendingInstall.length > 0 ? (
                  <div className="text-sm">
                    <p className="font-semibold">Pending install</p>
                    <ul className="list-disc pl-5">
                      {pendingInstall.map((line) => (
                        <li key={line.id}>
                          {describe(line)}: {formatMoney(line.amount)}
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
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
