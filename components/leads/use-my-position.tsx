"use client";

import { LocateFixed } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GPS_MAX_ACCURACY_M, inCalgaryArea, type DevicePosition } from "@/lib/geo";

// "Use where I'm standing": the phone's GPS position, for a brand-new
// street Google doesn't have yet. Only read when tapped, at the door.
export function UseMyPosition({
  onPosition,
  label = "Use where I'm standing",
}: {
  onPosition: (position: DevicePosition) => void;
  label?: string;
}) {
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function locate() {
    setMessage(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setMessage("This phone can't share its position.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (found) => {
        setLocating(false);
        const { latitude, longitude, accuracy } = found.coords;
        if (accuracy > GPS_MAX_ACCURACY_M) {
          setMessage(
            `The phone's position is only accurate to about ${Math.round(accuracy)} m. Step away from the house, wait a few seconds and try again.`,
          );
          return;
        }
        if (!inCalgaryArea(latitude, longitude)) {
          setMessage("That position isn't in the Calgary area.");
          return;
        }
        onPosition({ lat: latitude, lng: longitude, accuracy: Math.round(accuracy * 10) / 10 });
      },
      (problem) => {
        setLocating(false);
        setMessage(
          problem.code === problem.PERMISSION_DENIED
            ? "Location is off for Vesper. Allow it in the phone's settings, then try again."
            : "The phone couldn't find its position. Try again in a moment.",
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" className="min-h-11 w-full sm:w-fit" disabled={locating} onClick={locate}>
        <LocateFixed aria-hidden="true" />
        {locating ? "Finding your position" : label}
      </Button>
      {message ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
