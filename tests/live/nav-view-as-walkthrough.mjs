// Live walk-through of M2.5 and the door process against a running build:
// the tab bar and side rail, both Homes, Leads in attention order with All
// and search, the follow-up day, sign-in keeping the email, Settings and Add
// a Vesper member keeping what was typed, the old addresses, the owner's
// step notes, Track colours list and track colour card (looked at, never
// saved), and View as compared screen by screen with what a real test
// setter sees, including a lead with Find out answers, guided photos and a
// track colour and the Schedule without Keenan's tools. Then View as you can
// click through (round 2): the booking sheet from a tapped time to Book,
// its time menu, a photo, the knock counters, New lead's Save, a status,
// Notifications and the welcome, every write refused or acted out, and a
// check that nothing at all was written.
//
// Two throwaway setters do the setter side; their leads are named
// "TEST LEAD (automated)" and everything they make is deleted at the end.
// The owner side uses the one-time owner session Keenan approved
// (owner-session.mjs). It only views screens and submits forms that are
// refused before anything saves, and the run checks that nothing of the
// owner's changed.
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import sharp from "sharp";
import { OWNER_EMAIL, openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The M2.5 walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const TEST_PLACE = "TEST (automated)";
const VIEW_AS_COOKIE = "vesper_view_as";
const BUCKET = "lead-photos";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const people = {
  a: { email: `nav-live-a-${stamp}@example.com`, password: `willow-ember-canyon-${digits}`, name: "Nav Test A", id: null, client: null },
  b: { email: `nav-live-b-${stamp}@example.com`, password: `harbor-quartz-meadow-${digits}`, name: "Nav Test B", id: null, client: null },
};

// Calgary dates, worked out the way the app does.
// Alberta has stayed on UTC-6 since November 1, 2026 (lib/time.ts).
const calgaryZone = (moment) => (moment.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton");
const calendarDay = {
  format: (moment) => new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(moment), year: "numeric", month: "2-digit", day: "2-digit" }).format(moment),
};
const shortDay = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const today = calendarDay.format(new Date());
const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const formatDay = (day) => shortDay.format(new Date(`${day}T12:00:00Z`));

const visibleTabs = (page) =>
  page.locator('nav[aria-label="Tabs"]:visible').getByRole("link").evaluateAll((links) => links.map((link) => link.textContent.trim()));

// A tap shows the tab's loading screen at once and the content streams in
// after it. Playwright's network-idle state belongs to the page load, not to
// moves between tabs, so every check after a move also waits for something
// on the new screen itself.
async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}

// The welcome and Notifications read the phone after they load.
async function settleDevice(page) {
  for (const text of ["Checking this phone.", "Checking this device."]) {
    await page.getByText(text).first().waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  }
}

// What a screen shows: its tabs, the text of the screen, and its controls.
// What a phone itself answers (on the home screen or not, location and
// notifications allowed or not) is marked data-device: two browsers can't
// agree on it, so the text and control names around it are compared, while
// its controls still have to be disabled while viewing.
function capture(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    // data-clock marks text that ticks with the minute, like Session's "Out
    // 12 min.", which two loads a few seconds apart can't promise to agree on.
    const device = [...(main?.querySelectorAll("[data-device], [data-clock]") ?? [])];
    const shown = device.map((el) => el.style.display);
    device.forEach((el) => (el.style.display = "none"));
    const text = (main?.innerText ?? "").replace(/\s+/g, " ").trim();
    device.forEach((el, i) => (el.style.display = shown[i]));
    const tabs = [...document.querySelectorAll('nav[aria-label="Tabs"]')]
      .filter((nav) => getComputedStyle(nav).display !== "none")
      .flatMap((nav) => [...nav.querySelectorAll("a")].map((a) => a.textContent.trim()));
    const controls = [...(main?.querySelectorAll("button, input:not([type=hidden]), select, textarea") ?? [])]
      .filter((el) => getComputedStyle(el).display !== "none")
      .map((el) => ({
        label: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.id || "").replace(/\s+/g, " ").trim(),
        disabled: el.matches(":disabled"),
        device: Boolean(el.closest("[data-device]")),
      }));
    const images = [...(main?.querySelectorAll("img") ?? [])].map((img) => img.getAttribute("alt") ?? "");
    return { text, tabs, controls, images };
  });
}

function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i >= a.length && i >= b.length ? "" : `at ${i}: "${a.slice(Math.max(0, i - 30), i + 50)}" vs "${b.slice(Math.max(0, i - 30), i + 50)}"`;
}

