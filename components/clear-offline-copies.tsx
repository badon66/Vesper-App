"use client";

import { useEffect } from "react";
import { clearOfflineCopies } from "@/lib/offline-copies";

// Round 22: the sign-in screen takes off any offline copies left behind,
// however the last person was signed out (Sign out, a password reset that
// ended their sessions, a deactivated account).
export function ClearOfflineCopies() {
  useEffect(() => {
    void clearOfflineCopies();
  }, []);
  return null;
}
