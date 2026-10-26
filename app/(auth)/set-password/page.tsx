import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = {
  title: "Set your password",
};

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Set your password</CardTitle>
        <CardDescription>
          The password you were texted was temporary. Choose your own, at least{" "}
          {PASSWORD_MIN_LENGTH} characters. You will use it every time you sign
          in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SetPasswordForm />
      </CardContent>
    </Card>
  );
}
