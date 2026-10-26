import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { roleLabel } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Home",
};

const ownerLinks = [
  {
    href: "/app/people",
    title: "People",
    text: "Create logins for sales associates, see who is active, deactivate someone.",
  },
  {
    href: "/app/settings",
    title: "Settings",
    text: "Pricing, GST, setter pay, warranty wording, meeting slots, company details.",
  },
  {
    href: "/app/dashboard",
    title: "Dashboard",
    text: "Arrives in M6. The funnel by week, month and setter, sales, pay owed, upcoming jobs.",
  },
];

export default async function HomePage() {
  const profile = await requireProfile();
  const firstName = profile.full_name.split(" ")[0] || profile.full_name;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {roleLabel(profile.role)}. Signed in as {profile.email}
        </p>
      </div>

      {profile.role === "owner" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ownerLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription>{item.text}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to do here yet</CardTitle>
            <CardDescription>
              Your login works. The tools you will use at the door are next.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed">
            <p>
              Coming in order: lead capture and knock sessions, then booking
              meetings into Keenan&apos;s evening slots, then your pay. Each
              one arrives with its own milestone.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
