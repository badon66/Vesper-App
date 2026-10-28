// Live walk-through of M2.5 against a running build: the tab bar and side
// rail, both Homes, Leads in attention order with All and search, the
// follow-up day, sign-in keeping the email, Settings and Add a Vesper member
// keeping what was typed, the old addresses, and View as compared screen by
// screen with what a real test setter sees.
//
// Two throwaway setters do the setter side; their leads are named
// "TEST LEAD (automated)" and everything they make is deleted at the end.
// The owner side uses the one-time owner session Keenan approved
// (owner-session.mjs). It only views screens and submits forms that are
// refused before anything saves, and the run checks that nothing of the
// owner's changed.
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
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
const calendarDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" });
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

// What a screen shows: its tabs, the text of the screen, and its controls.
function capture(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const text = (main?.innerText ?? "").replace(/\s+/g, " ").trim();
    const tabs = [...document.querySelectorAll('nav[aria-label="Tabs"]')]
      .filter((nav) => getComputedStyle(nav).display !== "none")
      .flatMap((nav) => [...nav.querySelectorAll("a")].map((a) => a.textContent.trim()));
    const controls = [...(main?.querySelectorAll("button, input:not([type=hidden]), select, textarea") ?? [])]
      .filter((el) => getComputedStyle(el).display !== "none")
      .map((el) => ({
        label: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.id || "").replace(/\s+/g, " ").trim(),
        disabled: el.matches(":disabled"),
      }));
    return { text, tabs, controls };
  });
}

function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i >= a.length && i >= b.length ? "" : `at ${i}: "${a.slice(Math.max(0, i - 30), i + 50)}" vs "${b.slice(Math.max(0, i - 30), i + 50)}"`;
}

function tapTargetsTooSmall(page) {
  return page.evaluate(() => {
    const offenders = [];
    const selector =
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="option"], label:has(input[type="radio"])';
    for (const element of document.querySelectorAll(selector)) {
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
  });
}

async function checkTapTargets(page, screen) {
  const small = await tapTargetsTooSmall(page);
  check(`tap targets on ${screen} are at least 44 px`, small.length === 0, small.join("; "));
}

// Everything of the owner's that this run must leave exactly as it was.
async function ownerFootprint(ownerId) {
  const [profile, sessions, leads, events, settings] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).single(),
    admin.from("knock_sessions").select("*").eq("user_id", ownerId).order("id"),
    admin.from("leads").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("lead_events").select("id").eq("actor_id", ownerId).order("id"),
    admin.from("settings").select("*").eq("id", 1).single(),
  ]);
  return JSON.stringify({
    profile: profile.data,
    sessions: sessions.data,
    leads: leads.data,
    events: events.data,
    settings: settings.data,
  });
}

async function accountEmails() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users ?? []).map((u) => u.email ?? "");
}

