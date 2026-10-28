import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Admin",
};

// The owner's Admin tab. Pay joins People and Settings here in M3.
const sections = [
  {
    href: "/app/admin/people",
    title: "People",
    text: "Add Vesper members, reset a password, deactivate someone, or view the app as they see it.",
  },
  {
    href: "/app/admin/settings",
    title: "Settings",
    text: "Pricing, GST, setter pay, warranty wording, meeting slots, lost reasons and company details. Change your own password here too.",
  },
];

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">{section.title}</CardTitle>
                <CardDescription>{section.text}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
