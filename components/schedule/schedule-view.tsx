"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { TimePicker } from "@/components/schedule/time-picker";
import type { BoardSlot } from "@/lib/schedule/board";

// The time picker on the Schedule tab and Home. When bookings change on
// another phone, the rest of the screen (Keenan's details, My bookings)
// refreshes too. Keenan's Schedule follows the evening he picks.
export function ScheduleView({
  board,
  today,
  windowDays,
  asSales,
  viewerId,
  initialDay,
  followDay,
  tonightOnly = false,
  hideDayHeading = false,
}: {
  board: BoardSlot[];
  today: string;
  windowDays: number;
  asSales: boolean;
  viewerId: string | null;
  initialDay?: string | null;
  followDay: boolean;
  tonightOnly?: boolean;
  hideDayHeading?: boolean;
}) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const onDayChange = useCallback(
    (day: string) => {
      if (followDay) router.replace(`/app/schedule?day=${day}`, { scroll: false });
    },
    [followDay, router],
  );
  return (
    <TimePicker
      initial={board}
      today={today}
      windowDays={windowDays}
      asSales={asSales}
      viewerId={viewerId}
      mode="book"
      initialDay={initialDay}
      tonightOnly={tonightOnly}
      hideDayHeading={hideDayHeading}
      onDayChange={onDayChange}
      onBoardChange={refresh}
    />
  );
}