async function removeEverythingOf(id) {
  await admin.from("leads").delete().eq("created_by", id);
  await admin.from("knock_sessions").delete().eq("user_id", id);
  await admin.auth.admin.deleteUser(id);
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const { defaultBrowserType, ...iphone } = devices["iPhone 14"];
void defaultBrowserType;
const setterContext = await browser.newContext(iphone);
const page = await setterContext.newPage();
let ownerSession = null;
let ownerPage = null;
const leads = {};

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
  const { data: knock, error: knockError } = await a.client
    .from("knock_sessions")
    .insert({ neighbourhood: TEST_PLACE, user_id: a.id })
    .select("id")
    .single();
  if (knockError) throw new Error(`knock session: ${knockError.message}`);
  await a.client.rpc("bump_knock_session", { p_session: knock.id, p_doors: 7, p_conversations: 3 });

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
  check("a setter's tabs are Home, New lead and Leads", JSON.stringify(await visibleTabs(page)) === JSON.stringify(["Home", "New lead", "Leads"]), (await visibleTabs(page)).join(", "));
  const bar = await page.locator('nav[aria-label="Tabs"]:visible').boundingBox();
  const viewport = page.viewportSize();
  check("on a phone the tabs sit in a bar at the bottom", bar !== null && Math.abs(bar.y + bar.height - viewport.height) <= 2 && bar.width >= viewport.width - 2, bar ? `${Math.round(bar.y)}+${Math.round(bar.height)} of ${viewport.height}` : "missing");
  check("there are no top tabs", (await page.locator("nav:visible").count()) === 1 && (await page.locator('nav[aria-label="Main"]').count()) === 0);

  // 3. The setter's Home: the knock session and the follow-ups due.
  check("Home greets the setter", (await page.getByRole("heading", { name: /^Hello, Nav/ }).count()) === 1);
  check("Home shows the knock session that is running", (await page.getByRole("heading", { name: `Knocking in ${TEST_PLACE}` }).count()) === 1 && ((await page.getByRole("button", { name: /^Add one to doors/ }).getAttribute("aria-label")) ?? "").endsWith("now 7"));
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

  // 4. Leads opens to Active, in the order things need attention.
  await page.locator('nav[aria-label="Tabs"]:visible').getByRole("link", { name: "Leads", exact: true }).click();
  await page.waitForURL("**/app/leads", { timeout: 20000 });
  await settle(page);
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
  check("the rail holds the same tabs", JSON.stringify(await visibleTabs(page)) === JSON.stringify(["Home", "New lead", "Leads"]));
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
  const ownerContext = await browser.newContext(iphone);
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  ownerPage = await ownerContext.newPage();
  const op = ownerPage;

  if (staleOwnerSession) {
    note("Keenan has a knock session left open from an earlier day; his Home would close it, so the owner Home check was skipped to keep this run read only.");
  } else {
    await op.goto(`${base}/app`);
    await settle(op);
    check("the owner's Home is today across the team", (await op.getByRole("heading", { name: "Today", exact: true }).count()) === 1 && (await op.getByText("Calgary time").count()) >= 1);
    const aRow = op.getByRole("list", { name: "The team today" }).locator("li", { hasText: "Nav Test A" });
    const aText = (await aRow.innerText()).replace(/\s+/g, " ");
    check("it shows who is knocking now, where, and their doors, conversations and leads today", aText.includes("Knocking now") && aText.includes(TEST_PLACE) && /Doors 7\b/.test(aText) && /Conversations 3\b/.test(aText) && /Leads 6\b/.test(aText), aText);
    const bText = (await op.getByRole("list", { name: "The team today" }).locator("li", { hasText: "Nav Test B" }).innerText()).replace(/\s+/g, " ");
    check("someone who only added a lead today shows too", /Leads 1\b/.test(bText) && bText.includes("No knock session today"), bText);
    check("today's leads are listed", (await op.getByRole("list", { name: "Today's leads" }).locator(`a[href="/app/leads/${leads.other}"]`).count()) === 1);
    check("the owner's tabs are Home, New lead, Leads and Admin", JSON.stringify(await visibleTabs(op)) === JSON.stringify(["Home", "New lead", "Leads", "Admin"]), (await visibleTabs(op)).join(", "));
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
    ["Admin", "/app/admin"],
    ["Settings", "/app/admin/settings"],
  ];
  for (const [label, path] of screens) {
    await page.goto(`${base}${path}`);
    await settle(page);
    const real = await capture(page);
    await op.goto(`${base}${path}`);
    await settle(op);
    const viewed = await capture(op);
    const sameControls = JSON.stringify(real.controls.map((c) => c.label)) === JSON.stringify(viewed.controls.map((c) => c.label));
    check(
      `View as shows ${label} exactly as the setter sees it`,
      real.text === viewed.text && JSON.stringify(real.tabs) === JSON.stringify(viewed.tabs) && sameControls,
      real.text === viewed.text ? (sameControls ? "" : "controls differ") : firstDifference(real.text, viewed.text),
    );
    check(`every control on ${label} is disabled while viewing`, viewed.controls.every((c) => c.disabled), viewed.controls.filter((c) => !c.disabled).map((c) => c.label).join(", "));
    check(`View as shows no prices or settings on ${label}`, !/\$|Price per foot|Booking pay|Commission/.test(viewed.text));
  }
  check("View as keeps owner screens from the setter's view", (await op.getByRole("heading", { name: "Not for your role" }).count()) === 1);

  // A write forced past the disabled screen is refused by the server.
  await op.goto(`${base}/app/leads/${leads.dueToday}`);
  await settle(op);
  await op.evaluate(() => document.querySelector("main fieldset[disabled]")?.removeAttribute("disabled"));
  await op.fill("#lead-note", "TEST forced note (automated)");
  const [refused] = await Promise.all([
    op.waitForResponse((response) => response.request().method() === "POST", { timeout: 20000 }),
    op.getByRole("button", { name: "Add note" }).click(),
  ]);
  await op.waitForTimeout(1000);
  const { count: forcedNotes } = await admin.from("lead_events").select("id", { count: "exact", head: true }).eq("lead_id", leads.dueToday).eq("type", "note");
  check("a write forced through while viewing is refused, and nothing is saved", refused.status() === 403 && forcedNotes === 0, `status ${refused.status()}, notes ${forcedNotes}`);

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
