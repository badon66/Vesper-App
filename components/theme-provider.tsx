"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

// Light by default, dark on request, remembered per device. The system
// preference is deliberately ignored so the app looks the same at every
// door until the user chooses otherwise.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
