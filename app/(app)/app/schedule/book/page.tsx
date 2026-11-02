import { redirect } from "next/navigation";

// The old Book a meeting page (M3). Booking happens in the booking sheet
// now (Keenan, 2026-11-02), so old links and home screen shortcuts land on
// Schedule, where tapping a time opens it.
export default function BookPage() {
  redirect("/app/schedule");
}
