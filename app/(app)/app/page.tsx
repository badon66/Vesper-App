import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Home",
};

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email =
    typeof data?.claims.email === "string" ? data.claims.email : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Home</h1>
        {email ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {email}
          </p>
        ) : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nothing to do here yet</CardTitle>
          <CardDescription>
            This is the foundation release. It proves sign-in, the themes and
            installing the app on a phone.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          <p>
            What will appear here, in order: people and settings for Keenan,
            then lead capture and knock sessions for setters, then tonight&apos;s
            meetings and booking. Each one arrives with its own milestone in
            the roadmap.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
