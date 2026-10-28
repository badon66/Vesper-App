import { NotForYourRole } from "@/components/not-for-your-role";
import { requireProfile } from "@/lib/auth/profile";

// Everything in this group is owner only: Admin, with People and Settings.
// While the owner views the app as someone, that person's role applies here
// too, so they see what that person would see: not for their role.
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
