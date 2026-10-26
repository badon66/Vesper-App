import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

const reasonMessages: Record<string, string> = {
  deactivated:
    "This account has been deactivated. Talk to Keenan if you think that is a mistake.",
  no_profile:
    "This account is not set up yet. Talk to Keenan.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; reason?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const notice = reason ? reasonMessages[reason] : undefined;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use the email and password Keenan set up for you. There is no sign-up.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {notice ? (
          <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
            {notice}
          </p>
        ) : null}
        <LoginForm next={next} />
      </CardContent>
    </Card>
  );
}
