import { describe, expect, it } from "vitest";
import { maySeeContact, NO_CONTACT, withContact } from "@/lib/leads/contact-rules";
import { leadAnswerList, PHONE_HIDDEN } from "@/lib/leads/door";
import { completenessLabel, questionState } from "@/lib/leads/questions";
import { leadReadiness } from "@/lib/schedule/readiness";

// Contact privacy (Keenan, 2026-11-04): a setter sees a lead's phone and
// email only on their own leads; Keenan sees every lead's. A number saved on
// someone else's lead still counts, without being shown.

const keenan = { id: "owner-1", role: "owner" };
const zane = { id: "setter-z", role: "sales" };
const other = { id: "setter-o", role: "sales" };

describe("who may see a lead's phone and email", () => {
  it("Keenan sees every lead's", () => {
    expect(maySeeContact(keenan, { created_by: other.id, assigned_to: other.id })).toBe(true);
  });

  it("a setter sees their own leads', made by them or assigned to them", () => {
    expect(maySeeContact(zane, { created_by: zane.id, assigned_to: zane.id })).toBe(true);
    expect(maySeeContact(zane, { created_by: other.id, assigned_to: zane.id })).toBe(true);
  });

  it("a setter never sees another setter's lead's, or Keenan's", () => {
    expect(maySeeContact(zane, { created_by: other.id, assigned_to: other.id })).toBe(false);
    expect(maySeeContact(zane, { created_by: keenan.id, assigned_to: keenan.id })).toBe(false);
    expect(maySeeContact(zane, { created_by: other.id, assigned_to: null })).toBe(false);
  });

  it("merges the contact found for a lead, or none", () => {
    const contacts = new Map([["lead-1", { phone: "+14035550101", email: "a@example.com" }]]);
    expect(withContact({ id: "lead-1" }, contacts)).toEqual({ id: "lead-1", phone: "+14035550101", email: "a@example.com" });
    expect(withContact({ id: "lead-2" }, contacts)).toEqual({ id: "lead-2", ...NO_CONTACT });
  });
});

describe("a number saved but not shown", () => {
  const hidden = {
    phone: null,
    phone_saved: true,
    owns_home: true,
    wants_price: true,
    both_decision_makers: true,
    christmas_lights_now: "hires" as const,
    looked_into_before: null,
    areas_wanted: null,
    install_timing: null,
    not_collected: [] as string[],
    soffit_colour: "white" as const,
    soffit_note: null,
    lat: 51.05,
    lng: -114.07,
  };

  it("still counts as collected", () => {
    expect(questionState(hidden, "phone")).toBe("answered");
    expect(completenessLabel(hidden)).toBe("5 of 6 collected");
    expect(completenessLabel({ ...hidden, phone_saved: false })).toBe("4 of 6 collected");
  });

  it("reads as saved, hidden in Find out", () => {
    const phone = leadAnswerList(hidden).find((row) => row.key === "phone");
    expect(phone?.answer).toBe(PHONE_HIDDEN);
    expect(phone?.state).toBe("answered");
  });

  it("meets Before you book's phone line", () => {
    expect(leadReadiness(hidden, 3).find((item) => item.key === "phone")?.ok).toBe(true);
    expect(leadReadiness({ ...hidden, phone_saved: false }, 3).find((item) => item.key === "phone")?.ok).toBe(false);
  });
});
