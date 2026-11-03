// Live walk-through of the setter side (Keenan, 2026-11-03) against a
// running build, on an iPhone-sized browser:
//   - a new setter's first sign-in lands on the welcome: the home screen
//     with the iPhone steps, location, notifications, then how a door goes;
//     each step can be skipped, and once done it never shows again;
//   - the bell in the header opens the setter's Notifications, which can
//     open the welcome again;
//   - Keenan's Reset welcome shows in People, seen through the one-time
//     owner session (rule 10), which only views: the reset itself is made
//     by the service role standing in for him, as in the other suites;
//   - View as shows the welcome and Notifications as the setter has them,
//     never sends Keenan into the setter's welcome, and lets him tap
//     through them (round 2): every write is refused calmly and nothing is
//     saved.
// A real phone's push service can't be reached from here: the unit tests
// cover what a setter's notice says and who gets it. Everything made here
// is removed at the end, and nothing of the owner's may change.
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The setter side walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const setter = { email: `ss-live-a-${stamp}@example.com`, password: `cedar-harbor-lantern-${digits}`, name: "Sam Welcometest", id: null };
const DEVICE_SEALED = "v1.walkthrough-test-device-never-sent";
const { defaultBrowserType, ...iphone } = devices["iPhone 14"];
void defaultBrowserType;

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
  for (const text of ["Checking this phone.", "Checking this device."]) {
    await page.getByText(text).first().waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  }
}

async function signIn(page, landing) {
  await page.goto(`${base}/login`);
  await settle(page);
  await page.fill("#email", setter.email);
  await page.fill("#password", setter.password);
  await page.click("button[type=submit]");
  await page.waitForURL(landing, { timeout: 30000 });
  await settle(page);
}

const path = (page) => new URL(page.url()).pathname + new URL(page.url()).search;
const welcomeOf = async () => (await admin.from("profiles").select("welcome_done_at").eq("id", setter.id).single()).data?.welcome_done_at ?? null;
const tabsShowing = (page) => page.locator('nav[aria-label="Tabs"]:visible').count();
const mainText = async (page) => (await page.locator("main").innerText()).replace(/\s+/g, " ");