function tapTargetsTooSmall(page, root) {
  return page.evaluate((rootSelector) => {
    const offenders = [];
    const selector =
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="option"], label:has(input[type="radio"])';
    const scope = rootSelector ? document.querySelector(rootSelector) : document;
    for (const element of scope?.querySelectorAll(selector) ?? []) {
      if (element.matches('input[type="radio"]')) continue;
      if (element.closest('[aria-hidden="true"]')) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      if (box.width < 44 || box.height < 44) {
        const label = (element.getAttribute("aria-label") || element.textContent || element.getAttribute("name") || "").trim().slice(0, 30);
        offenders.push(`${element.tagName.toLowerCase()} "${label}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return offenders;
  }, root ?? null);
}

async function checkTapTargets(page, screen, root) {
  const small = await tapTargetsTooSmall(page, root);
  check(`tap targets on ${screen} are at least 44 px`, small.length === 0, small.join("; "));
}

// Everything of the owner's that this run must leave exactly as it was.
async function ownerFootprint(ownerId) {
  const [profile, sessions, leads, events, settings, colours] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).single(),
    admin.from("knock_sessions").select("*").eq("user_id", ownerId).order("id"),
    admin.from("leads").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("lead_events").select("id").eq("actor_id", ownerId).order("id"),
    admin.from("settings").select("*").eq("id", 1).single(),
    admin.from("track_colours").select("*").order("id"),
  ]);
  return JSON.stringify({
    profile: profile.data,
    sessions: sessions.data,
    leads: leads.data,
    events: events.data,
    settings: settings.data,
    colours: colours.data,
  });
}

async function accountEmails() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users ?? []).map((u) => u.email ?? "");
}

async function removeEverythingOf(id) {
  const { data: owned } = await admin.from("leads").select("id").eq("created_by", id);
  const leadIds = (owned ?? []).map((lead) => lead.id);
  await admin.from("earnings").delete().eq("profile_id", id);
  await admin.from("slot_holds").delete().eq("holder_id", id);
  if (leadIds.length > 0) {
    await admin.from("earnings").delete().in("lead_id", leadIds);
    await admin.from("slot_holds").delete().in("lead_id", leadIds);
    await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
    await admin.from("meetings").delete().in("lead_id", leadIds);
    await admin.from("quote_links").delete().in("lead_id", leadIds);
    await admin.from("quotes").delete().in("lead_id", leadIds);
  }
  await admin.from("meetings").update({ rebooked_as: null }).eq("host_id", id);
  await admin.from("meetings").delete().eq("host_id", id);
  await admin.from("leads").delete().eq("created_by", id);
  await admin.from("knock_sessions").delete().eq("user_id", id);
  const { data: files } = await admin.storage.from(BUCKET).list(id, { limit: 1000 });
  if (files && files.length > 0) {
    await admin.storage.from(BUCKET).remove(files.map((file) => `${id}/${file.name}`));
  }
  await admin.auth.admin.deleteUser(id);
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
// A photo to tap through the sheet and New lead with while viewing.
const fixture = `${out}/view-as-fixture.jpg`;
await sharp({ create: { width: 800, height: 600, channels: 3, background: "#5b7083" } }).jpeg({ quality: 80 }).toFile(fixture);
const { defaultBrowserType, ...iphone } = devices["iPhone 14"];
void defaultBrowserType;
const setterContext = await browser.newContext(iphone);
const page = await setterContext.newPage();
let ownerSession = null;
let ownerPage = null;
const leads = {};
const OTHER_PHONE = "+14035550188";
const OTHER_EMAIL = "other.setter.lead@example.com";
const OWN_PHONE = "+14035550177";
const OWN_EMAIL = "own.setter.lead@example.com";

try {
  // Setup: two setters, A's leads in every attention group, B's one lead,
  // and A knocking now with 7 doors and 3 conversations.
  for (const key of ["a", "b"]) {
    const person = people[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
      user_metadata: { full_name: person.name },
      app_metadata: { role: "sales" },
    });
    if (error) throw new Error(`createUser ${key}: ${error.message}`);
    person.id = data.user.id;
    // The first sign-in welcome has its own walk-through; this one starts after it.
    await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", person.id);
    person.client = createClient(url, anonKey, noSession);
    const signedIn = await person.client.auth.signInWithPassword({ email: person.email, password: person.password });
    if (signedIn.error) throw new Error(`sign in ${key}: ${signedIn.error.message}`);
  }
  const add = async (person, row) => {
    const { data, error } = await person.client
      .from("leads")
      .insert({ first_name: TEST_LEAD, neighbourhood: TEST_PLACE, created_by: person.id, ...row })
      .select("id")
      .single();
    if (error) throw new Error(`lead ${row.address_line}: ${error.message}`);
    return data.id;
  };
  const a = people.a;
  leads.newOld = await add(a, { address_line: "1 Attention Way NW (TEST)" });
  leads.dueToday = await add(a, { address_line: "2 Attention Way NW (TEST)", status: "follow_up", follow_up_on: today });
  leads.overdue = await add(a, { address_line: "3 Attention Way NW (TEST)" });
  // Only the service role can set a day in the past, as a few days passing would.
  await admin.from("leads").update({ status: "follow_up", follow_up_on: addDays(today, -2) }).eq("id", leads.overdue);
  leads.later = await add(a, { address_line: "4 Attention Way NW (TEST)", status: "follow_up", follow_up_on: addDays(today, 5) });
  leads.newYoung = await add(a, { address_line: "5 Attention Way NW (TEST)" });
  leads.lost = await add(a, { address_line: "6 Attention Way NW (TEST)", status: "lost", lost_reason: "price" });
  leads.other = await add(people.b, { address_line: "9 Other Setter Way NW (TEST)" });
  // Contact privacy (Keenan, 2026-11-04): B's lead and one of A's own carry a
  // phone and an email; A sees only their own, and so does View as A.
  const contactB = await people.b.client.from("leads").update({ phone: OTHER_PHONE, email: OTHER_EMAIL }).eq("id", leads.other);
  if (contactB.error) throw new Error(`B's contact: ${contactB.error.message}`);
  const contactA = await a.client.from("leads").update({ phone: OWN_PHONE, email: OWN_EMAIL }).eq("id", leads.newOld);
  if (contactA.error) throw new Error(`A's contact: ${contactA.error.message}`);
  const { data: knock, error: knockError } = await a.client
    .from("knock_sessions")
    .insert({ neighbourhood: TEST_PLACE, user_id: a.id })
    .select("id")
    .single();
  if (knockError) throw new Error(`knock session: ${knockError.message}`);
  await a.client.rpc("bump_knock_session", { p_session: knock.id, p_doors: 7, p_conversations: 3 });

  // The door process on two of the leads: A's lead due today has Find out
  // answers, three guided photos and a custom track colour; B's lead has a
  // colour from Keenan's list. Only the owner sets a track colour, so the
  // service role stands in for him; Keenan's list is only read.
  const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#132e3f" } }).jpeg().toBuffer();
  const answered = await a.client
    .from("leads")
    .update({ owns_home: true, wants_price: false, soffit_colour: "not_sure", areas_wanted: "full_wrap", install_timing: "new_year" })
    .eq("id", leads.dueToday);
  if (answered.error) throw new Error(`answers: ${answered.error.message}`);
  for (const slot of ["front", "left_corner", "right_corner"]) {
    const path = `${a.id}/${crypto.randomUUID()}.jpg`;
    const uploaded = await a.client.storage.from(BUCKET).upload(path, jpeg, { contentType: "image/jpeg" });
    if (uploaded.error) throw new Error(`upload ${slot}: ${uploaded.error.message}`);
    const linked = await a.client.from("lead_photos").insert({ lead_id: leads.dueToday, storage_path: path, slot });
    if (linked.error) throw new Error(`photo ${slot}: ${linked.error.message}`);
  }
  // A quote and a live customer link on the setter's own lead: View as must
  // never show the owner's Quote card (2026-11-02). The link is made by the
  // setter's throwaway account, so nothing could ever notify Keenan.
  const viewAsQuote = await admin.from("quotes").insert({
    lead_id: leads.dueToday,
    created_by: a.id,
    price_per_ft: 23,
    box_price: 500,
    runs: [{ name: "Front", feet: 40, level: "lower" }],
    total_feet: 40,
    gst_rate: 0.05,
    subtotal: 1420,
    total: 1420,
    valid_until: today,
  });
  if (viewAsQuote.error) throw new Error(`View as quote: ${viewAsQuote.error.message}`);
  const viewAsLink = await admin
    .from("quote_links")
    .insert({ lead_id: leads.dueToday, token: randomBytes(18).toString("base64url"), created_by: a.id });
  if (viewAsLink.error) throw new Error(`View as link: ${viewAsLink.error.message}`);
  const custom = await admin.from("leads").update({ track_ral_code: "7016" }).eq("id", leads.dueToday);
  if (custom.error) throw new Error(`custom colour: ${custom.error.message}`);
  const { data: firstColour } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order").limit(1).single();
  const listed = await admin.from("leads").update({ track_colour_id: firstColour.id }).eq("id", leads.other);
  if (listed.error) throw new Error(`list colour: ${listed.error.message}`);

  // A held, Qualified booking for A, so My pay has a fee to show. It sits on
  // B's evenings as a stand-in host, never on Keenan's board; the service
  // role stands in for Keenan marking it Qualified.
  const heldAt = new Date(Date.now() - 3 * 3600_000);
  const { data: paidMeeting, error: paidMeetingError } = await admin
    .from("meetings")
    .insert({
      lead_id: leads.newOld,
      host_id: people.b.id,
      setter_id: a.id,
      booked_by: a.id,
      starts_at: heldAt.toISOString(),
      ends_at: new Date(heldAt.getTime() + 35 * 60_000).toISOString(),
      everyone_deciding_present: true,
    })
    .select("id")
    .single();
  if (paidMeetingError) throw new Error(`meeting: ${paidMeetingError.message}`);
  const qualified = await admin.rpc("set_meeting_outcome", { p_meeting_id: paidMeeting.id, p_outcome: "qualified" });
  if (qualified.error) throw new Error(`outcome: ${qualified.error.message}`);

  // 1. A failed sign-in keeps the email and clears only the password.
  await page.goto(`${base}/login`);
  await page.fill("#email", a.email);
  await page.fill("#password", "wrong-password-0000");
  await page.click("button[type=submit]");
  await page.locator("form p[role=alert]").waitFor({ timeout: 20000 });
  check("a failed sign-in keeps the email", (await page.inputValue("#email")) === a.email, await page.inputValue("#email"));
  check("a failed sign-in clears the password", (await page.inputValue("#password")) === "");
  await page.fill("#password", a.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30000 });
  await settle(page);

  // 2. Tabs on a phone: a bottom bar with the setter's three tabs, nothing at the top.
  check("a setter's tabs are Home, Schedule, Session, Leads and My pay", JSON.stringify(await visibleTabs(page)) === JSON.stringify(["Home", "Schedule", "Session", "Leads", "My pay"]), (await visibleTabs(page)).join(", "));
  const bar = await page.locator('nav[aria-label="Tabs"]:visible').boundingBox();
  const viewport = page.viewportSize();
  check("on a phone the tabs sit in a bar at the bottom", bar !== null && Math.abs(bar.y + bar.height - viewport.height) <= 2 && bar.width >= viewport.width - 2, bar ? `${Math.round(bar.y)}+${Math.round(bar.height)} of ${viewport.height}` : "missing");
  check("there are no top tabs", (await page.locator("nav:visible").count()) === 1 && (await page.locator('nav[aria-label="Main"]').count()) === 0);

  // 3. The setter's Home: the follow-ups due. The knock session is on
  // Session (2026-11-05).
  check("Home greets the setter", (await page.getByRole("heading", { name: /^Hello, Nav/ }).count()) === 1);
  check("Home no longer holds the knock session's counters", (await page.getByRole("button", { name: /^Doors \+1/ }).count()) === 0);
  const liveBar = page.getByTestId("home-session-bar");
  check(
    "Home shows the setter's live session as a bar that opens Session",
    (await liveBar.getAttribute("href")) === "/app/session" && (await liveBar.innerText()).includes(`Knocking in ${TEST_PLACE}`) && (await liveBar.innerText()).includes("7 doors"),
    (await liveBar.innerText().catch(() => "")).replace(/\s+/g, " "),
  );
  const dueLinks = await page.getByRole("list", { name: "Follow-ups due" }).getByRole("link").evaluateAll((links) => links.map((link) => [link.getAttribute("href"), link.innerText]));
  check(
    "Home lists the follow-ups due, overdue first, and leaves later ones out",
    JSON.stringify(dueLinks.map(([href]) => href)) === JSON.stringify([`/app/leads/${leads.overdue}`, `/app/leads/${leads.dueToday}`]) &&
      dueLinks[0][1].includes(`Overdue since ${formatDay(addDays(today, -2))}`) &&
      dueLinks[1][1].includes("Due today"),
    dueLinks.map(([, text]) => text.replace(/\n/g, " | ")).join(" || "),
  );
  await checkTapTargets(page, "the setter's Home");
  await page.screenshot({ path: `${out}/m25-sales-home.png`, fullPage: true });

  // 3b. Session, the gold tab (2026-11-05): the knock session that is running.
  await page.locator('nav[aria-label="Tabs"]:visible').getByRole("link", { name: "Session", exact: true }).click();
  await page.waitForURL("**/app/session", { timeout: 20000 });
  await settle(page);
  check(
    "Session shows the knock session that is running, with its counts",
    (await page.getByRole("heading", { name: `Knocking in ${TEST_PLACE}` }).count()) === 1 &&
      ((await page.getByRole("button", { name: /^Doors \+1/ }).getAttribute("aria-label")) ?? "").endsWith("now 7"),
  );
  check(
    "the Session tab is the current tab",
    (await page.locator('nav[aria-label="Tabs"]:visible a[aria-current="page"]').innerText()).trim() === "Session",
  );

  // 4. Leads opens to Active, in the order things need attention.
  await page.locator('nav[aria-label="Tabs"]:visible').getByRole("link", { name: "Leads", exact: true }).click();
  await page.waitForURL("**/app/leads", { timeout: 20000 });
  await settle(page);
  const newLeadLink = page.locator("main").getByRole("link", { name: "New lead" });
  const newLeadBox = await newLeadLink.first().boundingBox();
  check(
    "Leads has a New lead button at the top",
    (await newLeadLink.count()) === 1 && (await newLeadLink.getAttribute("href")) === "/app/leads/new" && newLeadBox !== null && newLeadBox.y < 200,
    newLeadBox ? `at ${Math.round(newLeadBox.y)}` : "missing",
  );
  await page.locator("main section").first().waitFor({ timeout: 20000 });
  const sectionOrder = await page.locator("main section").evaluateAll((sections) =>
    sections.map((section) => [section.querySelector("h2").textContent.trim(), [...section.querySelectorAll("a")].map((link) => link.getAttribute("href"))]),
  );
  const expected = [
    ["Follow-ups due (2)", [`/app/leads/${leads.overdue}`, `/app/leads/${leads.dueToday}`]],
    ["New (2)", [`/app/leads/${leads.newOld}`, `/app/leads/${leads.newYoung}`]],
    ["Follow up later (1)", [`/app/leads/${leads.later}`]],
  ];
  check("Leads opens to Active: due follow-ups, then new oldest first, then later follow-ups", JSON.stringify(sectionOrder) === JSON.stringify(expected), sectionOrder.map(([title, links]) => `${title}: ${links.length}`).join(", "));
  check("Active leaves the lost lead out", (await page.locator(`a[href="/app/leads/${leads.lost}"]`).count()) === 0);
  await checkTapTargets(page, "Leads");
  await page.screenshot({ path: `${out}/m25-leads-active.png`, fullPage: true });
  await page.getByRole("navigation", { name: "Which leads" }).getByRole("link", { name: "All" }).click();
  await page.waitForURL(/view=all/, { timeout: 20000 });
  await settle(page);
  await page.getByRole("heading", { name: "Lost (1)" }).waitFor({ timeout: 20000 }).catch(() => {});
  check("All shows lost leads too", (await page.getByRole("heading", { name: "Lost (1)" }).count()) === 1);
  await page.goto(`${base}/app/leads?scope=mine&view=active&q=${encodeURIComponent("6 Attention")}`);
  await settle(page);
  check("search from Active finds a lost lead", (await page.locator(`a[href="/app/leads/${leads.lost}"]`).count()) === 1);
  await page.goto(`${base}/app/leads?scope=everyone&view=active`);
  await settle(page);
  const otherRow = page.locator(`a[href="/app/leads/${leads.other}"]`);
  check("Everyone still shows another setter's lead, read only", (await otherRow.count()) === 1 && (await otherRow.innerText()).includes("by Nav Test B, read only"));

  // 5. Choosing Follow up asks when, and the day can be moved later.
  await page.goto(`${base}/app/leads/${leads.newYoung}`);
  await settle(page);
  const statusGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^Status$/ }) });
  await statusGroup.getByText("Follow up", { exact: true }).click();
  const whenGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "When to follow up?" }) });
  const whenLabels = (await whenGroup.locator("label").allInnerTexts()).map((t) => t.split("\n")[0].trim());
  check("Follow up offers Tomorrow, In 3 days, Next week or a date", JSON.stringify(whenLabels) === JSON.stringify(["Tomorrow", "In 3 days", "Next week", "On a date"]), whenLabels.join(", "));
  await whenGroup.getByText("In 3 days", { exact: true }).click();
  await checkTapTargets(page, "a lead with the follow-up choices open");
  await page.getByRole("button", { name: "Save status" }).click();
  await page.getByText(`Follow up on ${formatDay(addDays(today, 3))}.`).first().waitFor({ timeout: 20000 });
  const { data: afterFollowUp } = await admin.from("leads").select("status, follow_up_on").eq("id", leads.newYoung).single();
  check("the lead moves to Follow up three days out, and the timeline says so", afterFollowUp?.status === "follow_up" && afterFollowUp?.follow_up_on === addDays(today, 3), JSON.stringify(afterFollowUp));
  const whenAgain = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "When to follow up?" }) });
  check("on a follow-up the first choice keeps the day", ((await whenAgain.locator("label").first().innerText()).split("\n")[0].trim()) === "Keep");
  await whenAgain.getByText("Next week", { exact: true }).click();
  await page.getByRole("button", { name: "Save follow-up day" }).click();
  await page.getByText("Changed the follow-up day.").waitFor({ timeout: 20000 });
  const { data: moved } = await admin.from("leads").select("follow_up_on").eq("id", leads.newYoung).single();
  check("moving the day saves it and logs it", moved?.follow_up_on === addDays(today, 7), moved?.follow_up_on);
  await page.screenshot({ path: `${out}/m25-follow-up.png`, fullPage: true });

  // 6. iPad keeps the bottom bar; 1024 px and wider gets the side rail.
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto(`${base}/app`);
  await settle(page);
  const ipadBar = await page.locator('nav[aria-label="Tabs"]:visible').boundingBox();
  check("an iPad held upright keeps the bottom tab bar", ipadBar !== null && Math.abs(ipadBar.y + ipadBar.height - 1180) <= 2, ipadBar ? `${Math.round(ipadBar.x)},${Math.round(ipadBar.y)} ${Math.round(ipadBar.width)}x${Math.round(ipadBar.height)}` : "missing");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  const rail = await page.locator('nav[aria-label="Tabs"]:visible').boundingBox();
  check("at 1024 px and wider the tabs move to a slim rail on the left", rail !== null && rail.x === 0 && rail.width <= 96 && rail.height >= 790, rail ? `${Math.round(rail.x)},${Math.round(rail.y)} ${Math.round(rail.width)}x${Math.round(rail.height)}` : "missing");
  check("the rail holds the same tabs", JSON.stringify(await visibleTabs(page)) === JSON.stringify(["Home", "Schedule", "Session", "Leads", "My pay"]));
  await page.screenshot({ path: `${out}/m25-desktop-rail.png`, fullPage: false });
  await page.setViewportSize(viewport);

  // 7. A setter cannot use View as, even with a hand-made cookie.
  const ownerRow = await admin.from("profiles").select("id").eq("email", OWNER_EMAIL).single();
  const ownerId = ownerRow.data?.id;
  if (!ownerId) throw new Error("owner profile not found");
  const host = new URL(base).hostname;
  await setterContext.addCookies([{ name: VIEW_AS_COOKIE, value: `${a.id}:${people.b.id}`, domain: host, path: "/" }]);
  await page.goto(`${base}/app`);
  await settle(page);
  check("a setter's own hand-made View as cookie changes nothing they can see", (await page.getByText("Viewing as").count()) === 0 && (await page.getByRole("heading", { name: /^Hello, Nav/ }).count()) === 1);
  await setterContext.clearCookies({ name: VIEW_AS_COOKIE });
  await setterContext.addCookies([{ name: VIEW_AS_COOKIE, value: `${ownerId}:${people.b.id}`, domain: host, path: "/" }]);
  await page.goto(`${base}/app`);
  await settle(page);
  const leftover = (await setterContext.cookies()).some((cookie) => cookie.name === VIEW_AS_COOKIE);
  check("a View as cookie naming someone else is dropped", !leftover && (await page.getByText("Viewing as").count()) === 0);

  // 8. The owner, through the one-time session.
  const before = await ownerFootprint(ownerId);
  const emailsBefore = await accountEmails();
  const { data: ownerOpen } = await admin.from("knock_sessions").select("started_at").eq("user_id", ownerId).is("ended_at", null);
  const staleOwnerSession = (ownerOpen ?? []).some((session) => calendarDay.format(new Date(session.started_at)) !== today);
  // Location is allowed so "Use where I'm standing" can be tapped through.
  const ownerContext = await browser.newContext({
    ...iphone,
    geolocation: { latitude: 51.0447, longitude: -114.0719, accuracy: 10 },
    permissions: ["geolocation"],
  });
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  ownerPage = await ownerContext.newPage();
  const op = ownerPage;

  // Keenan's Home only reads (2026-11-05): his stale sessions close on
  // Session, not here, so it is checked whatever he left open.
  void staleOwnerSession;
  {
    await op.goto(`${base}/app`);
    await settle(op);
    check(
      "the owner's Home is today: the date, Start knocking or his live session, Meetings and who's out knocking now",
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), /.test((await op.locator("main h1").first().innerText()).trim()) &&
        (await op.getByRole("heading", { name: "Meetings today", exact: true }).count()) === 1 &&
        (await op.locator('[data-testid="home-start-knocking"], [data-testid="home-session-bar"]').count()) === 1 &&
        (await op.getByTestId("home-meetings").count()) === 1,
    );
    const outNow = op.getByTestId("out-now");
    const aText = (await outNow.getByTestId("out-today-row").filter({ hasText: "Nav Test A" }).innerText().catch(() => "")).replace(/\s+/g, " ");
    check(
      "Out knocking now shows who is out, where, since when, and their doors and conversations",
      aText.includes("Out now") && aText.includes(TEST_PLACE) && aText.includes(", since ") && aText.includes("7 doors") && aText.includes("3 conversations"),
      aText,
    );
    check("someone who isn't knocking right now doesn't show there", (await outNow.getByTestId("out-today-row").filter({ hasText: "Nav Test B" }).count()) === 0);
    const meetings = op.getByTestId("home-meetings");
    await meetings.getByRole("button", { name: /^Tomorrow/ }).click();
    check(
      "Meetings switches between Today and Tomorrow in place",
      (await meetings.getByRole("button", { name: /^Tomorrow/ }).getAttribute("aria-pressed")) === "true" &&
        (await meetings.locator('[data-day-list="Tomorrow"]').isVisible()) &&
        (await meetings.getByRole("heading", { name: "Meetings tomorrow", exact: true }).count()) === 1,
    );
    check(
      "Keenan's Home leaves moved and cancelled bookings to Schedule",
      (await meetings.locator('[data-testid="meeting-card"][data-status="moved"], [data-testid="meeting-card"][data-status="cancelled"]').count()) === 0,
    );
    await meetings.getByRole("button", { name: /^Today/ }).click();
    check(
      "the owner's tabs are Home, Schedule, Meetings, Session and Leads, with Admin as a gear in the header",
      JSON.stringify(await visibleTabs(op)) === JSON.stringify(["Home", "Schedule", "Meetings", "Session", "Leads"]) &&
        (await op.getByTestId("admin-gear").getAttribute("href")) === "/app/admin",
      (await visibleTabs(op)).join(", "),
    );
    await checkTapTargets(op, "the owner's Home");
    await op.screenshot({ path: `${out}/m25-owner-home.png`, fullPage: true });
  }

  for (const [from, to] of [["/app/dashboard", "/app"], ["/app/people", "/app/admin/people"], ["/app/settings", "/app/admin/settings"]]) {
    await op.goto(`${base}${from}`);
    check(`the old ${from} address leads to ${to}`, new URL(op.url()).pathname === to, op.url());
  }
  await op.goto(`${base}/app/admin`);
  await settle(op);
  check("Admin holds People and Settings", (await op.locator('main a[href="/app/admin/people"]').count()) === 1 && (await op.locator('main a[href="/app/admin/settings"]').count()) === 1);

  // Settings keeps what was typed when it refuses a save. Nothing is saved.
  await op.goto(`${base}/app/admin/settings`);
  await settle(op);
  await op.fill("#settings-price_per_ft", "-5");
  await op.fill("#settings-gst_number", "TEST-KEEP-123");
  await op.getByRole("button", { name: "Save settings" }).click();
  await op.getByText("Some fields need a look.").waitFor({ timeout: 20000 });
  check("Settings keeps everything typed after an error", (await op.inputValue("#settings-price_per_ft")) === "-5" && (await op.inputValue("#settings-gst_number")) === "TEST-KEEP-123");

  // Add a Vesper member keeps what was typed when it refuses. Nobody is created.
  await op.goto(`${base}/app/admin/people`);
  await settle(op);
  await op.getByRole("button", { name: "Add a Vesper member" }).click();
  await op.fill("#member-full_name", "TEST (automated) never created");
  await op.fill("#member-email", "not-an-email");
  await op.getByRole("button", { name: "Create login" }).click();
  await op.locator("#member-email-error").filter({ hasText: /./ }).waitFor({ timeout: 20000 });
  check("Add a Vesper member keeps what was typed after an error", (await op.inputValue("#member-full_name")) === "TEST (automated) never created" && (await op.inputValue("#member-email")) === "not-an-email");

  // The step notes and the Track colours list, looked at and never saved.
  await op.goto(`${base}/app/admin/settings`);
  await settle(op);
  const { data: liveSettings } = await admin.from("settings").select("step_note_at_door, step_note_after_door, step_note_book").eq("id", 1).single();
  check(
    "Settings shows the three step notes to edit, in place of the single Door guide",
    (await op.inputValue("#settings-step_note_at_door")) === liveSettings?.step_note_at_door &&
      (await op.inputValue("#settings-step_note_after_door")) === liveSettings?.step_note_after_door &&
      (await op.inputValue("#settings-step_note_book")) === liveSettings?.step_note_book &&
      (await op.locator("#settings-door_guide").count()) === 0,
  );
  const { data: liveColours } = await admin.from("track_colours").select("name, active").order("sort_order");
  const rows = await op.getByTestId("track-colour-row").evaluateAll((items) => items.map((item) => item.querySelector("p").textContent.trim()));
  const expectedRows = (liveColours ?? []).map((colour) => `${colour.name}${colour.active ? "" : "Retired"}`);
  check("Settings lists Keenan's track colours in his order", JSON.stringify(rows) === JSON.stringify(expectedRows), rows.join(", "));
  const firstRow = op.getByTestId("track-colour-row").first();
  const rowButtons = (await firstRow.getByRole("button").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  check("each colour can be moved, edited and retired, and nothing removes one", rowButtons.length === 4 && (await op.getByRole("button", { name: /delete|remove/i }).count()) === 0, rowButtons.join(" | "));
  check("the colour list shows names only, no swatches", (await op.locator('[data-testid="track-colour-row"] [style*="background"]').count()) === 0);
  await op.fill("#track-colour-new-name", "TEST (automated) never saved");
  await op.fill("#track-colour-new-ral", "7016");
  check("typing a RAL number names the colour at once", (await op.getByTestId("track-colour-new-ral-name").innerText()).trim() === "RAL 7016 Anthracite grey");
  await op.fill("#track-colour-new-ral", "12");
  await op.getByRole("button", { name: "Add colour" }).click();
  await op.locator("#track-colour-new-ral-error").waitFor({ timeout: 20000 });
  check("a colour with a wrong RAL number is refused and what was typed stays", (await op.inputValue("#track-colour-new-name")) === "TEST (automated) never saved" && (await op.inputValue("#track-colour-new-ral")) === "12");
  await checkTapTargets(op, "the Track colours card", '[data-testid="track-colours"]');
  await op.getByTestId("track-colour-row").first().screenshot({ path: `${out}/m26-track-colour-row.png` }).catch(() => {});

  // The owner's track colour card on a lead, looked at and never saved.
  await op.goto(`${base}/app/leads/${leads.newOld}`);
  await settle(op);
  const trackForm = op.getByTestId("track-colour-form");
  const choices = (await trackForm.locator("label").allTextContents()).map((t) => t.trim());
  const activeNames = (liveColours ?? []).filter((colour) => colour.active).map((colour) => colour.name);
  check("the owner picks a track colour from the active list or Custom", JSON.stringify(choices) === JSON.stringify([...activeNames, "Custom"]), choices.join(", "));
  await trackForm.getByText("Custom", { exact: true }).click();
  await op.fill("#lead-track-ral", "1015");
  check("Custom names the RAL Classic colour as it is typed", (await op.getByTestId("lead-track-ral-name").innerText()).trim() === "RAL 1015 Light ivory");
  await op.fill("#lead-track-ral", "12");
  await op.getByRole("button", { name: "Save track colour" }).click();
  await op.locator("#lead-track-ral-error").waitFor({ timeout: 20000 });
  const { data: untouched } = await admin.from("leads").select("track_colour_id, track_ral_code").eq("id", leads.newOld).single();
  check("a custom colour that is not four digits is refused and nothing is saved", untouched?.track_colour_id === null && untouched?.track_ral_code === null && (await op.inputValue("#lead-track-ral")) === "12");
  await checkTapTargets(op, "the owner's track colour card");
  await op.screenshot({ path: `${out}/m26-owner-track-colour.png`, fullPage: true });

  // View as A.
  await op.goto(`${base}/app/admin/people`);
  await settle(op);
  const aPersonRow = op.locator("tr", { hasText: a.email });
  await aPersonRow.getByRole("button", { name: "View as" }).click();
  await op.waitForURL("**/app", { timeout: 30000 });
  await settle(op);
  const goldBar = op.getByRole("status").filter({ hasText: "Viewing as Nav Test A. Read only." });
  check("View as opens under a gold bar: Viewing as, Read only, Exit", (await goldBar.count()) === 1 && (await goldBar.getByRole("button", { name: "Exit" }).count()) === 1);
  await op.screenshot({ path: `${out}/m25-view-as-home.png`, fullPage: true });

  const screens = [
    ["Home", "/app"],
    ["Leads, Active", "/app/leads"],
    ["Leads, All", "/app/leads?scope=mine&view=all"],
    ["Leads, Everyone", "/app/leads?scope=everyone&view=active"],
    ["their own lead", `/app/leads/${leads.dueToday}`],
    ["another setter's lead", `/app/leads/${leads.other}`],
    ["New lead", "/app/leads/new"],
    ["Edit lead", `/app/leads/${leads.newOld}/edit`],
    ["Schedule", "/app/schedule"],
    ["Session", "/app/session"],
    ["Meetings", "/app/meetings"],
    ["a lead opened to book", `/app/leads/${leads.later}?book=1`],
    ["My pay", "/app/pay"],
    ["Notifications", "/app/notifications"],
    ["the welcome", "/app/welcome"],
    ["the welcome's location step", "/app/welcome?step=2"],
    ["the welcome's notifications step", "/app/welcome?step=3"],
    ["the welcome's door tour", "/app/welcome?step=4"],
    ["Admin", "/app/admin"],
    ["Settings", "/app/admin/settings"],
  ];
  for (const [label, path] of screens) {
    const visitStart = new Date().toISOString();
    await page.goto(`${base}${path}`);
    await settle(page);
    await settleDevice(page);
    const real = await capture(page);
    await op.goto(`${base}${path}`);
    await settle(op);
    await settleDevice(op);
    const viewed = await capture(op);
    const named = (controls) => JSON.stringify(controls.filter((c) => !c.device).map((c) => c.label));
    const sameControls = named(real.controls) === named(viewed.controls);
    const sameImages = JSON.stringify(real.images) === JSON.stringify(viewed.images);
    check(
      `View as shows ${label} exactly as the setter sees it`,
      real.text === viewed.text && JSON.stringify(real.tabs) === JSON.stringify(viewed.tabs) && sameControls && sameImages,
      real.text === viewed.text ? (sameControls ? (sameImages ? "" : "photos differ") : "controls differ") : firstDifference(real.text, viewed.text),
    );
    if (label === "their own lead") {
      check(
        "View as shows the lead's Find out answers, its three slot photos and its track colour",
        viewed.text.includes(
          "Phone Not answered Owns the home Yes Wants a price Not yet Everyone who decides will be there Not answered Christmas lights now Not answered Looked into it before Not answered Which areas Full wrap Timing New year Soffit colour Not sure",
        ) &&
          viewed.text.includes("4 of 8 collected") &&
          ["Front photo of the house", "Left corner photo of the house", "Right corner photo of the house"].every((alt) => viewed.images.includes(alt)) &&
          viewed.text.includes("Custom, RAL 7016 Anthracite grey Needs powder coating.") &&
          viewed.text.includes("Keenan sets the track colour."),
        viewed.text.slice(viewed.text.indexOf("Find out"), viewed.text.indexOf("Find out") + 200),
      );
      check("View as never shows the owner's Quote card or the customer's link", (await op.getByTestId("quote-card").count()) === 0 && !(await op.content()).includes("/q/"));
      check("View as gives the setter's lead no track colour controls", !viewed.controls.some((c) => /track colour/i.test(c.label)) && (await op.getByTestId("track-colour-form").count()) === 0);
    }
    if (label === "another setter's lead") {
      check("View as shows another setter's track colour from the list", viewed.text.includes(`Track colour ${firstColour.name}`), firstColour.name);
      const realHtml = await page.content();
      const viewedHtml = await op.content();
      const leaks = [OTHER_PHONE, OTHER_PHONE.slice(2), "555-0188", OTHER_EMAIL].filter((bit) => realHtml.includes(bit) || viewedHtml.includes(bit));
      check(
        "another setter's lead shows no phone or email, to the setter or in View as, not even in the page's data",
        leaks.length === 0 &&
          (await page.locator('a[href^="tel:"], a[href^="sms:"], a[href^="mailto:"]').count()) === 0 &&
          (await op.locator('a[href^="tel:"], a[href^="sms:"], a[href^="mailto:"]').count()) === 0,
        leaks.join(", "),
      );
      check(
        "it says the phone is saved and why it isn't shown",
        real.text.includes("Phone Saved, hidden") && real.text.includes("Phone and email show only to this lead's own setter."),
        real.text.slice(real.text.indexOf("Find out"), real.text.indexOf("Find out") + 60),
      );
    }
    if (label === "New lead") {
      check(
        "View as shows New lead with the ? step notes, the questions with Not collected and the four photo slots",
        (await op.getByTestId("step-notes").count()) === 1 &&
          (await op.getByTestId("find-out").locator("legend").count()) === 8 &&
          (await op.getByTestId("find-out").locator('input[value="not_collected"]').count()) === 7 &&
          (await op.getByRole("list", { name: "Guided photos" }).locator("li").count()) === 4,
      );
    }
    if (label === "Schedule") {
      check("View as shows the setter's Schedule without Keenan's Block time and pencil", (await op.getByTestId("owner-schedule-tools").count()) === 0);
    }
    if (label === "a lead opened to book") {
      await op.getByTestId("booking-sheet").waitFor({ timeout: 15000 }).catch(() => {});
      await op.waitForTimeout(1500);
      // Only holds made during this visit count: Keenan's own earlier holds are his data.
      const { count: viewHolds } = await admin.from("slot_holds").select("id", { count: "exact", head: true }).in("holder_id", [ownerId, a.id]).gte("created_at", visitStart);
      check(
        "View as opens the booking sheet just as it opens for the setter, on the times, and holds nothing",
        (await op.locator('[data-testid="booking-sheet"][data-view="times"]').count()) === 1 && viewHolds === 0 && (await page.getByTestId("booking-sheet").count()) === 1,
        `${viewHolds} holds`,
      );
      check("the sheet carries the gold View as bar, since it covers the app's", (await op.getByTestId("booking-sheet").getByText("Viewing as Nav Test A. Read only.").count()) === 1);
    }
    // Round 2: every control works as the setter's own, so Keenan can click
    // through; the server refuses the writes.
    const states = (controls) => JSON.stringify(controls.filter((c) => !c.device).map((c) => [c.label, c.disabled]));
    check(`the controls on ${label} work as they do for the setter: the same ones, none switched off for View as`, states(real.controls) === states(viewed.controls), states(viewed.controls).slice(0, 160));
    if (label === "My pay") {
      check("View as shows the setter's own pay and nobody else's", viewed.text.includes("Owed now $") && !viewed.text.includes("Nav Test B") && !/Price per foot|Booking pay/.test(viewed.text));
    } else {
      check(`View as shows no prices or settings on ${label}`, !/\$|Price per foot|Booking pay|Commission/.test(viewed.text));
    }
  }
  check("View as keeps owner screens from the setter's view", (await op.getByRole("heading", { name: "Not for your role" }).count()) === 1);

  // Contact privacy on their own lead and in search (Keenan, 2026-11-04): the
  // setter sees their own lead's phone and email, and so does View as; a
  // search by B's digits finds nothing of B's, a search by their own finds
  // their lead.
  for (const [who, tab] of [["the setter", page], ["View as", op]]) {
    await tab.goto(`${base}/app/leads/${leads.newOld}`);
    await settle(tab);
    const call = await tab.locator(`a[href="tel:${OWN_PHONE}"]`).count();
    const mail = await tab.locator(`a[href="mailto:${OWN_EMAIL}"]`).count();
    check(`${who}: their own lead shows its phone and email`, call === 1 && mail === 1, `${call} call, ${mail} email`);
    await tab.goto(`${base}/app/leads?scope=everyone&view=all&q=${encodeURIComponent("403 555 0188")}`);
    await settle(tab);
    const foundOther = await tab.locator(`main a[href="/app/leads/${leads.other}"]`).count();
    await tab.goto(`${base}/app/leads?scope=everyone&view=all&q=${encodeURIComponent("5550177")}`);
    await settle(tab);
    const foundOwn = await tab.locator(`main a[href="/app/leads/${leads.newOld}"]`).count();
    check(`${who}: a search by phone finds only their own leads, never another setter's`, foundOther === 0 && foundOwn >= 1, `${foundOther} of B's, ${foundOwn} of theirs`);
  }

  // ---------------------------------------------------------------- View as you can click through (round 2)
  // Keenan taps through what Nav Test A would. Each write is refused on the
  // server or acted out on screen, calmly, and the footprint shows nothing
  // at all was written: leads, timeline, holds, meetings, knock sessions,
  // photos, the welcome and notification devices.
  const everyLead = Object.values(leads);
  const clickFootprint = async () =>
    JSON.stringify(
      await Promise.all([
        admin.from("leads").select("id, updated_at, status, not_collected").in("created_by", [a.id, ownerId]).order("id").then((r) => r.data),
        admin.from("lead_events").select("id").in("lead_id", everyLead).order("id").then((r) => r.data),
        admin.from("slot_holds").select("id, released_at, renewed_at").in("holder_id", [a.id, ownerId]).order("id").then((r) => r.data),
        admin.from("meetings").select("id, status, starts_at").in("lead_id", everyLead).order("id").then((r) => r.data),
        admin.from("knock_sessions").select("id, doors_knocked, conversations, ended_at").in("user_id", [a.id, ownerId]).order("id").then((r) => r.data),
        admin.from("lead_photos").select("id").in("lead_id", everyLead).order("id").then((r) => r.data),
        admin.storage.from(BUCKET).list(a.id, { limit: 1000 }).then((r) => (r.data ?? []).map((file) => file.name).sort()),
        admin.storage.from(BUCKET).list(ownerId, { limit: 1000 }).then((r) => (r.data ?? []).map((file) => file.name).sort()),
        admin.from("profiles").select("welcome_done_at").eq("id", a.id).single().then((r) => r.data),
        admin.from("push_subscriptions").select("id").in("profile_id", [a.id, ownerId]).then((r) => r.data),
      ]),
    );
  const clickBefore = await clickFootprint();
  const calm = (root) => root.getByTestId("view-as-nothing-saved").first().innerText({ timeout: 10000 }).then((text) => text.trim()).catch(() => "");
  const sheetOf = op.getByTestId("booking-sheet");
  const sheetView = (view) => op.locator(`[data-testid="booking-sheet"][data-view="${view}"]`).waitFor({ timeout: 20000 });
  const pickIn = (legend, choice) =>
    op
      .locator('[data-testid="booking-sheet"] fieldset')
      .filter({ has: op.locator("legend", { hasText: new RegExp(`^${legend}$`) }) })
      .getByText(choice, { exact: true })
      .click();
  const sheetNext = () => op.getByTestId("sheet-next").click();
  const leftOnSheet = async () => {
    const text = (await op.getByTestId("sheet-countdown").innerText().catch(() => "")).trim();
    const match = /^(\d+):(\d{2}) left$/.exec(text);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };

  // The booking sheet, from a tapped time on Schedule.
  await op.goto(`${base}/app/schedule`);
  await settle(op);
  await op.getByRole("group", { name: "Evenings" }).getByRole("button").last().click();
  await op.waitForTimeout(500);
  await op.locator('main [data-testid="time-picker"] [data-state="open"]').first().click();
  await sheetView("who");
  const actedLeft = await leftOnSheet();
  check(
    "tapping an open time while viewing opens the sheet with its hold acted out: the time and a countdown, nothing held",
    (await op.getByTestId("sheet-held").getAttribute("data-held")) === "yes" && actedLeft !== null && actedLeft > 200,
    `${actedLeft} s`,
  );
  await op.fill("#sheet-first-name", "View as (test)");
  await op.fill("#sheet-phone", "403 555 0101");
  await sheetNext();
  await sheetView("door");
  await pickIn("Owns the home", "Yes");
  await pickIn("Wants a price", "Yes");
  await pickIn("Everyone who decides will be there", "Yes");
  await sheetNext();
  await sheetView("learned");
  await op.getByTestId("mark-rest").click();
  await sheetNext();
  await sheetView("address");
  check("every step of the sheet works while viewing, with nothing saved between them", true);
  await op.fill("#lead-address", "1 View As Test Way NW (TEST)");
  await op.getByTestId("sheet-heading").click();
  await sheetOf.getByRole("button", { name: "Use where I'm standing" }).click();
  await sheetOf.getByText(/accurate to about 10 m/).first().waitFor({ timeout: 15000 });
  await pickIn("Soffit colour", "White");
  await sheetNext();
  await sheetView("house");
  check("the photo step opens even though nothing was saved, with each slot ready", (await sheetOf.getByRole("button", { name: "Take photo, Front" }).count()) === 1);
  await op.setInputFiles('[data-testid="booking-sheet"] [data-testid="slot-input-front"]', fixture);
  await sheetOf.locator('img[alt="Front photo of the house"]').waitFor({ timeout: 10000 }).catch(() => {});
  const photoNote = await calm(sheetOf);
  check("a photo taken while viewing shows on screen only, with a calm note", photoNote === "View as: nothing was saved." && (await sheetOf.locator('img[alt="Front photo of the house"]').count()) === 1, photoNote);
  await op.setInputFiles('[data-testid="booking-sheet"] [data-testid="slot-upload-left_corner"]', fixture);
  await op.setInputFiles('[data-testid="booking-sheet"] [data-testid="slot-input-right_corner"]', fixture);
  await op.waitForTimeout(500);
  await sheetNext();
  await sheetView("book");
  const actedTicks = await sheetOf.getByTestId("readiness").locator("li").evaluateAll((items) => items.map((item) => item.getAttribute("data-ok")));
  check("Before you book reads as it would for the setter, the acted-out photos included", actedTicks.length === 7 && actedTicks.every((tick) => tick === "yes"), actedTicks.join(","));
  // The time's menu: Add 5 minutes is acted out too.
  const beforeAdd = await leftOnSheet();
  await op.getByTestId("sheet-held").click();
  await op.getByTestId("hold-menu").getByRole("menuitem", { name: /^Add \d+ minutes$/ }).click();
  await op.waitForTimeout(600);
  const afterAdd = await leftOnSheet();
  check("Add 5 minutes is acted out: the countdown moves on, nothing is held", beforeAdd !== null && afterAdd !== null && afterAdd > beforeAdd + 200, `${beforeAdd} then ${afterAdd}`);
  await sheetNext();
  const bookNote = await calm(sheetOf);
  check("Book, the final save, says calmly that nothing was saved", bookNote === "View as: nothing was saved." && (await op.locator('[data-testid="booking-sheet"][data-view="book"]').count()) === 1, bookNote);
  await op.screenshot({ path: `${out}/r2-view-as-book.png` });
  await op.getByTestId("sheet-held").click();
  await op.getByTestId("hold-menu").getByRole("menuitem", { name: "Let go" }).click();
  await op.getByTestId("sheet-let-go").getByRole("button", { name: "Let go", exact: true }).click();
  await sheetOf.waitFor({ state: "detached", timeout: 15000 });
  const viewDrafts = await op.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("vesper:sheet-drafts:") || key.startsWith("vesper.booking-sheet.")));
  check("leaving the sheet while viewing keeps no draft on Keenan's phone", viewDrafts.length === 0, viewDrafts.join(", "));

  // Keep as a lead while viewing: nothing is held, so nothing is let go, and
  // New lead opens with the person, kept in memory only.
  await op.goto(`${base}/app/schedule`);
  await settle(op);
  await op.getByRole("group", { name: "Evenings" }).getByRole("button").last().click();
  await op.waitForTimeout(500);
  await op.locator('main [data-testid="time-picker"] [data-state="open"]').first().click();
  await sheetView("who");
  await op.fill("#sheet-first-name", "View as keep (test)");
  await op.fill("#sheet-phone", "403 555 0102");
  await sheetNext();
  await sheetView("door");
  await pickIn("Owns the home", "Yes");
  await pickIn("Wants a price", "Not yet");
  await sheetOf.getByTestId("keep-as-lead").click();
  await op.waitForURL("**/app/leads/new", { timeout: 30000 });
  await settle(op);
  const keptNotice = (await op.getByTestId("draft-restored").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const keptStored = await op.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("vesper:new-lead-draft:") || key.startsWith("vesper:sheet-drafts:")));
  check(
    "Keep as a lead works while viewing: New lead opens with the person, and nothing is kept on Keenan's phone",
    keptNotice.startsWith("Kept as a lead") && (await op.inputValue("#lead-first_name")) === "View as keep (test)" && keptStored.length === 0,
    `${keptNotice} | ${keptStored.join(", ")}`,
  );

  // Session: the knock counters, the start time and End knocking are acted
  // out, and the Unfinished list says where drafts live.
  await op.goto(`${base}/app/session`);
  await settle(op);
  const doorsBefore = Number((await op.getByRole("button", { name: /^Doors \+1, now (\d+)/ }).getAttribute("aria-label")).match(/now (\d+)/)[1]);
  await op.getByRole("button", { name: /^Doors \+1/ }).click();
  await op.getByRole("button", { name: /^Doors \+1/ }).click();
  const doorsAfter = Number((await op.getByRole("button", { name: /^Doors \+1, now (\d+)/ }).getAttribute("aria-label")).match(/now (\d+)/)[1]);
  const knockNote = await calm(op.locator("main"));
  check("the knock counters count on screen while viewing, and say nothing was saved", doorsAfter === doorsBefore + 2 && knockNote === "View as: nothing was saved.", `${doorsBefore} then ${doorsAfter}; ${knockNote}`);
  check("Session shows no Unfinished list while viewing: a setter's drafts stay on their own phone", (await op.getByTestId("unfinished").count()) === 0);
  check(
    "and Session says why, for Keenan",
    (await op.getByTestId("unfinished-view-as").innerText().catch(() => "")).trim() === "Unfinished bookings stay on Nav Test A's phone, so they don't show here.",
  );
  await op.getByTestId("fix-start").click();
  await op.fill("#fix-start-time", "00:01");
  await op.getByTestId("fix-start-panel").getByRole("button", { name: "Save", exact: true }).click();
  const fixedLine = (await op.getByTestId("session-started").innerText()).trim();
  check(
    "fixing the start time is acted out while viewing, and says nothing was saved",
    fixedLine.startsWith("Started 12:01") && (await calm(op.locator("main"))) === "View as: nothing was saved.",
    fixedLine,
  );
  await op.getByRole("button", { name: "End knocking" }).click();
  await op.getByRole("button", { name: "Yes, end it" }).click();
  const actedSummary = (await op.getByTestId("session-summary").innerText().catch(() => "")).replace(/\s+/g, " ");
  check(
    "End knocking is acted out too: the summary shows, says nothing was saved, and Start knocking is back",
    actedSummary.includes(`Done in ${TEST_PLACE}`) && actedSummary.includes(`${doorsAfter} doors`) && actedSummary.includes("View as: nothing was saved.") &&
      (await op.getByRole("button", { name: "Start knocking" }).count()) === 1,
    actedSummary,
  );

  // New lead: Save is refused calmly; a photo is acted out.
  await op.goto(`${base}/app/leads/new`);
  await settle(op);
  await op.fill("#lead-address", "2 View As Test Way NW (TEST)");
  await op.keyboard.press("Escape");
  await op.fill("#lead-first_name", "View as (test)");
  await op.getByTestId("mark-rest").click();
  await op.setInputFiles('[data-testid="slot-input-front"]', fixture);
  await op.locator('main img[alt="Front photo of the house"]').waitFor({ timeout: 10000 }).catch(() => {});
  await op.getByRole("button", { name: "Save lead" }).click();
  await op.waitForTimeout(1500);
  const saveNotes = await op.locator("main").getByTestId("view-as-nothing-saved").allInnerTexts();
  check(
    "New lead's Save says calmly that nothing was saved, and stays on the form with everything entered",
    saveNotes.some((text) => text.trim() === "View as: nothing was saved.") && new URL(op.url()).pathname === "/app/leads/new" && (await op.inputValue("#lead-first_name")) === "View as (test)",
    saveNotes.join(" | "),
  );
  check("nothing in it reads as an error", (await op.locator("main").getByRole("alert").count()) === 0);

  // A note and a status on the setter's own lead: refused calmly by the server.
  await op.goto(`${base}/app/leads/${leads.dueToday}`);
  await settle(op);
  await op.fill("#lead-note", "TEST View as note (automated)");
  await op.getByRole("button", { name: "Add note" }).click();
  const noteNote = await calm(op.locator("main"));
  check("a note sent while viewing reaches the server, which refuses it calmly", noteNote === "View as: nothing was saved.", noteNote);
  const viewStatus = op.locator("main fieldset").filter({ has: op.locator("legend", { hasText: /^Status$/ }) });
  await viewStatus.getByText("Lost", { exact: true }).click();
  await op.locator("main fieldset", { hasText: "Why was it lost?" }).getByText("Price", { exact: true }).click();
  await op.getByRole("button", { name: "Save status" }).click();
  await op.waitForTimeout(1500);
  check("a status change is refused the same way", (await op.locator("main").getByTestId("view-as-nothing-saved").count()) >= 1 && (await op.locator("main").getByRole("alert").count()) === 0);

  // Notifications: no permission prompt, nothing saved.
  await op.goto(`${base}/app/notifications`);
  await settle(op);
  const turnOn = op.getByRole("button", { name: /Turn on notifications here/ });
  if ((await turnOn.count()) === 1) {
    await turnOn.click();
    check("turning notifications on while viewing asks the device nothing and says nothing was saved", (await calm(op.locator("main"))) === "View as: nothing was saved.");
  } else {
    note("Notifications aren't set up on this site (no keys), so its switch was not clicked through.");
  }

  // The welcome: Skip is refused calmly.
  await op.goto(`${base}/app/welcome`);
  await settle(op);
  await op.getByTestId("welcome-skip-all").click();
  await op.waitForTimeout(1500);
  check("skipping the welcome while viewing says calmly that nothing was saved", (await calm(op.locator("main"))) === "View as: nothing was saved." && new URL(op.url()).pathname === "/app/welcome");

  // The proxy still refuses any plain write that isn't one of the app's own actions.
  const plainWrite = await op.evaluate(async () => {
    const response = await fetch("/app/leads", { method: "POST", body: "x" });
    return { status: response.status, text: (await response.text()).trim() };
  });
  check("a plain write that isn't one of the app's actions is refused at the door", plainWrite.status === 403 && plainWrite.text === "View as: nothing was saved.", JSON.stringify(plainWrite));
  check("clicking through View as wrote nothing at all", (await clickFootprint()) === clickBefore);

  // Exit goes back to People and ends View as.
  await op.goto(`${base}/app`);
  await settle(op);
  await op.getByRole("status").filter({ hasText: "Viewing as" }).getByRole("button", { name: "Exit" }).click();
  await op.waitForURL("**/app/admin/people", { timeout: 20000 });
  const stillSet = (await ownerContext.cookies()).some((cookie) => cookie.name === VIEW_AS_COOKIE);
  check("Exit returns to People and ends View as", (await op.getByText("Viewing as").count()) === 0 && !stillSet);

  await ownerSession.close();
  ownerSession = null;
  const after = await ownerFootprint(ownerId);
  const emailsAfter = await accountEmails();
  check("nothing of the owner's changed: profile, settings, leads, timeline and knock sessions", before === after);
  check("no account was created from the owner's screens", emailsAfter.length === emailsBefore.length && !emailsAfter.some((email) => email === "not-an-email"));
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)} at ${page.url()}${ownerPage ? ` / owner at ${ownerPage.url()}` : ""}`);
  await page.screenshot({ path: `${out}/m25-failure.png`, fullPage: true }).catch(() => {});
  if (ownerPage) await ownerPage.screenshot({ path: `${out}/m25-owner-failure.png`, fullPage: true }).catch(() => {});
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  for (const person of Object.values(people)) {
    if (person.id) await removeEverythingOf(person.id);
  }
  const emails = await accountEmails();
  const leftoverUsers = emails.filter((email) => email.startsWith("nav-live-"));
  const { count: leftoverLeads } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("first_name", TEST_LEAD);
  check("the throwaway setters, their leads and sessions are gone", leftoverUsers.length === 0 && leftoverLeads === 0, `${leftoverUsers.length} accounts, ${leftoverLeads} test leads left`);
  results.push(`accounts remaining: ${JSON.stringify(emails)}`);
  await browser.close();
}

console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
