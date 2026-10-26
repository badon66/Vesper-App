import { NotForYourRole } from "@/components/not-for-your-role";
import { requireProfile } from "@/lib/auth/profile";

// Everything in this group is owner only: settings, people, dashboard.
// Other roles get a plain explanation instead of the page. The data behind
// these pages is also refused by Row Level Security.
export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  if (profile.role !== "owner") {
    return <NotForYourRole />;
  }
  return <>{children}</>;
}
