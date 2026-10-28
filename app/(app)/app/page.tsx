import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { KnockCard } from "@/components/knock/knock-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSalesSide, requireProfile } from "@/lib/auth/profile";
import { lastNeighbourhood, openKnockSession } from "@/lib/leads/queries";
import { roleLabel } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Home",
};

const ownerLinks = [
  {
    href: "/app/people",
    title: "People",
    text: "Add Vesper members, reset a password, deactivate someone.",
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
  const salesSide = isSalesSide(profile);

  const supabase = await createClient();
  const session = salesSide ? await openKnockSession(supabase, profile.id) : null;
  const last = salesSide && !session ? await lastNeighbourhood(supabase, profile.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {roleLabel(profile.role)}. Signed in as {profile.email}
        </p>
      </div>

      {salesSide ? (
        <>
          <Button asChild size="lg" className="h-14 text-lg">
            <Link href="/app/leads/new">
              <Plus aria-hidden="true" />
              New lead
            </Link>
          </Button>
          <KnockCard key={session?.id ?? "none"} session={session} lastNeighbourhood={last} />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
            <CardDescription>
              Crew job sheets and timesheets arrive with the next version of Vesper.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      )}

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
      ) : null}
    </div>
  );
}
