import type { Metadata } from "next";
import { InstallsCalendar } from "@/components/installs/installs-calendar";
import { NotForYourRole } from "@/components/not-for-your-role";
import { requireProfile } from "@/lib/auth/profile";
import { monthDays, monthOf, shiftMonth } from "@/lib/installs/calendar";
import { leadName } from "@/lib/leads/status";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryToday } from "@/lib/time";

export const metadata: Metadata = {
  title: "Installs",
};

// Round 23 (Keenan, 2026-11-17): Keenan's install calendar, a month at a
// time. A day is closed until he opens it; an open day takes the number of
// jobs in Settings or its own. Each day shows who's booked (each name opens
// the lead) and how many spots are left. Owner only: the page checks the
// role before it reads anything, and the database lets no one else read
// or change the calendar.
export default async function InstallsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await requireProfile();
  if (me.role !== "owner") return <NotForYourRole />;
  const today = calgaryToday();
  const { m } = await searchParams;
  const month = monthOf(m, today);
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);

  const supabase = await createClient();
  const [{ data: rows }, { data: leads }, { data: settings }] = await Promise.all([
    supabase.from("install_days").select("day, open, job_limit").gte("day", first).lte("day", last),
    supabase.from("leads").select("id, first_name, last_name, install_on").gte("install_on", first).lte("install_on", last).neq("status", "lost"),
    supabase.from("settings").select("install_jobs_per_day").eq("id", 1).single(),
  ]);
  const defaultLimit = settings?.install_jobs_per_day ?? 1;
  const booked = (leads ?? []).filter((lead) => lead.install_on).map((lead) => ({ id: lead.id, name: leadName(lead), day: lead.install_on as string }));
  const days = [...monthDays(month, rows ?? [], booked, defaultLimit, today).values()];

  return (
    <InstallsCalendar
      key={month}
      month={month}
      today={today}
      days={days}
      defaultLimit={defaultLimit}
      prev={shiftMonth(month, -1)}
      next={shiftMonth(month, 1)}
    />
  );
}
