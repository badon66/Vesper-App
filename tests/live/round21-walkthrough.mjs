// Live walk-through of round 21 (Keenan, 2026-11-15) against a running build:
// the lead page, tight and useful at the top.
//
// Keenan's side (the one-time owner session he approved, owner-session.mjs,
// looking only): a lead with everything filled in (a meeting tomorrow with a
// "someone who decides won't be there" warning, a quote booked on their
// link and opened three times, a site visit), a nearly empty one and a sold
// one, on an iPad in landscape (1180 x 820) and portrait (820 x 1180) and on
// a phone (390 x 844). Two columns on the iPad, At a glance top right with
// only the lines that apply; stacked in the same order on the phone; short
// cards side by side in landscape; nothing cut off, no sideways scroll,
// every tap target at least 44 px. The status dropdown shows Meeting booked,
// Sold and Installed with what sets them.
//
// A throwaway setter, on a phone, changes the status from the dropdown on
// their own lead: the follow-up day moved, a change made elsewhere meanwhile
// refused in plain words with Reopen, Clear back to New, then Lost with a
// reason; another setter's lead has the dropdown off. View as the setter,
// a change says "View as: nothing was saved." and nothing changes.
//
// Everything is on test leads named "TEST LEAD (automated)" and removed at
// the end. The link is handed to a throwaway setter, so no notice ever
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
  console.error("The round 21 walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const VIEW_AS_COOKIE = "vesper_view_as";
const LEAD_CHANGED = "This lead changed since you opened it. Reopen it to see the latest, then make your change.";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const anon = createClient(url, anonKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const people = {
  a: { email: `r21-live-a-${stamp}@example.com`, password: `maple-river-stone-${digits}`, name: "Round Twentyone A", id: null },
  b: { email: `r21-live-b-${stamp}@example.com`, password: `cedar-harbor-lantern-${digits}`, name: "Round Twentyone B", id: null },
};
const STREET = `Roundtwentyone${stamp}`;
const street = (n) => `${n} ${STREET} Way SW`;
const LANDSCAPE = { width: 1180, height: 820 };
const PORTRAIT = { width: 820, height: 1180 };
const PHONE = { width: 390, height: 844 };

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
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const box = (page, selector) => page.locator(selector).first().boundingBox();

// Every control inside `selector` at least 44 px each way.
function smallTargets(page, selector) {
  return page.evaluate((root) => {
    const offenders = [];
    for (const scope of document.querySelectorAll(root)) {
      for (const element of scope.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary')) {
        if (element.closest('[aria-hidden="true"]')) continue;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const r = element.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        if (r.width < 44 || r.height < 44) offenders.push(`${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return offenders;
  }, selector);
}

// Text that runs past its own box (cut off), inside the top.
function clipped(page, selector) {
  return page.evaluate((root) => {
    const bad = [];
    for (const scope of document.querySelectorAll(root)) {
      for (const el of scope.querySelectorAll("*")) {
        const style = getComputedStyle(el);
        if (style.overflow === "visible" && style.textOverflow !== "ellipsis") continue;
        if (el.scrollWidth > el.clientWidth + 1 && style.textOverflow !== "ellipsis" && el.tagName !== "SELECT") {
          bad.push(`${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 30)}"`);
        }
      }
    }
    return bad;
  }, selector);
}

async function shotTop(page, name) {
  const top = await page.locator('[data-testid="lead-top"]').boundingBox();
  if (!top) return;
  const height = Math.min(top.y + top.height + 24, (page.viewportSize()?.height ?? 820) + 400);
  await page.screenshot({ path: `${out}/r21-${name}.png`, clip: { x: 0, y: 0, width: page.viewportSize().width, height } }).catch(() => {});
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
  await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", p.id);
}

const FULL_ANSWERS = {
  lat: 51.0447,
  lng: -114.0719,
  position_source: "picked",
  place_id: "TEST-place (automated)",
  phone: "+14035550144",
  email: `full-${stamp}@example.com`,
  owns_home: true,
  wants_price: true,
  both_decision_makers: false,
  christmas_lights_now: "hires",
  looked_into_before: "got_quotes",
  soffit_colour: "white",
  house_type: "two_storey",
  setter_read: "hot",
  hot_buttons: ["curb_appeal"],
  notes: "TEST note (automated). Wants it up before the 1st.",
};

async function makeLead(owner, label, n, extra = {}) {
  const { data, error } = await admin
    .from("leads")
    .insert({ first_name: TEST_LEAD, last_name: label, address_line: street(n), neighbourhood: "TEST (automated)", created_by: owner, ...extra })
    .select("id")
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

async function removeEverything() {
  const ids = Object.values(people).map((p) => p.id).filter(Boolean);
  const { data: rows } = await admin.from("leads").select("id").like("address_line", `%${STREET}%`);
  const leadIds = (rows ?? []).map((row) => row.id);
  if (leadIds.length > 0) {
    await admin.from("quote_revisions").delete().in("lead_id", leadIds);
    await admin.from("earnings").delete().in("lead_id", leadIds);
    await admin.from("agreement_signatures").delete().in("lead_id", leadIds);
    await admin.from("lead_link_options").delete().in("lead_id", leadIds);
    await admin.from("lead_site_visits").delete().in("lead_id", leadIds);
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

const leadRow = async (id) => (await admin.from("leads").select("*").eq("id", id).single()).data;

// ---------------------------------------------------------------- the walk-through

let browser;
let ownerSession = null;
try {
  await mkdir(out, { recursive: true });
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  const ownerId = owner.id;
  await makePerson("a");
  await makePerson("b");
  await admin.from("profiles").update({ hosts_meetings: true }).eq("id", people.b.id);
  const { data: white } = await admin.from("track_colours").select("id").eq("active", true).order("sort_order").limit(1).single();

  // Everything filled in.
  const full = await makeLead(people.a.id, "Everything", 1, { ...FULL_ANSWERS, assigned_to: people.a.id });
  await admin.from("leads").update({ track_colour_id: white.id }).eq("id", full);
  const b = createClient(url, anonKey, noSession);
  await b.auth.signInWithPassword({ email: people.b.email, password: people.b.password });
  const { data: board } = await b.rpc("schedule_board", { p_host: people.b.id });
  const tomorrow = addDays(calgaryDay(), 1);
  const openTime =
    (board ?? []).find((row) => row.state === "open" && calgaryDay(new Date(row.starts_at)) === tomorrow) ??
    (board ?? []).find((row) => row.state === "open" && new Date(row.starts_at).getTime() > Date.now() + 3 * 3600_000);
  await b.auth.signOut({ scope: "local" });
  if (!openTime) throw new Error("no open time on the test host");
  const booked = await admin.from("meetings").insert({
    lead_id: full,
    host_id: people.b.id,
    setter_id: people.a.id,
    booked_by: people.a.id,
    starts_at: openTime.starts_at,
    ends_at: openTime.ends_at,
    everyone_deciding_present: true,
    status: "booked",
    photos_skipped: "homeowner_said_no",
  });
  if (booked.error) note(`meeting: ${booked.error.message}`);
  await admin.from("meetings").update({ everyone_deciding: "no" }).eq("lead_id", full);
  await admin.from("leads").update({ status: "meeting_booked" }).eq("id", full);
  await makeQuote(full, ownerId);
  const token = randomBytes(18).toString("base64url");
  await admin.from("quote_links").insert({ lead_id: full, token, created_by: people.a.id });
  const bookedOffer = await anon.rpc("quote_link_book_offer", { p_token: token, p_offer: "front" });
  if (bookedOffer.error) note(`book offer: ${bookedOffer.error.message}`);
  await admin.from("quote_links").update({ view_count: 3, last_viewed_at: new Date().toISOString() }).eq("token", token);
  const visitDay = addDays(calgaryDay(), 5);
  await admin.from("lead_site_visits").insert({ lead_id: full, visit_on: visitDay });

  // Nearly empty: a name and an address.
  const empty = await makeLead(people.a.id, "Nearlyempty", 2);
  // Sold, with an install day.
  const sold = await makeLead(people.a.id, "Soldone", 3, { ...FULL_ANSWERS, both_decision_makers: true, assigned_to: people.a.id });
  await admin.from("leads").update({ track_colour_id: white.id }).eq("id", sold);
  const soldQuote = await makeQuote(sold, ownerId);
  const accepted = await admin.rpc("quote_accept_offer", { p_quote: soldQuote, p_offer: "full" });
  if (accepted.error) note(`accept: ${accepted.error.message}`);
  await admin.from("leads").update({ install_on: addDays(calgaryDay(), 9) }).eq("id", sold);
  // The setter's own lead in Follow up, and another setter's lead.
  const follow = await makeLead(people.a.id, "Followme", 4, { assigned_to: people.a.id });
  await admin.from("leads").update({ status: "follow_up", follow_up_on: addDays(calgaryDay(), 2) }).eq("id", follow);
  const others = await makeLead(people.b.id, "Notyours", 5);

  browser = await chromium.launch();

  // ---------------------------------------------------------------- Keenan's view, looking only
  const ownerBefore = await ownerFootprint(ownerId);
  const context = await browser.newContext({ viewport: LANDSCAPE, hasTouch: true });
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));

  for (const [label, size] of [
    ["landscape", LANDSCAPE],
    ["portrait", PORTRAIT],
  ]) {
    await page.setViewportSize(size);
    await open(page, `/app/leads/${full}`);
    const left = await box(page, '[data-testid="lead-top"] > div');
    const panel = await box(page, '[data-testid="at-a-glance"]');
    check(
      `iPad ${label}: the top is two columns, At a glance on the right beside the name`,
      left !== null && panel !== null && panel.x > left.x + left.width - 1 && Math.abs(panel.y - left.y) < 8,
      JSON.stringify({ left, panel }),
    );
    const lines = await page.locator('[data-testid="at-a-glance"] [data-testid^="glance-"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid")));
    check(
      `iPad ${label}: At a glance shows status, the meeting, the quote, their link, the site visit and the warning`,
      ["glance-status", "glance-meeting", "glance-quote", "glance-link", "glance-site-visit", "glance-everyone"].every((line) => lines.includes(line)) &&
        !lines.includes("glance-install") &&
        !lines.includes("glance-to-finish"),
      lines.join(", "),
    );
    check(`iPad ${label}: nothing sideways`, (await sideways(page)) <= 0);
    const small = await smallTargets(page, '[data-testid="lead-top"]');
    check(`iPad ${label}: every tap target at the top is at least 44 px`, small.length === 0, small.join("; "));
    const cut = await clipped(page, '[data-testid="lead-top"]');
    check(`iPad ${label}: nothing at the top is cut off`, cut.length === 0, cut.join("; "));
    await shotTop(page, `full-ipad-${label}`);
    await page.screenshot({ path: `${out}/r21-full-page-${label}.png`, fullPage: true }).catch(() => {});

    const findOut = await box(page, "#find-out");
    const door = await box(page, '[data-testid="setter-notes"]');
    if (label === "landscape") {
      check("landscape: short cards side by side (Find out beside From the door)", findOut !== null && door !== null && Math.abs(findOut.y - door.y) < 4 && door.x > findOut.x + 100, JSON.stringify({ findOut, door }));
    } else {
      check("portrait: the cards stack", findOut !== null && door !== null && door.y > findOut.y + findOut.height - 1);
    }
  }

  await page.setViewportSize(LANDSCAPE);
  await open(page, `/app/leads/${full}`);
  const glance = page.getByTestId("at-a-glance");
  const meetingText = squash(await glance.getByTestId("glance-meeting").innerText());
  const quoteText = squash(await glance.getByTestId("glance-quote").innerText());
  const linkText = squash(await glance.getByTestId("glance-link").innerText());
  const everyoneText = squash(await glance.getByTestId("glance-everyone").innerText());
  check(
    "the lines read right: the meeting with who booked it and Start, the option they booked and its total, their link opened today, the warning tapping through to Find out",
    /Booked by Round Twentyone A/.test(meetingText) &&
      (await glance.getByTestId("glance-meeting").getByRole("link", { name: "Start" }).getAttribute("href")) === `/meeting/${full}#start` &&
      /^Quote Front only, \$[\d,]+/.test(quoteText) &&
      quoteText.includes("Booked on their link, not accepted yet") &&
      linkText.includes("Opened today, 3 times") &&
      everyoneText.includes("Someone who decides won't be there.") &&
      (await glance.getByTestId("glance-everyone").locator("a").getAttribute("href")) === "#find-out",
    `${meetingText} | ${quoteText} | ${linkText} | ${everyoneText}`,
  );
  const options = await page.getByTestId("status-select").locator("option").evaluateAll((list) => list.map((o) => ({ text: o.textContent, disabled: o.disabled })));
  check(
    "the status dropdown shows Meeting booked selected, and Sold and Installed with what sets them, not pickable",
    (await page.getByTestId("status-select").inputValue()) === "meeting_booked" &&
      options.some((o) => o.text === "Sold (set when the quote is accepted)" && o.disabled) &&
      options.some((o) => o.text === "Installed (set when the job is marked installed)" && o.disabled) &&
      options.some((o) => o.text === "Lost" && !o.disabled),
    JSON.stringify(options),
  );
  check(
    "the contact lines: the address taps for directions, the phone has Call and Text, the email, one line each",
    (await page.getByTestId("lead-address-top").locator("a").getAttribute("href"))?.startsWith("https://www.google.com/maps/dir/") &&
      (await page.getByTestId("lead-phone").getByRole("link", { name: "Call" }).getAttribute("href")) === "tel:+14035550144" &&
      (await page.getByTestId("lead-phone").getByRole("link", { name: "Text" }).getAttribute("href")) === "sms:+14035550144" &&
      (await page.getByTestId("lead-email").count()) === 1,
  );

  // Nearly empty, both ways.
  for (const [label, size] of [
    ["landscape", LANDSCAPE],
    ["portrait", PORTRAIT],
  ]) {
    await page.setViewportSize(size);
    await open(page, `/app/leads/${empty}`);
    const lines = await page.locator('[data-testid="at-a-glance"] [data-testid^="glance-"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("data-testid")));
    const toFinish = squash(await page.getByTestId("to-be-completed-summary").innerText().catch(() => ""));
    check(
      `nearly empty, iPad ${label}: only status and what's left to finish ("N things to finish")`,
      JSON.stringify(lines) === JSON.stringify(["glance-status", "glance-to-finish"]) && /^\d+ things? to finish$/.test(toFinish),
      `${lines.join(", ")} | ${toFinish}`,
    );
    check(`nearly empty, iPad ${label}: nothing sideways, targets 44 px`, (await sideways(page)) <= 0 && (await smallTargets(page, '[data-testid="lead-top"]')).length === 0);
    await shotTop(page, `empty-ipad-${label}`);
  }
  await page.getByTestId("to-be-completed-summary").click();
  const firstItem = page.locator('[data-testid="to-be-completed"] li a').first();
  check("each thing to finish taps through to its spot", ((await firstItem.getAttribute("href")) ?? "").includes("#"), await firstItem.getAttribute("href"));

  // Sold: the status comes from the quote's outcome.
  await page.setViewportSize(LANDSCAPE);
  await open(page, `/app/leads/${sold}`);
  const soldQuoteText = squash(await page.getByTestId("glance-quote").innerText().catch(() => ""));
  check(
    "sold: the dropdown is off and says the quote's outcome sets it; the quote reads accepted; the install day shows",
    (await page.getByTestId("status-select").isDisabled()) &&
      (await page.getByTestId("status-from-outcome").count()) === 1 &&
      /Full wrap, \$[\d,]+/.test(soldQuoteText) &&
      soldQuoteText.includes("Accepted") &&
      squash(await page.getByTestId("glance-install").innerText()).includes("Planned for"),
    soldQuoteText,
  );

  // The phone: the same, stacked.
  await page.setViewportSize(PHONE);
  await open(page, `/app/leads/${full}`);
  const leftPhone = await box(page, '[data-testid="lead-top"] > div');
  const panelPhone = await box(page, '[data-testid="at-a-glance"]');
  check(
    "phone: it stacks in the same order, At a glance under the contact lines",
    leftPhone !== null && panelPhone !== null && panelPhone.y >= leftPhone.y + leftPhone.height - 1 && (await sideways(page)) <= 0,
  );
  const phoneSmall = await smallTargets(page, '[data-testid="lead-top"]');
  check("phone: every tap target at the top is at least 44 px", phoneSmall.length === 0, phoneSmall.join("; "));
  await shotTop(page, "full-phone");

  // View as the setter: a change saves nothing.
  await open(page, "/app/admin/people");
  await page.locator("tr", { hasText: people.a.email }).getByRole("button", { name: "View as" }).click();
  await page.waitForURL("**/app", { timeout: 30000 });
  await settle(page);
  await open(page, `/app/leads/${empty}`);
  const emptyBefore = (await leadRow(empty)).updated_at;
  await page.getByTestId("status-select").selectOption("follow_up");
  await page.getByTestId("status-save").click();
  await page.getByTestId("status-view-as").waitFor({ timeout: 10000 }).catch(() => {});
  check(
    "View as: a status change says \"View as: nothing was saved.\" and nothing changes",
    squash(await page.getByTestId("status-view-as").innerText().catch(() => "")) === "View as: nothing was saved." && (await leadRow(empty)).updated_at === emptyBefore,
  );
  await open(page, "/app");
  await page.getByRole("status").filter({ hasText: "Viewing as" }).getByRole("button", { name: "Exit" }).click();
  await page.waitForURL("**/app/admin/people", { timeout: 20000 }).catch(() => {});
  check("Exit ends View as", !(await context.cookies()).some((cookie) => cookie.name === VIEW_AS_COOKIE));
  await ownerSession.close();
  ownerSession = null;
  await context.close();
  check("nothing of the owner's changed", (await ownerFootprint(ownerId)) === ownerBefore);

  // ---------------------------------------------------------------- the setter's dropdown, on a phone
  {
    const setter = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const phone = await setter.newPage();
    await signIn(phone, people.a);
    await open(phone, `/app/leads/${follow}`);
    const enabled = await phone.getByTestId("status-select").locator("option:not([disabled])").evaluateAll((list) => list.map((o) => o.value));
    check("a setter's dropdown offers New, Follow up and Lost, as today", JSON.stringify(enabled) === JSON.stringify(["new", "follow_up", "lost"]), enabled.join(", "));
    check("the follow-up day shows under the status with Change and Clear", (await phone.getByTestId("follow-up-change").count()) === 1 && (await phone.getByTestId("follow-up-clear").count()) === 1);

    await phone.getByTestId("follow-up-change").click();
    await phone.getByRole("radio", { name: /In 3 days/ }).click();
    await phone.getByTestId("status-save").click();
    await phone.waitForTimeout(1500);
    await settle(phone);
    check("Change moves the follow-up day", (await leadRow(follow)).follow_up_on === addDays(calgaryDay(), 3), (await leadRow(follow)).follow_up_on);

    // Someone else's change lands first.
    await open(phone, `/app/leads/${follow}`);
    await admin.from("leads").update({ last_name: "Changed elsewhere" }).eq("id", follow);
    await phone.getByTestId("status-select").selectOption("new");
    await phone.getByTestId("status-message").waitFor({ timeout: 10000 }).catch(() => {});
    const staleText = squash(await phone.getByTestId("status-message").innerText().catch(() => ""));
    check(
      "a change made elsewhere first stops it, in plain words, with Reopen, and nothing changes",
      staleText.includes(LEAD_CHANGED) && (await phone.getByTestId("status-reopen").count()) === 1 && (await leadRow(follow)).status === "follow_up",
      staleText,
    );
    await phone.getByTestId("status-reopen").click();
    // Reopen reads the lead again; the panel starts afresh once it has.
    await phone.getByTestId("status-message").waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
    await settle(phone);

    await phone.getByTestId("follow-up-clear").click();
    await phone.waitForTimeout(1500);
    await settle(phone);
    const cleared = await leadRow(follow);
    check("Clear takes the day off and the lead back to New", cleared.status === "new" && cleared.follow_up_on === null, `${cleared.status} ${cleared.follow_up_on}`);

    await open(phone, `/app/leads/${follow}`);
    await phone.getByTestId("status-select").selectOption("lost");
    const lostSave = phone.getByTestId("status-save");
    check("Lost asks why before it can be saved", (await lostSave.isDisabled()) && squash(await lostSave.innerText()) === "Pick why it was lost");
    await phone.getByTestId("status-lost-reason").locator("select").selectOption({ index: 1 });
    await lostSave.click();
    await phone.waitForTimeout(1500);
    const lost = await leadRow(follow);
    check("Lost saves with its reason", lost.status === "lost" && Boolean(lost.lost_reason), `${lost.status} ${lost.lost_reason}`);

    await open(phone, `/app/leads/${others}`);
    check("another setter's lead: the dropdown is there but off", (await phone.getByTestId("status-select").isDisabled()) && (await phone.getByTestId("contact-hidden").count()) === 1);
    await setter.close();
  }
} catch (error) {
  check("walk-through ran to the end", false, mask(error?.stack ?? error));
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await removeEverything().catch((error) => note(`cleanup: ${error?.message}`));
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).like("address_line", `%${STREET}%`);
  check("cleanup left no test leads", (count ?? 0) === 0);
  for (const line of results) console.log(mask(line));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`${results.filter((line) => line.startsWith("PASS")).length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
