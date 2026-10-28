import { NotForYourRole } from "@/components/not-for-your-role";
import { isSalesSide, requireProfile } from "@/lib/auth/profile";

// Leads are for the admin and sales associates. The database refuses the
// data to anyone else as well.
export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (!isSalesSide(profile)) {
    return <NotForYourRole message="Leads are for the admin and sales associates." />;
  }
  return <>{children}</>;
}
