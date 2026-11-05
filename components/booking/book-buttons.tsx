"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { bookingSheet } from "@/lib/booking/sheet-store";

// The ways into the booking sheet from outside the schedule (Keenan,
// 2026-11-02): a lead's Book a meeting, New lead's Save and book (which lands
// on the lead page with ?book=1), and a booking's Move.

export function BookLeadButton({ leadId, className = "w-fit" }: { leadId: string; className?: string }) {
  return (
    <Button type="button" className={className} onClick={() => bookingSheet.open({ kind: "lead", leadId })}>
      Book a meeting
    </Button>
  );
}

// Opens the sheet once when the page arrives with ?book=1, then drops the
// flag so a reload or the back button doesn't open it again.
export function OpenBookingSheet({ leadId, backToSession = false }: { leadId: string; backToSession?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    bookingSheet.open(backToSession ? { kind: "lead", leadId, backTo: "session" } : { kind: "lead", leadId });
    router.replace(pathname, { scroll: false });
  }, [leadId, pathname, router, backToSession]);
  return null;
}

export function MoveBookingButton({
  meetingId,
  leadId,
  leadName,
  from,
  disabled,
}: {
  meetingId: string;
  leadId: string;
  leadName: string;
  from: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11"
      disabled={disabled}
      onClick={() => bookingSheet.open({ kind: "move", meetingId, leadId, leadName, from })}
    >
      Move
    </Button>
  );
}