function tooSmall(page, selector) {
  return page.evaluate((sel) => {
    const offenders = [];
    for (const el of document.querySelectorAll(sel)) {
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      if (box.width < 44 || box.height < 44) offenders.push(`${(el.textContent || "").trim().slice(0, 24)} ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    return offenders;
  }, selector);
}

// Where a page sends you, without following it, asked from inside the
// browser (its own network path, so it works against a deployed site): the
// refresh tag Next.js writes when the redirect comes after streaming began.
async function redirectTarget(page, address) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { redirect: "manual", credentials: "include" });
    if (response.type === "opaqueredirect") return "a redirect the browser hides";
    const meta = (await response.text()).match(/__next-page-redirect"[^>]*url=([^"]+)"/);
    return meta ? new URL(meta[1], location.origin).pathname : `status ${response.status}, no redirect`;
  }, address);
}

async function ownerFootprint(ownerId) {
  const [profile, sessions, leads, events, settings, devicesRows] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).single(),
    admin.from("knock_sessions").select("*").eq("user_id", ownerId).order("id"),
    admin.from("leads").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("lead_events").select("id").eq("actor_id", ownerId).order("id"),
    admin.from("settings").select("*").eq("id", 1).single(),
    admin.from("push_subscriptions").select("id, removed_at").eq("profile_id", ownerId).order("id"),
  ]);
  return JSON.stringify({ profile: profile.data, sessions: sessions.data, leads: leads.data, events: events.data, settings: settings.data, devices: devicesRows.data });
}

async function accountEmails() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users ?? []).map((u) => u.email ?? "");
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
let ownerSession = null;
let page = null;
let ownerPage = null;

try {
  // ---------------------------------------------------------------- setup
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: setter.name },
    app_metadata: { role: "sales" },
  });
  if (createError) throw new Error(`createUser: ${createError.message}`);
  setter.id = created.user.id;
  const { data: ownerRow } = await admin.from("profiles").select("id").eq("role", "owner").single();
  const ownerId = ownerRow.id;
  const before = await ownerFootprint(ownerId);
  const emailsBefore = await accountEmails();
  check("a new setter starts with the welcome not done", (await welcomeOf()) === null);

  // ---------------------------------------------------------------- 1. first sign-in
  const context = await browser.newContext(iphone);
  page = await context.newPage();
  await signIn(page, "**/app/welcome");
  check("the first sign-in lands on the welcome, not Home", path(page) === "/app/welcome", path(page));
  await page.screenshot({ path: `${out}/ss-welcome-1.png`, fullPage: true });
  check(
    "step 1 greets them and shows the iPhone steps for the home screen",
    (await page.getByTestId("welcome-greeting").innerText()) === "Welcome, Sam" &&
      (await page.getByTestId("welcome-title").innerText()) === "Add Vesper to your home screen" &&
      (await page.getByTestId("welcome-how").innerText()).includes("Add to Home Screen"),
    await page.getByTestId("welcome-greeting").innerText(),
  );
  const progress = page.getByRole("progressbar", { name: "Welcome steps" });
  check("the progress reads step 1 of 4", (await progress.getAttribute("aria-valuetext")) === "Step 1 of 4: Home screen");
  check("the tab bar steps aside on the welcome", (await tabsShowing(page)) === 0);
  check(
    "the bottom bar has Back (off on the first step), Skip this step and Skip the welcome",
    (await page.getByRole("button", { name: "Back" }).isDisabled()) &&
      (await page.getByTestId("welcome-next").innerText()) === "Skip this step" &&
      (await page.getByTestId("welcome-skip-all").count()) === 1,
  );
  const small = await tooSmall(page, "main a[href], main button");
  check("every link and button on the welcome is at least 44 px", small.length === 0, small.join(", "));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("the welcome fits a phone with no sideways scroll", overflow <= 0, `${overflow}px`);
  check("opening the welcome writes nothing", (await welcomeOf()) === null);

  // ---------------------------------------------------------------- 2. location
  await page.getByTestId("welcome-next").click();
  await page.waitForURL("**/app/welcome?step=2");
  await settle(page);
  check("Skip this step moves on to location", (await page.getByTestId("welcome-title").innerText()) === "Allow location");
  check("the location step explains Use where I'm standing", (await mainText(page)).includes("Use where I'm standing puts the lead on the map"));
  await page.getByTestId("welcome-allow-location").click();
  await page.getByTestId("welcome-location-blocked").waitFor({ timeout: 15000 }).catch(() => {});
  check("a blocked answer says so plainly, and the rest still works", (await page.getByTestId("welcome-location-blocked").count()) === 1);
  await context.grantPermissions(["geolocation"], { origin: base });
  await context.setGeolocation({ latitude: 51.0447, longitude: -114.0719, accuracy: 10 });
  await page.reload();
  await settle(page);
  check(
    "once allowed, the step says so and Next replaces Skip",
    (await page.getByTestId("welcome-location-done").count()) === 1 && (await page.getByTestId("welcome-next").innerText()) === "Next",
  );

  // ---------------------------------------------------------------- 3. notifications
  await page.getByTestId("welcome-next").click();
  await page.waitForURL("**/app/welcome?step=3");
  await settle(page);
  check("then notifications", (await page.getByTestId("welcome-title").innerText()) === "Turn on notifications");
  const pushText = await mainText(page);
  check(
    "the notifications step says what a notice names, and never the house or the customer",
    pushText.includes("A notice names the street only, never the house number or the customer, because it shows on your lock screen."),
  );
  // This browser has no push service: it answers blocked, or the keys
  // aren't set on this server. Either is said plainly.
  check(
    "it says honestly whether notifications can be turned on here",
    pushText.includes("Notifications are blocked for Vesper on this device") ||
      (await page.getByTestId("welcome-push-not-set-up").count()) === 1 ||
      (await page.getByTestId("welcome-turn-on").count()) === 1,
    pushText.slice(pushText.indexOf("lock screen."), pushText.indexOf("lock screen.") + 120),
  );

  // ---------------------------------------------------------------- 4. the door
  await page.getByTestId("welcome-next").click();
  await page.waitForURL("**/app/welcome?step=4");
  await settle(page);
  const tour = await page.getByTestId("welcome-tour").innerText();
  check(
    "the last screen is how a door goes: knock session, pick a time, the booking sheet",
    (await page.getByTestId("welcome-title").innerText()) === "How a door goes" &&
      tour.includes("Start knocking on Home.") &&
      tour.includes("Pick a time on Schedule.") &&
      tour.includes("Book it in the sheet.") &&
      tour.includes("At the door, After the door, then Book."),
  );
  check("the progress reads step 4 of 4", (await progress.getAttribute("aria-valuetext")) === "Step 4 of 4: How a door goes");
  await page.getByTestId("welcome-back").click();
  await page.waitForURL("**/app/welcome?step=3");
  check("Back goes to the step before", (await page.getByTestId("welcome-title").innerText()) === "Turn on notifications");
  await page.getByTestId("welcome-next").click();
  await page.waitForURL("**/app/welcome?step=4");
  await settle(page);
  await page.screenshot({ path: `${out}/ss-welcome-4.png`, fullPage: true });
  const copy = (await mainText(page)) + pushText;
  check("the welcome's words have no em or en dashes", !/[–—]/.test(copy));

  await page.getByTestId("welcome-done").click();
  await page.waitForURL((u) => new URL(u).pathname === "/app", { timeout: 20000 });
  await settle(page);
  const doneAt = await welcomeOf();
  check("Done goes Home and stamps the welcome done", path(page) === "/app" && doneAt !== null && (await tabsShowing(page)) === 1, String(doneAt));

  // ---------------------------------------------------------------- 5. never again
  await page.goto(`${base}/app`);
  await settle(page);
  check("Home stays Home once the welcome is done", path(page) === "/app");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByTestId("sign-out").getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login**", { timeout: 20000 });
  await signIn(page, (u) => new URL(u).pathname === "/app");
  check("signing in again goes straight Home", path(page) === "/app", path(page));

  // ---------------------------------------------------------------- 6. the bell
  const bell = page.getByTestId("bell");
  check("setters have a bell in the header, named Notifications", (await bell.count()) === 1 && (await bell.getAttribute("aria-label")) === "Notifications");
  await bell.click();
  await page.waitForURL("**/app/notifications");
  await settle(page);
  await page.getByTestId("welcome-again").waitFor({ timeout: 20000 }).catch(() => {});
  const notifText = await mainText(page);
  const notifParts = {
    heading: await page.getByRole("heading", { level: 1, name: "Notifications" }).count(),
    names: notifText.includes("A notice names the street only, never the house number or the customer"),
    card: await page.getByTestId("notifications").count(),
    again: await page.getByTestId("welcome-again").count(),
  };
  check(
    "the bell opens the setter's Notifications: what a notice names, this device, and the welcome",
    notifParts.heading === 1 && notifParts.names && notifParts.card === 1 && notifParts.again === 1,
    JSON.stringify(notifParts),
  );
  check("Notifications is marked as the open page", (await bell.getAttribute("aria-current")) === "page");
  check("a setter's card never offers Keenan's key maker", (await page.getByTestId("push-key-setup").count()) === 0);
  await page.screenshot({ path: `${out}/ss-notifications.png`, fullPage: true });
  await page.getByTestId("welcome-again").click();
  await page.waitForURL("**/app/welcome");
  await settle(page);
  check("See the welcome again opens it at the first step", (await page.getByTestId("welcome-title").innerText()) === "Add Vesper to your home screen");
  await page.getByTestId("welcome-skip-all").click();
  await page.waitForURL((u) => new URL(u).pathname === "/app", { timeout: 20000 });
  check(
    "Skip the welcome goes Home and keeps the first time it was done",
    path(page) === "/app" && new Date(await welcomeOf()).getTime() === new Date(doneAt).getTime(),
  );

  // ---------------------------------------------------------------- 6b. New lead keeps a draft
  // The camera can reload an iPhone mid-lead: what was entered comes back.
  // Nothing here is saved.
  await page.goto(`${base}/app/leads/new`);
  await settle(page);
  await page.fill("#lead-first_name", "Draft (test)");
  await page.fill("#lead-phone", "403 555 0142");
  await page.waitForTimeout(700);
  await page.reload();
  await settle(page);
  await page.getByTestId("draft-restored").waitFor({ timeout: 10000 }).catch(() => {});
  check(
    "New lead brings back what was entered after a reload",
    (await page.getByTestId("draft-restored").count()) === 1 &&
      (await page.inputValue("#lead-first_name")) === "Draft (test)" &&
      (await page.inputValue("#lead-phone")).replace(/\D/g, "").endsWith("4035550142"),
    `${await page.inputValue("#lead-first_name")} / ${await page.inputValue("#lead-phone")}`,
  );
  await page.getByRole("button", { name: "Cancel" }).click();
  const discardDialog = page.getByTestId("discard-lead");
  await discardDialog.getByText("Discard this lead?").waitFor({ timeout: 5000 }).catch(() => {});
  check("X asks before throwing away what was entered", (await discardDialog.getByText("Discard this lead?").count()) === 1);
  await discardDialog.getByRole("button", { name: "Keep going" }).click();
  await page.getByRole("button", { name: "Start over" }).click();
  await page.waitForTimeout(300);
  const keptDrafts = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("vesper:new-lead-draft:")).length);
  check("Start over empties the form and forgets the draft", (await page.inputValue("#lead-first_name")) === "" && keptDrafts === 0, `${keptDrafts} kept`);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForURL((u) => new URL(u).pathname === "/app/leads", { timeout: 15000 });
  check("with nothing entered, X leaves straight away", path(page).startsWith("/app/leads"));
  const { count: draftLeads } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("created_by", setter.id);
  check("no lead was saved by the draft checks", draftLeads === 0, String(draftLeads));

  // ---------------------------------------------------------------- 7. Keenan's side
  const ownerContext = await browser.newContext(iphone);
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  ownerPage = await ownerContext.newPage();
  const op = ownerPage;
  await op.goto(`${base}/app/admin/people`);
  await settle(op);
  const row = op.locator("tr", { hasText: setter.email });
  check(
    "People shows the setter's welcome as done, with Reset welcome",
    (await row.getByTestId("welcome-status").innerText()).startsWith("Welcome done") && (await row.getByTestId("reset-welcome").count()) === 1,
  );
  const ownerRowText = op.locator("tr", { hasText: "info@vesperlighting.ca" });
  check("Keenan's own row has no welcome", (await ownerRowText.getByTestId("welcome-status").count()) === 0 && (await ownerRowText.getByTestId("reset-welcome").count()) === 0);
  // The owner session only views: the reset is made by the service role.
  const reset = await admin.rpc("reset_welcome", { p_profile_id: setter.id });
  check("a reset clears the setter's welcome", reset.data === true && (await welcomeOf()) === null);
  await op.reload();
  await settle(op);
  check(
    "People then shows it not done yet, with no Reset welcome",
    (await row.getByTestId("welcome-status").innerText()) === "Welcome not done yet" && (await row.getByTestId("reset-welcome").count()) === 0,
  );
  await page.goto(`${base}/app`);
  await page.waitForURL("**/app/welcome", { timeout: 20000 });
  check("after a reset, the setter's next Home shows the welcome again", path(page) === "/app/welcome");

  // The owner never gets the welcome, and his Notifications are in Settings.
  // Read without following, so his own Home never renders here.
  const ownerWelcome = await redirectTarget(op, `${base}/app/welcome`);
  const ownerBell = await redirectTarget(op, `${base}/app/notifications`);
  check(
    "Keenan is sent Home from the welcome, and to Settings from Notifications",
    ownerWelcome === "/app" && ownerBell === "/app/admin/settings",
    `${ownerWelcome} / ${ownerBell}`,
  );

  // ---------------------------------------------------------------- 8. View as
  const { data: device, error: deviceError } = await admin
    .from("push_subscriptions")
    .insert({ profile_id: setter.id, endpoint_hash: `${stamp}`.padEnd(64, "0").replace(/[^0-9a-f]/g, "b").slice(0, 64), sealed: DEVICE_SEALED, label: "iPhone" })
    .select("id")
    .single();
  if (deviceError) throw new Error(`device: ${deviceError.message}`);
  await op.goto(`${base}/app/admin/people`);
  await settle(op);
  await row.getByRole("button", { name: "View as" }).click();
  await op.waitForURL("**/app", { timeout: 30000 });
  await settle(op);
  check("View as opens the setter's Home, never their welcome, even while it isn't done", path(op) === "/app" && (await welcomeOf()) === null);
  await op.goto(`${base}/app/welcome`);
  await settle(op);
  check(
    "View as shows the welcome as the setter has it, under the gold bar, with its buttons live",
    (await op.getByRole("status").filter({ hasText: `Viewing as ${setter.name}. Read only.` }).count()) === 1 &&
      !(await op.getByTestId("welcome-skip-all").isDisabled()) &&
      (await op.getByTestId("welcome-how").innerText()).includes("Add to Home Screen"),
  );
  await op.getByTestId("welcome-next").click();
  await op.waitForURL("**/app/welcome?step=2");
  await settle(op);
  await op.getByTestId("welcome-allow-location").click();
  check(
    "Keenan can page through it and tap Allow location: his own phone is never asked, and nothing is saved",
    (await op.getByTestId("welcome-title").innerText()) === "Allow location" &&
      (await op.locator("main").getByTestId("view-as-nothing-saved").innerText({ timeout: 5000 }).catch(() => "")) === "View as: nothing was saved.",
  );
  await op.goto(`${base}/app/welcome?step=4`);
  await settle(op);
  // Done is a final save: the server refuses it, and the screen says so calmly.
  await op.getByTestId("welcome-done").click();
  const doneNote = (await op.getByTestId("welcome-error").innerText({ timeout: 15000 }).catch(() => "")).trim();
  check(
    "finishing the welcome while viewing is refused calmly, and nothing is saved",
    doneNote === "View as: nothing was saved." && (await op.getByTestId("welcome-error").getByRole("alert").count()) === 0 && (await welcomeOf()) === null && path(op) === "/app/welcome?step=4",
    `${doneNote} at ${path(op)}`,
  );

  await op.goto(`${base}/app/notifications`);
  await settle(op);
  await op.getByTestId("welcome-again").waitFor({ timeout: 20000 }).catch(() => {});
  if ((await op.getByTestId("push-not-set-up").count()) === 1) {
    // A site without the push keys yet shows every setter the same line.
    check(
      "View as shows Notifications as the setter sees it: not set up yet, until the keys are in",
      (await op.getByText("Notifications aren't set up yet.").count()) === 1 && (await op.getByTestId("welcome-again").count()) === 1,
    );
  } else {
    const viewedDevices = await op.getByTestId("devices").innerText().catch(() => "");
    await op.getByRole("button", { name: "Send a test notification" }).click();
    const testNote = (await op.locator("main").getByTestId("view-as-nothing-saved").innerText({ timeout: 5000 }).catch(() => "")).trim();
    await op.getByRole("button", { name: "Switch off" }).first().click();
    check(
      "View as lists the setter's own devices on Notifications; a test or a switch-off is acted out calmly, and nothing is sent or saved",
      viewedDevices.includes("iPhone") && testNote === "View as: nothing was saved.",
      `${viewedDevices} | ${testNote}`,
    );
  }
  check("View as never shows a device's push address", !(await op.content()).includes(DEVICE_SEALED));
  await op.goto(`${base}/app/notifications`);
  await settle(op);
  await op.getByRole("status").filter({ hasText: "Viewing as" }).getByRole("button", { name: "Exit" }).click();
  await op.waitForURL("**/app/admin/people", { timeout: 20000 });
  check("Exit ends View as", (await op.getByText("Viewing as").count()) === 0);
  const { data: still } = await admin.from("push_subscriptions").select("removed_at, last_sent_at").eq("id", device.id).single();
  check("the setter's device is untouched by View as", still?.removed_at === null && still?.last_sent_at === null);

  await ownerSession.close();
  ownerSession = null;
  const after = await ownerFootprint(ownerId);
  const emailsAfter = await accountEmails();
  check("nothing of the owner's changed: profile, settings, leads, timeline, knock sessions and devices", before === after);
  check("no account was created from the owner's screens", emailsAfter.length === emailsBefore.length);
  await context.close();
  await ownerContext.close();
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)} at ${page?.url() ?? "(no page)"}${ownerPage ? ` / owner at ${ownerPage.url()}` : ""}`);
  if (page) await page.screenshot({ path: `${out}/ss-failure.png`, fullPage: true }).catch(() => {});
  if (ownerPage) await ownerPage.screenshot({ path: `${out}/ss-owner-failure.png`, fullPage: true }).catch(() => {});
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  await browser.close();
  if (setter.id) {
    await admin.from("push_subscriptions").delete().eq("profile_id", setter.id);
    await admin.from("knock_sessions").delete().eq("user_id", setter.id);
    await admin.from("leads").delete().eq("created_by", setter.id);
    const { error } = await admin.auth.admin.deleteUser(setter.id);
    check("cleanup: the test setter and their device are removed", !error, error?.message);
  }
}

for (const line of results) console.log(line);
const failed = results.filter((line) => !line.startsWith("PASS")).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
