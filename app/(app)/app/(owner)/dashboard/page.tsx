import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Nothing to show yet</CardTitle>
          <CardDescription>
            The dashboard is built in milestone M6, once there are leads,
            meetings and quotes to count.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          <p>
            It will show the funnel by week and month and by sales associate,
            sold count and dollars, average ticket, lead sources, what each
            associate is owed, and sold jobs waiting to be installed. Every
            number will say what it counts and over what dates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
