import { Suspense } from "react";
import { bookingsToFinish } from "@/components/to-finish/load";
import { ToFinishReminder } from "@/components/to-finish/to-finish-reminder";

// The setter's reminder bar, in the shared app layout under the header
// (Book now, finish later, Keenan, 2026-11-10). Setters only, and the
// person a View as is for. Read in its own boundary, so the screen never
// waits on it; nothing shows until there is something to finish.
export function ToFinishBar({ person }: { person: { id: string; role: string } }) {
  if (person.role !== "sales") return null;
  return (
    <Suspense fallback={null}>
      <Loaded person={person} />
    </Suspense>
  );
}

async function Loaded({ person }: { person: { id: string; role: string } }) {
  const bookings = await bookingsToFinish(person);
  return bookings.length > 0 ? <ToFinishReminder bookings={bookings} /> : null;
}
