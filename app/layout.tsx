import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Vesper",
    template: "%s | Vesper",
  },
  description: "Internal sales app for Vesper Lighting.",
  applicationName: "Vesper",
  appleWebApp: {
    capable: true,
    title: "Vesper",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Updated at runtime by ThemeToggle when the user switches theme.
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
