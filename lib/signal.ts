import { timed } from "@/lib/answer-within";

// Round 22 (Keenan, 2026-11-15): whether the phone can reach the app right
// now. Not offline by the phone's own account, and the app's version check
// answers within a few seconds. Used before a screen moves on after a save,
// so a page that would need signal to open is never opened without it.
export async function hasSignal(within = 5_000): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const response = await timed(fetch("/api/version", { cache: "no-store" }), within);
    return response.ok;
  } catch {
    return false;
  }
}
