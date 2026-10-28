import { STATUS_LABELS, type LeadStatus } from "@/lib/leads/status";
import type { Database, Json } from "@/types/database";

export type TimelineEvent = {
  type: Database["public"]["Enums"]["event_type"];
  from_status: LeadStatus | null;
  to_status: LeadStatus | null;
  payload: Json | null;
};

const FIELD_LABELS: Record<string, string> = {
  first_name: "name",
  last_name: "name",
  phone: "phone",
  email: "email",
  address_line: "address",
  city: "city",
  postal_code: "postal code",
  neighbourhood: "neighbourhood",
  lat: "map position",
  lng: "map position",
  place_id: "map position",
  house_type: "house type",
  soffit_colour: "soffit colour",
  soffit_note: "soffit colour",
  est_feet: "estimated feet",
  notes: "notes",
  source: "source",
  assigned_to: "setter",
};

function payloadObject(payload: Json | null): { [key: string]: Json | undefined } {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// One plain sentence per timeline entry. Notes are returned as written.
export function describeEvent(event: TimelineEvent): string {
  const payload = payloadObject(event.payload);
  switch (event.type) {
    case "created":
      return "Added the lead.";
    case "status_change": {
      const from = event.from_status ? STATUS_LABELS[event.from_status] : "no status";
      const to = event.to_status ? STATUS_LABELS[event.to_status] : "no status";
      const reason =
        typeof payload.reason === "string" && payload.reason ? ` Reason: ${payload.reason}.` : "";
      return `Moved from ${from} to ${to}.${reason}`;
    }
    case "note":
      return typeof payload.text === "string" ? payload.text : "Added a note.";
    case "photo_added":
      return "Added a photo.";
    case "edited": {
      const fields = Array.isArray(payload.fields)
        ? payload.fields.filter((field): field is string => typeof field === "string")
        : [];
      const labels = Array.from(new Set(fields.map((field) => FIELD_LABELS[field] ?? field.replace(/_/g, " "))));
      return labels.length > 0 ? `Changed the ${joinList(labels)}.` : "Edited the lead.";
    }
    default: {
      const words = event.type.replace(/_/g, " ");
      return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
    }
  }
}
