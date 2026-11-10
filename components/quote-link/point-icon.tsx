import { Check, Clock, House, Lightbulb, Paintbrush, Plug, ShieldCheck, Smartphone, Snowflake, Sun, Wrench, Zap, type LucideIcon } from "lucide-react";
import type { PointIcon } from "@/lib/quote-link/view";

// The line icons a product point can carry (Settings offers these). Drawn
// from one library, one stroke weight, navy.
const ICONS: Record<PointIcon, LucideIcon> = {
  lightbulb: Lightbulb,
  house: House,
  zap: Zap,
  smartphone: Smartphone,
  plug: Plug,
  "shield-check": ShieldCheck,
  paintbrush: Paintbrush,
  sun: Sun,
  snowflake: Snowflake,
  wrench: Wrench,
  clock: Clock,
  check: Check,
};

// What Settings calls each one.
export const POINT_ICON_NAMES: Record<PointIcon, string> = {
  lightbulb: "Light bulb",
  house: "House",
  zap: "Lightning bolt",
  smartphone: "Phone",
  plug: "Plug",
  "shield-check": "Shield",
  paintbrush: "Paintbrush",
  sun: "Sun",
  snowflake: "Snowflake",
  wrench: "Wrench",
  clock: "Clock",
  check: "Tick",
};

export function PointIconMark({ icon, className }: { icon: PointIcon; className?: string }) {
  const Icon = ICONS[icon] ?? Check;
  return <Icon aria-hidden="true" strokeWidth={1.5} className={className} />;
}
