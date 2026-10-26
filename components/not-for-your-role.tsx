import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Shown in place of a page when a signed-in user's role does not include it.
// The database refuses the data too; this is only the polite version.
export function NotForYourRole() {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Not for your role</CardTitle>
        <CardDescription>
          This part of Vesper is for the admin. If you think you need it, talk
          to Keenan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href="/app">Back to home</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
