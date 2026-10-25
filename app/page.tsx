import { redirect } from "next/navigation";

// The root has nothing to show. Signed-in users land in the app and
// signed-out users are sent on to /login by proxy.ts.
export default function RootPage() {
  redirect("/app");
}
