// Matches the minimum set in the Supabase dashboard. Both must change together.
export const PASSWORD_MIN_LENGTH = 10;

// Only paths inside this app are allowed as a destination after sign-in, so a
// crafted link cannot bounce someone to another site after they log in.
export function safeNextPath(next: string | undefined | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    return next;
  }
  return "/app";
}
