// Live walk-through of round 20 (Keenan, 2026-11-14) against a running build.
//
// Quick edits: a throwaway setter, on a phone, double taps their own lead's
// name on Leads (no zoom, no page change), edits the phone, moves it to
// Later with a day and adds a note, and the list updates in place; a press
// and hold opens it too; a save after someone else changed the lead is
// refused with the plain words and Reopen; a single tap still opens the
// lead; another setter's lead has no quick edit. Keenan's side (the
// one-time owner session he approved, owner-session.mjs) opens it with the
// Setter picker and cancels; View as the setter, Save says "View as:
// nothing was saved." and nothing changes.
//
// Deleting a lead: Keenan's lead page ends with Delete lead; its one confirm
// names the meeting it would cancel (looked at, then Keep it); a lead with
// booking pay says why it can't go and offers Closed (not tapped); Admin >
// Deleted lists a lead the service role deleted (standing in for Keenan's
// tap), which is gone from Leads, its page and its customer's link. A
// setter's lead page has no Delete.
//
// A save never wipes something newer: on the lead page's quote editor and in
// meeting mode's Edit layer, a customer build, a booking and a signing each
// land on the link while the quote is open; Keenan's Save is then refused
// with "This quote changed since you opened it..." and the quote is checked
// unchanged. Keenan asked for exactly this test; these are the only saves
// the owner's session taps, and each one is refused before anything saves.
//
// Everything is on test leads named "TEST LEAD (automated)" and removed at
// the end. The links are handed to a throwaway setter, so no notice ever
// reaches Keenan.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The round 20 walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const VIEW_AS_COOKIE = "vesper_view_as";
const QUOTE_CHANGED = "This quote changed since you opened it. Reopen it to see the latest, then make your change.";
const LEAD_CHANGED = "This lead changed since you opened it. Reopen it to see the latest, then make your change.";
const SIGNATURE = `data:image/png;base64,${"A".repeat(300)}`;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const anon = createClient(url, anonKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const people = {
  a: { email: `r20-live-a-${stamp}@example.com`, password: `maple-river-stone-${digits}`, name: "Round Twenty A", id: null },
  b: { email: `r20-live-b-${stamp}@example.com`, password: `cedar-harbor-lantern-${digits}`, name: "Round Twenty B", id: null },
};
const STREET = `Roundtwenty${stamp}`;
const street = (n) => `${n} ${STREET} Way SW`;
const narrow = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const IPAD = { viewport: { width: 1180, height: 820 }, hasTouch: true };

const calgaryZone = (moment) => (moment.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton");
const calgaryDay = (moment = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(moment), year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const squash = (text) => (text ?? "").replace(/\s+/g, " ").trim();
const mask = (text) => String(text).replace(/\/q\/[A-Za-z0-9_-]{16,}/g, "/q/<token>");

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}
async function open(page, path) {
  await page.goto(`${base}${path}`);
  await settle(page);
}
async function signIn(page, person) {
  await open(page, "/login");
  await page.fill("#email", person.email);
  await page.fill("#password", person.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30000 });
  await settle(page);
}
async function shot(page, name) {
  await page.screenshot({ path: `${out}/r20-${name}.png` }).catch(() => {});
}

// ---------------------------------------------------------------- staging

async function makePerson(key) {
  const p = people[key];
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email,
    password: p.password,
    email_confirm: true,
    user_metadata: { full_name: p.name },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create ${key}: ${error?.message}`);
  p.id = data.user.id;
  // The first sign-in welcome has its own walk-through.
  await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", p.id);
}

async function makeLead(owner, label, n, extra = {}) {
  const { data, error } = await admin
    .from("leads")
    .insert({ first_name: TEST_LEAD, last_name: label, address_line: street(n), neighbourhood: "TEST (automated)", created_by: owner, phone: "+14035550101", ...extra })
    .select("id, updated_at")
    .single();
  if (error || !data) throw new Error(`lead ${label}: ${error?.message}`);
  return data.id;
}

const RUNS = [
  { name: "Front", feet: 60, level: "lower", part: "eave", area: "front", gable: false },
  { name: "Back", feet: 50, level: "lower", part: "eave", area: "back", gable: false },
];
const OFFERS = [
  { id: "full", name: "Full wrap", runs: [0, 1] },
  { id: "front", name: "Front only", runs: [0] },
];

async function makeQuote(leadId, ownerId) {
  const { data, error } = await admin
    .from("quotes")
    .insert({
      lead_id: leadId,
      created_by: ownerId,
      price_per_ft: 24,
      box_price: 500,
      box_count: 1,
      runs: RUNS,
      offers: OFFERS,
      total_feet: 110,
      adders: [],
      discounts: [],
      gst_rate: 0.05,
      gst_enabled: false,
      subtotal: 0,
      total: 0,
      valid_until: addDays(calgaryDay(), 14),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`quote: ${error?.message}`);
  return data.id;
}

async function makeLink(leadId, creator) {
  const token = randomBytes(18).toString("base64url");
  const { error } = await admin.from("quote_links").insert({ lead_id: leadId, token, created_by: creator });
  if (error) throw new Error(`link: ${error.message}`);
  return token;
}

async function removeEverything() {
  const ids = Object.values(people).map((p) => p.id).filter(Boolean);
  const { data: rows } = await admin.from("leads").select("id").like("address_line", `%${STREET}%`);
  const leadIds = (rows ?? []).map((row) => row.id);
  if (leadIds.length > 0) {
    await admin.from("quote_revisions").delete().in("lead_id", leadIds);
    await admin.from("earnings").delete().in("lead_id", leadIds);
    await admin.from("agreement_signatures").delete().in("lead_id", leadIds);
    await admin.from("lead_link_options").delete().in("lead_id", leadIds);
    await admin.from("slot_holds").delete().in("lead_id", leadIds);
    await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
    await admin.from("meetings").delete().in("lead_id", leadIds);
    await admin.from("quote_links").delete().in("lead_id", leadIds);
    await admin.from("quotes").delete().in("lead_id", leadIds);
    await admin.from("lead_events").delete().in("lead_id", leadIds);
    await admin.from("leads").delete().in("id", leadIds);
  }
  for (const id of ids) {
    await admin.from("meetings").update({ rebooked_as: null }).eq("host_id", id);
    await admin.from("meetings").delete().eq("host_id", id);
    await admin.from("knock_sessions").delete().eq("user_id", id);
    await admin.from("push_subscriptions").delete().eq("profile_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

async function ownerFootprint(ownerId) {
  const [profile, leads, events, settings] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).single(),
    admin.from("leads").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("lead_events").select("id").eq("actor_id", ownerId).order("id"),
    admin.from("settings").select("*").eq("id", 1).single(),
  ]);
  return JSON.stringify({ profile: profile.data, leads: leads.data, events: events.data, settings: settings.data });
}

const quoteRow = async (leadId) => (await admin.from("quotes").select("id, updated_at, offers, runs, status").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).single()).data;
const leadRow = async (id) => (await admin.from("leads").select("*").eq("id", id).single()).data;

// ---------------------------------------------------------------- the walk-through

let browser;
let ownerSession = null;
let agreementBefore;
try {
  await mkdir(out, { recursive: true });
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  const ownerId = owner.id;
  await makePerson("a");
  await makePerson("b");
  await admin.from("profiles").update({ hosts_meetings: true }).eq("id", people.b.id);

  const quick = await makeLead(people.a.id, "Quickedit", 1);
  const other = await makeLead(people.b.id, "Notyours", 2);
  const deletable = await makeLead(people.a.id, "Deletetest", 3, { assigned_to: people.a.id });
  const blocked = await makeLead(people.a.id, "Haspay", 4, { assigned_to: people.a.id });
  const gone = await makeLead(people.a.id, "Gonetest", 5);
  const stale = await makeLead(people.a.id, "Staletest", 6, { assigned_to: people.a.id });

  // An upcoming meeting on the deletable lead, on the throwaway host's evening.
  const soon = Date.now() + 3 * 3600_000;
  const b = createClient(url, anonKey, noSession);
  await b.auth.signInWithPassword({ email: people.b.email, password: people.b.password });
  const { data: bBoard } = await b.rpc("schedule_board", { p_host: people.b.id });
  const openTime = (bBoard ?? []).find((row) => row.state === "open" && new Date(row.starts_at).getTime() > soon);
  if (!openTime) throw new Error("no open time on the test host");
  await admin.from("meetings").insert({
    lead_id: deletable,
    host_id: people.b.id,
    setter_id: people.a.id,
    booked_by: people.a.id,
    starts_at: openTime.starts_at,
    ends_at: openTime.ends_at,
    everyone_deciding_present: true,
    status: "booked",
  });
  await admin.from("leads").update({ status: "meeting_booked" }).eq("id", deletable);
  await b.auth.signOut({ scope: "local" });

  // Booking pay on the blocked lead: a Qualified meeting two days ago and its fee.
  const past = new Date(Date.now() - 2 * 86_400_000);
  const met = await admin
    .from("meetings")
    .insert({ lead_id: blocked, host_id: people.b.id, setter_id: people.a.id, booked_by: people.a.id, starts_at: past.toISOString(), ends_at: new Date(past.getTime() + 45 * 60_000).toISOString(), everyone_deciding_present: true, status: "qualified" })
    .select("id")
    .single();
  await admin.from("earnings").insert({ profile_id: people.a.id, lead_id: blocked, meeting_id: met.data.id, type: "booking", rate: 20, amount: 20, status: "pending" });

  // A lead deleted (the service role standing in for Keenan's tap), with a link.
  await makeQuote(gone, ownerId);
  const goneToken = await makeLink(gone, people.a.id);
  const goneDelete = await admin.rpc("lead_soft_delete", { p_lead: gone });
  if (goneDelete.error) throw new Error(`delete: ${goneDelete.error.message}`);

  // The quote that changes under Keenan's editor.
  await makeQuote(stale, ownerId);
  const staleToken = await makeLink(stale, people.a.id);
  const { data: settings } = await admin.from("settings").select("agreement_text").eq("id", 1).single();
  let signingReady = false;
  if (settings?.agreement_text?.trim()) signingReady = true;
  else {
    const { count } = await admin.from("lead_link_options").select("lead_id", { count: "exact", head: true }).eq("agreement_to_sign", true);
    if ((count ?? 0) === 0) {
      agreementBefore = settings?.agreement_text ?? null;
      await admin.from("settings").update({ agreement_text: `TEST agreement ${stamp} (automated check, removed right after).` }).eq("id", 1);
      signingReady = true;
    }
  }
  if (signingReady) await admin.from("lead_link_options").insert({ lead_id: stale, agreement_to_sign: true });

  browser = await chromium.launch();

  // ---------------------------------------------------------------- quick edit, setter A on a phone
  {
    const context = await browser.newContext(narrow);
    const page = await context.newPage();
    await signIn(page, people.a);
    await open(page, `/app/leads?who=everyone&q=${STREET}`);
    const name = page.locator(`[data-testid="quick-edit-name"][data-lead="${quick}"]`);
    check("setter's own lead's name carries the quick edit", (await name.count()) === 1);
    check("another setter's lead's name doesn't", (await page.locator(`[data-testid="quick-edit-name"][data-lead="${other}"]`).count()) === 0);
    const touch = await name.evaluate((el) => getComputedStyle(el).touchAction).catch(() => "");
    check("a double tap on the name can't zoom the page (touch-action: manipulation)", touch === "manipulation", touch);

    const before = page.url();
    await name.tap();
    await page.waitForTimeout(90);
    await name.tap();
    const dialog = page.getByTestId("quick-edit");
    await dialog.getByTestId("quick-edit-form").waitFor({ timeout: 15000 }).catch(() => {});
    const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    check("double tap opens the pop-up, stays on Leads and doesn't zoom", (await dialog.getByTestId("quick-edit-form").isVisible().catch(() => false)) && page.url() === before && scale === 1, `scale ${scale}`);
    check(
      "the pop-up holds the name, phone, email, address, tab, follow-up and a note; no Setter for a setter",
      (await dialog.getByTestId("quick-edit-first").inputValue()) === TEST_LEAD &&
        (await dialog.getByTestId("quick-edit-phone").inputValue()).replace(/\D/g, "").endsWith("4035550101") &&
        (await dialog.locator('input[name="address_line"]').inputValue()) === street(1) &&
        (await dialog.getByTestId("quick-edit-tab-active").getAttribute("aria-checked")) === "true" &&
        (await dialog.getByTestId("quick-edit-tab-met").isDisabled()) &&
        (await dialog.getByTestId("quick-edit-setter").count()) === 0,
    );
    await shot(page, "quick-edit-phone");
    const day = addDays(calgaryDay(), 3);
    await dialog.getByTestId("quick-edit-phone").fill("403 555 0177");
    await dialog.getByTestId("quick-edit-tab-later").click();
    await dialog.getByTestId("quick-edit-follow-up").fill(day);
    await dialog.getByLabel("Add a note").fill(`Quick edit note ${stamp}`);
    await dialog.getByTestId("quick-edit-save").click();
    await dialog.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    await settle(page);
    const saved = await leadRow(quick);
    const { data: contact } = await admin.from("leads").select("phone").eq("id", quick).single();
    const { data: notes } = await admin.from("lead_events").select("payload").eq("lead_id", quick).eq("type", "note");
    check(
      "Save updates it in place: still on Leads, phone, Later with the day, and the note saved",
      page.url() === before && contact?.phone === "+14035550177" && saved.status === "follow_up" && saved.follow_up_on === day && (notes ?? []).some((n) => n.payload?.text === `Quick edit note ${stamp}`),
      `${saved.status} ${saved.follow_up_on} ${contact?.phone}`,
    );

    // Press and hold, then someone else's change lands before Save.
    const box = await name.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await name.dispatchEvent("pointerdown", { pointerType: "touch", clientX: x, clientY: y, isPrimary: true, button: 0 });
    await page.waitForTimeout(700);
    await name.dispatchEvent("pointerup", { pointerType: "touch", clientX: x, clientY: y, isPrimary: true, button: 0 });
    await dialog.getByTestId("quick-edit-form").waitFor({ timeout: 15000 }).catch(() => {});
    check("press and hold opens it too", await dialog.getByTestId("quick-edit-form").isVisible().catch(() => false));
    await admin.from("leads").update({ last_name: "Changed elsewhere" }).eq("id", quick);
    await dialog.getByLabel("Last name").fill("Mine");
    await dialog.getByTestId("quick-edit-save").click();
    await dialog.getByTestId("quick-edit-error").waitFor({ timeout: 15000 }).catch(() => {});
    const staleText = squash(await dialog.getByTestId("quick-edit-error").innerText().catch(() => ""));
    check(
      "a save after someone else changed the lead is refused, in plain words, with Reopen",
      staleText.includes(LEAD_CHANGED) && (await dialog.getByTestId("quick-edit-reopen").count()) === 1 && (await leadRow(quick)).last_name === "Changed elsewhere",
      staleText,
    );
    await dialog.getByTestId("quick-edit-reopen").click();
    await dialog.getByTestId("quick-edit-form").waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    check("Reopen shows the latest", (await dialog.getByLabel("Last name").inputValue()) === "Changed elsewhere");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});

    await name.tap();
    await page.waitForURL(`**/app/leads/${quick}`, { timeout: 15000 }).catch(() => {});
    check("a single tap on the name still opens the lead", page.url().endsWith(`/app/leads/${quick}`));
    await settle(page);
    check("a setter's lead page has no Delete lead", (await page.getByTestId("delete-lead").count()) === 0);
    await context.close();
  }

  // ---------------------------------------------------------------- Keenan's side (looks; the only taps on Save are refused ones)
  const ownerBefore = await ownerFootprint(ownerId);
  const context = await browser.newContext(IPAD);
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context });
  const page = await context.newPage();
  // Meeting mode asks before leaving with unsaved changes; the walk-through
  // leaves on purpose between its checks.
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));

  // Quick edit as Keenan: the Setter picker, then Cancel.
  await open(page, `/app/leads?q=${STREET}`);
  const ownerName = page.locator(`[data-testid="quick-edit-name"][data-lead="${other}"]`);
  await ownerName.dblclick();
  const ownerDialog = page.getByTestId("quick-edit");
  await ownerDialog.getByTestId("quick-edit-form").waitFor({ timeout: 15000 }).catch(() => {});
  const setterOptions = await ownerDialog.getByTestId("quick-edit-setter").locator("option").allInnerTexts().catch(() => []);
  check("Keenan's pop-up (any lead) has the Setter picker; Met is his to pick", setterOptions.some((o) => o.includes(people.b.name)) && !(await ownerDialog.getByTestId("quick-edit-tab-met").isDisabled()), setterOptions.join(" | "));
  await ownerDialog.getByRole("button", { name: "Cancel" }).click();
  check("the deleted lead isn't on Leads", (await page.locator(`a[href="/app/leads/${gone}"]`).count()) === 0);

  // Delete lead at the very bottom, its confirm looked at only.
  await open(page, `/app/leads/${deletable}`);
  const section = page.getByTestId("delete-lead");
  const last = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="delete-lead"]');
    if (!el) return false;
    const below = [...document.querySelectorAll("main *")].filter((n) => n.getBoundingClientRect().top > el.getBoundingClientRect().bottom + 1 && n.getBoundingClientRect().height > 0);
    return below.length === 0;
  });
  check("Delete lead sits at the very bottom of the lead page, below everything", (await section.count()) === 1 && last);
  await section.getByTestId("delete-lead-button").click();
  const confirm = page.getByTestId("delete-lead-confirm");
  await confirm.locator("h2").waitFor({ timeout: 5000 }).catch(() => {});
  const confirmText = squash(await confirm.innerText().catch(() => ""));
  check(
    "it asks once, in Keenan's words, and names the meeting it would cancel",
    confirmText.includes(`Delete ${TEST_LEAD} Deletetest?`) &&
      confirmText.includes("It moves to Deleted for 30 days, then it's gone for good.") &&
      /Its meeting .+ will be cancelled and the time freed up\./.test(confirmText),
    confirmText.slice(0, 260),
  );
  await shot(page, "delete-confirm");
  await confirm.getByRole("button", { name: "Keep it" }).click();
  check("Keep it leaves the lead as it was", (await leadRow(deletable)).deleted_at === null);

  await open(page, `/app/leads/${blocked}`);
  const why = squash(await page.getByTestId("delete-lead-why").innerText().catch(() => ""));
  check(
    "a lead with booking pay says why it can't be deleted and offers Closed (not tapped)",
    why.includes("This lead has booking pay or commission, so it can't be deleted.") && (await page.getByTestId("delete-lead-close").count()) === 1 && (await page.getByTestId("delete-lead-button").isDisabled()),
    why,
  );

  await open(page, "/app/admin");
  check("Admin has Deleted", (await page.locator('a[href="/app/admin/deleted"]').count()) === 1);
  await open(page, "/app/admin/deleted");
  const row = page.locator(`[data-testid="deleted-lead"][data-lead-id="${gone}"]`);
  const rowText = squash(await row.innerText().catch(() => ""));
  check("Deleted lists it with Restore and the day it's gone for good", rowText.includes("Gonetest") && rowText.includes("Gone for good after") && (await row.getByTestId("restore-lead").count()) === 1, rowText);
  await shot(page, "deleted-list");
  const goneResponse = await page.goto(`${base}/app/leads/${gone}`);
  await settle(page);
  check("its page is gone", goneResponse?.status() === 404 || (await page.getByText("could not be found", { exact: false }).count()) > 0 || (await page.getByText("not found", { exact: false }).count()) > 0, String(goneResponse?.status()));
  const customer = await browser.newContext(narrow);
  const customerPage = await customer.newPage();
  await customerPage.goto(`${base}/q/${goneToken}`);
  await settle(customerPage);
  const customerText = squash(await customerPage.locator("main").innerText().catch(() => ""));
  check("its customer's link stops working: closed, no prices", /closed|expired/i.test(customerText) && !/\$\d/.test(customerText), mask(customerText.slice(0, 120)));
  await customer.close();

  // ---------------------------------------------------------------- a save never wipes something newer
  const landings = [
    { key: "build", run: async () => anon.rpc("quote_link_book_custom", { p_token: staleToken, p_runs: [0], p_from: "full" }) },
    { key: "booking", run: async () => anon.rpc("quote_link_book_offer", { p_token: staleToken, p_offer: "front" }) },
    {
      key: "signing",
      run: async () => {
        await admin.from("agreement_signatures").delete().eq("lead_id", stale);
        return anon.rpc("quote_link_sign_agreement", { p_token: staleToken, p_name: "Jane Testsigner", p_offer: "full", p_signature: SIGNATURE });
      },
    },
  ];
  for (const place of ["lead", "meeting"]) {
    for (const landing of landings) {
      if (landing.key === "signing" && !signingReady) {
        note(`signing on the ${place === "lead" ? "lead page" : "Edit layer"} not run: Settings has no agreement and a real lead is waiting on it`);
        continue;
      }
      let layer;
      let save;
      let message;
      // A fresh page each time, as Keenan reopening it would have.
      await page.goto("about:blank");
      if (place === "lead") {
        await page.goto(`${base}/app/leads/${stale}#edit-quote`);
        await settle(page);
        layer = page.getByTestId("quote-sheet");
        await layer.waitFor({ timeout: 15000 }).catch(() => {});
        save = layer.getByTestId("quote-sheet-save");
        message = layer.getByTestId("quote-sheet-message");
      } else {
        await page.goto(`${base}/meeting/${stale}#start`);
        await page.locator('ol[aria-label="Where you are"]').waitFor({ timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(800);
        const priceLabel = await page.locator('section[data-page="quote"]').getAttribute("aria-label").catch(() => null);
        const dotLabels = await page.locator('ol[aria-label="Where you are"] button').evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label"))).catch(() => []);
        if (!dotLabels.includes(priceLabel)) {
          await shot(page, `meeting-${landing.key}-stuck`);
          note(`meeting mode before ${landing.key}: price "${priceLabel}", dots ${JSON.stringify(dotLabels)}, layer ${await page.getByTestId("quote-edit-layer").count()}, url ${page.url().replace(base, "")}`);
        }
        if (priceLabel) await page.locator('ol[aria-label="Where you are"]').getByRole("button", { name: priceLabel, exact: true }).click({ timeout: 10000 });
        await page.waitForTimeout(600);
        await page.locator('section[data-page="quote"]').getByTestId("price-edit").click();
        layer = page.getByTestId("quote-edit-layer");
        await layer.waitFor({ timeout: 10000 }).catch(() => {});
        save = layer.getByTestId("quote-edit-save");
        message = layer.getByTestId("quote-edit-message");
      }
      await page.waitForTimeout(500);
      await layer.getByTestId("offer-name").first().fill(`Full wrap ${landing.key}`);
      await page.waitForTimeout(300);
      const landed = await landing.run();
      const ok = !landed.error && (landed.data?.ok ?? true);
      const afterLanding = await quoteRow(stale);
      await save.click();
      await message.waitFor({ timeout: 15000 }).catch(() => {});
      const said = squash(await message.innerText().catch(() => ""));
      const afterSave = await quoteRow(stale);
      check(
        `${place === "lead" ? "lead page" : "meeting mode's Edit layer"}: a customer ${landing.key} mid-edit stops Keenan's save, in plain words, and the quote stays as the customer left it`,
        ok && said === QUOTE_CHANGED && afterSave.updated_at === afterLanding.updated_at && JSON.stringify(afterSave.offers) === JSON.stringify(afterLanding.offers),
        `${landed.error?.message ?? JSON.stringify(landed.data ?? {}).slice(0, 80)} | ${said}`,
      );
      if (landing.key === "build" && place === "lead") await shot(page, "stale-lead-page");
      if (landing.key === "build" && place === "meeting") await shot(page, "stale-edit-layer");
    }
  }

  // ---------------------------------------------------------------- View as the setter: the pop-up saves nothing
  const viewPage = page;
  await viewPage.setViewportSize({ width: 390, height: 844 });
  await open(viewPage, "/app/admin/people");
  await viewPage.locator("tr", { hasText: people.a.email }).getByRole("button", { name: "View as" }).click();
  await viewPage.waitForURL("**/app", { timeout: 30000 });
  await settle(viewPage);
  await open(viewPage, `/app/leads?q=${STREET}`);
  const viewName = viewPage.locator(`[data-testid="quick-edit-name"][data-lead="${quick}"]`);
  const viewBefore = (await leadRow(quick)).updated_at;
  await viewName.dblclick();
  const viewDialog = viewPage.getByTestId("quick-edit");
  await viewDialog.getByTestId("quick-edit-form").waitFor({ timeout: 15000 }).catch(() => {});
  check("View as: the pop-up opens on the setter's own lead, as they'd see it", (await viewDialog.getByTestId("quick-edit-setter").count()) === 0 && (await viewDialog.getByTestId("quick-edit-form").count()) === 1);
  await viewDialog.getByLabel("Last name").fill("Viewas");
  await viewDialog.getByTestId("quick-edit-save").click();
  await viewDialog.getByTestId("quick-edit-view-as").waitFor({ timeout: 10000 }).catch(() => {});
  check(
    "View as: Save says \"View as: nothing was saved.\", calmly, and nothing changes",
    squash(await viewDialog.getByTestId("quick-edit-view-as").innerText().catch(() => "")) === "View as: nothing was saved." && (await leadRow(quick)).updated_at === viewBefore,
  );
  await open(viewPage, "/app");
  await viewPage.getByRole("status").filter({ hasText: "Viewing as" }).getByRole("button", { name: "Exit" }).click();
  await viewPage.waitForURL("**/app/admin/people", { timeout: 20000 }).catch(() => {});
  check("Exit ends View as", !(await context.cookies()).some((cookie) => cookie.name === VIEW_AS_COOKIE));

  await ownerSession.close();
  ownerSession = null;
  await context.close();
  const ownerAfter = await ownerFootprint(ownerId);
  const changedKeys = Object.keys(JSON.parse(ownerBefore)).filter((key) => JSON.stringify(JSON.parse(ownerBefore)[key]) !== JSON.stringify(JSON.parse(ownerAfter)[key]));
  const settingsKeys = changedKeys.includes("settings")
    ? Object.keys(JSON.parse(ownerBefore).settings).filter((key) => JSON.stringify(JSON.parse(ownerBefore).settings[key]) !== JSON.stringify(JSON.parse(ownerAfter).settings[key]))
    : [];
  check("nothing of the owner's changed", ownerAfter === ownerBefore, `${changedKeys.join(", ")} ${settingsKeys.join(", ")}`);
} catch (error) {
  check("walk-through ran to the end", false, mask(error?.stack ?? error));
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (agreementBefore !== undefined) {
    await admin.from("settings").update({ agreement_text: agreementBefore }).eq("id", 1).like("agreement_text", "TEST agreement %");
  }
  await removeEverything().catch((error) => note(`cleanup: ${error?.message}`));
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).like("address_line", `%${STREET}%`);
  check("cleanup left no test leads", (count ?? 0) === 0);
  for (const line of results) console.log(mask(line));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`${results.filter((line) => line.startsWith("PASS")).length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
