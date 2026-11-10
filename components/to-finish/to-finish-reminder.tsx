"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { landOn } from "@/components/scroll-to-hash";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { bookingsToFinishLabel } from "@/lib/leads/to-finish";
import type { BookingToFinish } from "@/components/to-finish/load";

// Where the bar never shows: the old booking page (it only sends people to
// Schedule, where the booking sheet opens over everything) and the first
// sign-in's welcome. The sheet itself is a modal over the whole app, so the
// bar is never seen inside it.
const HIDDEN_ON = ["/app/schedule/book", "/app/welcome"];

// The minute, so a booking leaves the bar once its time starts; it ticks
// over once a minute. 0 while the page is drawn on the server and first
// hydrated, when the server's own list is shown as it is.
function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000);

// A link to the page already open moves on the page: the dialog closes
// first, handing the focus back to the bar, so the field takes it after.
function landAfterClose(href: string, pathname: string) {
  const [path, hash] = href.split("#");
  if (path !== pathname || !hash) return;
  const onEdit = path.endsWith("/edit");
  window.setTimeout(() => landOn(hash, { block: onEdit ? "center" : "start", focus: onEdit }), 80);
}

// The setter's reminder (Book now, finish later, Keenan, 2026-11-10): one
// slim line at the top of every screen while one of their bookings still
// misses something from the old Before you book list, like "2 bookings to
// finish". Tapping it lists them, soonest first, with what each one needs;
// each item goes straight to its field. It clears itself once everything is
// in. Calm: a small gold mark for the next thing to do, never alarm red.
export function ToFinishReminder({ bookings }: { bookings: BookingToFinish[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const minute = useSyncExternalStore(subscribeMinute, thisMinute, () => 0);
  const shown = minute === 0 ? bookings : bookings.filter((booking) => Date.parse(booking.startsAt) > minute * 60_000);

  if (shown.length === 0 || HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;
  const label = bookingsToFinishLabel(shown.length);

  return (
    <div className="border-b bg-accent text-accent-foreground" data-testid="to-finish-bar" data-count={shown.length}>
      <div className="mx-auto w-full max-w-5xl px-4">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="flex min-h-11 w-full items-center gap-3 rounded-md text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="to-finish-open"
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />
          <span className="flex-1">{label}</span>
          <span className="flex items-center gap-1 font-normal text-muted-foreground">
            Show
            <ChevronRight aria-hidden="true" className="size-4" />
          </span>
        </button>
      </div>
      <DialogPanel
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        testId="to-finish-panel"
        actions={
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        <p className="text-sm text-pretty text-muted-foreground">Booked, with a few things still to add. Tap one to go straight to it.</p>
        <ul className="mt-2 flex flex-col divide-y" aria-label="Bookings to finish">
          {shown.map((booking) => (
            <li key={booking.meetingId} className="flex flex-col gap-2 py-3" data-testid="to-finish-booking" data-meeting={booking.meetingId}>
              <div className="flex flex-col">
                <Link
                  href={`/app/leads/${booking.leadId}`}
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 w-fit items-center text-base font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {booking.name}
                </Link>
                <p className="text-sm font-semibold">{booking.when}</p>
                <p className="text-sm text-pretty text-muted-foreground">{booking.address}</p>
              </div>
              <ul className="flex flex-wrap gap-2" aria-label={`Still to add for ${booking.name}`}>
                {booking.items.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => {
                        setOpen(false);
                        landAfterClose(item.href, pathname);
                      }}
                      aria-label={`${item.label}: ${item.detail}`}
                      className="inline-flex min-h-11 items-center rounded-md border border-input bg-background px-3 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="to-finish-item"
                      data-item={item.key}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </DialogPanel>
    </div>
  );
}
