// Live walk-through of the Meetings page (Keenan, 2026-11-02) against a
// running build. Keenan's side uses the one-time owner session he approved
// (owner-session.mjs): it looks, searches, saves tonight on the device with
// Get tonight ready (the browser's own storage, nothing in the database),
// and has the new-person form refused before anything saves. The meetings
// it shows are staged for a throwaway host at 11 pm, never in Keenan's own
// evening, on two test leads named "TEST LEAD (automated)", and everything
// made here is removed at the end.
//
// Without signal: Get tonight ready runs on a second server this
// walk-through starts from the local build, that server is stopped, and a
// meeting that was never opened on that device is opened.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const offlinePort = Number(process.env.OFFLINE_PORT_2 ?? Number(new URL(base).port || 3300) + 2);
const offlineBase = `http://localhost:${offlinePort}`;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The Meetings page walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const NEVER_SAVED = "TEST (automated) never created";
const BUCKET = "lead-photos";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const setter = { email: `m5p-live-a-${stamp}@example.com`, password: `harbor-cedar-lantern-${digits}`, name: "M5P Test Setter", id: null };
const street = `Meetingtest${stamp}`;

const ipad = { viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1, hasTouch: true };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

// Calgary's date; Alberta has stayed on UTC-6 since November 1, 2026.
const calgaryToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Etc/GMT+6", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const at11pm = (day) => new Date(`${day}T23:00:00-06:00`).toISOString();

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}

async function signIn(page, person) {
  await page.goto(`${base}/login`);
  await settle(page);
  await page.fill("#email", person.email);
  await page.fill("#password", person.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30000 });
  await settle(page);
}

const visibleTabs = (page) =>
  page.locator('nav[aria-label="Tabs"]:visible').getByRole("link").evaluateAll((links) => links.map((link) => link.textContent.trim()));

async function serverAnswers(origin) {
  try {
    return (await fetch(`${origin}/login`)).status === 200;
  } catch {
    return false;
  }
}

async function ownerFootprint(ownerId) {
  const [profile, leads, events, settings, quotes] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).single(),
    admin.from("leads").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("lead_events").select("id").eq("actor_id", ownerId).order("id"),
    admin.from("settings").select("*").eq("id", 1).single(),
    admin.from("quotes").select("id, updated_at").eq("created_by", ownerId).order("id"),
  ]);
  return JSON.stringify({ profile: profile.data, leads: leads.data, events: events.data, settings: settings.data, quotes: quotes.data });
}

async function accountEmails() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users ?? []).map((u) => u.email ?? "");
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
let ownerSession = null;
let offlineServer = null;
let page = null;

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
  const { data: colour } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order").limit(1).single();

  const addLead = async (lastName, number) => {
    const { data, error } = await admin
      .from("leads")
      .insert({ first_name: TEST_LEAD, last_name: lastName, address_line: `${number} ${street} Crescent SW`, created_by: setter.id })
      .select("id")
      .single();
    if (error) throw new Error(`lead: ${error.message}`);
    return data.id;
  };
  const tonightLead = await addLead("Tonight", 2);
  const laterLead = await addLead("Later", 4);
  await admin.from("leads").update({ track_colour_id: colour.id }).eq("id", tonightLead);
  const mockupPath = `${setter.id}/${crypto.randomUUID()}.jpg`;
  const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#1d3445" } }).jpeg().toBuffer();
  const uploaded = await admin.storage.from(BUCKET).upload(mockupPath, jpeg, { contentType: "image/jpeg" });
  if (uploaded.error) throw new Error(`mockup: ${uploaded.error.message}`);
  await admin.from("lead_photos").insert({ lead_id: tonightLead, storage_path: mockupPath, slot: "mockup" });

  const today = calgaryToday();
  const meeting = (leadId, day) => ({
    lead_id: leadId,
    host_id: setter.id,
    setter_id: setter.id,
    booked_by: setter.id,
    starts_at: at11pm(day),
    ends_at: new Date(Date.parse(at11pm(day)) + 45 * 60_000).toISOString(),
    everyone_deciding_present: true,
  });
  const staged = await admin.from("meetings").insert([meeting(tonightLead, today), meeting(laterLead, addDays(today, 1))]);
  if (staged.error) throw new Error(`meetings: ${staged.error.message}`);
  const before = await ownerFootprint(ownerId);

  // ---------------------------------------------------------------- navigation
  const ownerContext = await browser.newContext(ipad);
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  page = await ownerContext.newPage();
  await page.goto(`${base}/app/meetings`);
  await settle(page);
  const railTabs = await visibleTabs(page);
  check(
    "the owner's rail is Home, Schedule, Meetings, New lead and Leads, with Admin as a gear in the header",
    JSON.stringify(railTabs) === JSON.stringify(["Home", "Schedule", "Meetings", "New lead", "Leads"]) &&
      (await page.getByTestId("admin-gear").getAttribute("href")) === "/app/admin" &&
      (await page.getByTestId("admin-gear").innerText()).trim() === "Admin",
    railTabs.join(", "),
  );
  check("Meetings is the current tab", (await page.locator('nav[aria-label="Tabs"]:visible a[aria-current="page"]').innerText()).trim() === "Meetings");

  const phoneContext = await browser.newContext(phone);
  await phoneContext.addCookies((await ownerContext.cookies(base)).map(({ name, value }) => ({ name, value, url: base })));
  const phonePage = await phoneContext.newPage();
  await phonePage.goto(`${base}/app/meetings`);
  await settle(phonePage);
  const barTabs = await visibleTabs(phonePage);
  const columns = await phonePage.locator('nav[aria-label="Tabs"]:visible li').evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      const round = item.querySelector("span.rounded-full")?.getBoundingClientRect();
      return { width: box.width, roundWidth: round ? round.width : 0 };
    }),
  );
  check(
    "the phone's bar has the same five, each wide enough to tap, the gold button inside its own column",
    JSON.stringify(barTabs) === JSON.stringify(railTabs) && columns.every((c) => c.width >= 44) && columns.every((c) => c.roundWidth <= c.width),
    columns.map((c) => Math.round(c.width)).join(", "),
  );
  await phonePage.goto(`${base}/app/admin`);
  await settle(phonePage);
  check(
    "the gear opens Admin on the phone and is marked there",
    (await phonePage.getByTestId("admin-gear").getAttribute("aria-current")) === "page" && (await phonePage.locator('main a[href="/app/admin/people"]').count()) === 1,
  );
  await phonePage.goto(`${base}/app/meetings`);
  await settle(phonePage);
  await phonePage.screenshot({ path: `${out}/m5p-phone-meetings.png`, fullPage: true });
  await phoneContext.close();

  // ---------------------------------------------------------------- tonight and upcoming
  const tonightSection = page.getByTestId("meetings-tonight");
  const tonightItem = tonightSection.locator(`[data-testid="meeting-item"][data-lead="${tonightLead}"]`);
  const tonightText = (await tonightItem.innerText()).replace(/\s+/g, " ");
  check(
    "tonight's meeting shows its time, name and address, with nothing to fix",
    tonightText.includes("11:00 p.m.") && tonightText.includes(`${TEST_LEAD} Tonight`) && tonightText.includes(`2 ${street} Crescent SW`) && !tonightText.includes("No mockup") && !tonightText.includes("No track colour"),
    tonightText.slice(0, 160),
  );
  check(
    "its Start opens meeting mode fresh, with a full page load",
    (await tonightItem.getByRole("link", { name: `Start the meeting with ${TEST_LEAD} Tonight` }).getAttribute("href")) === `/meeting/${tonightLead}#start`,
  );
  const times = await tonightSection.locator('[data-testid="meeting-item"]').evaluateAll((items) =>
    items.map((item) => item.querySelector("p")?.textContent?.trim() ?? ""),
  );
  const minutes = times.map((label) => {
    const match = label.match(/^(\d{1,2}):(\d{2}) ([ap])\.m\.$/);
    if (!match) return NaN;
    return ((Number(match[1]) % 12) + (match[3] === "p" ? 12 : 0)) * 60 + Number(match[2]);
  });
  check("tonight is in time order", minutes.every((value, index) => index === 0 || value >= minutes[index - 1]), times.join(", "));
  const upcomingItem = page.getByTestId("meetings-upcoming").locator(`[data-testid="meeting-item"][data-lead="${laterLead}"]`);
  const upcomingText = (await upcomingItem.innerText()).replace(/\s+/g, " ");
  check(
    "an upcoming meeting with no mockup and no track colour is flagged, with the way to fix each",
    upcomingText.includes("No mockup yet.") &&
      upcomingText.includes("No track colour yet.") &&
      (await upcomingItem.locator(`a[href="/app/leads/${laterLead}#mockup"]`).count()) === 1 &&
      (await upcomingItem.locator(`a[href="/app/leads/${laterLead}#track-colour"]`).count()) === 1,
    upcomingText.slice(0, 200),
  );
  check("the host shows when it isn't the person looking", upcomingText.includes(`Host: ${setter.name}`));
  const upcomingDayHeadings = await page.getByTestId("meetings-upcoming").locator("h3").allInnerTexts();
  check("upcoming meetings sit under their evening", upcomingDayHeadings.length >= 1, upcomingDayHeadings.join(" | "));
  await page.screenshot({ path: `${out}/m5p-ipad-meetings.png`, fullPage: true });

  // A flag's link lands on the card that fixes it.
  await upcomingItem.getByRole("link", { name: "Set it on the lead page" }).click();
  await page.waitForURL(`**/app/leads/${laterLead}#track-colour`, { timeout: 30000 }).catch(() => {});
  await page.locator("#track-colour").waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const landing = await page.evaluate(() => {
    const card = document.getElementById("track-colour")?.getBoundingClientRect();
    return card ? { top: Math.round(card.top), height: window.innerHeight, scrolled: Math.round(window.scrollY) } : null;
  });
  check(
    "a flag's link opens the lead page at the card that fixes it",
    Boolean(landing && landing.top >= 0 && landing.top < landing.height && landing.scrolled > 0),
    JSON.stringify(landing),
  );
  await page.goto(`${base}/app/meetings`);
  await settle(page);

  // ---------------------------------------------------------------- start a meeting
  await page.getByRole("button", { name: "Start a meeting" }).click();
  const panel = page.getByTestId("start-a-meeting");
  await panel.waitFor({ timeout: 10000 });
  check(
    "Start a meeting puts the lists away while it is open, so no other customer is on screen",
    (await page.getByTestId("meetings-tonight").count()) === 0 && (await page.getByTestId("meeting-item").count()) === 0,
  );
  await panel.getByLabel("Find their lead").fill(street);
  await panel.getByRole("list", { name: "Matching leads" }).waitFor({ timeout: 20000 }).catch(() => {});
  const found = await panel.getByRole("list", { name: "Matching leads" }).getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  check(
    "searching finds their lead, and Start opens meeting mode for it",
    found.includes(`/meeting/${tonightLead}#start`) && found.includes(`/meeting/${laterLead}#start`),
    found.join(", "),
  );
  await panel.getByRole("button", { name: "Add them and start" }).click();
  await panel.locator("#start-first-name-error").waitFor({ timeout: 20000 }).catch(() => {});
  check("someone new needs a name and an address, and nothing is saved without them", (await panel.locator("#start-first-name-error").count()) === 1);
  await panel.locator("#start-first-name").fill(NEVER_SAVED);
  await panel.getByRole("button", { name: "Add them and start" }).click();
  await page.waitForTimeout(1500);
  const { count: neverSaved } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("first_name", NEVER_SAVED);
  check(
    "with no address it is refused, what was typed stays, and no lead is made",
    neverSaved === 0 && (await panel.locator("#start-first-name").inputValue()) === NEVER_SAVED && page.url().includes("/app/meetings"),
    `${neverSaved} saved`,
  );
  await page.screenshot({ path: `${out}/m5p-ipad-start-a-meeting.png`, fullPage: true });
  await page.getByRole("button", { name: "Close" }).click();
  check("Close brings the lists back", (await page.getByTestId("meetings-tonight").count()) === 1);

  // ---------------------------------------------------------------- get tonight ready, then no signal
  offlineServer = spawn("npx", ["next", "start", "--port", String(offlinePort)], { detached: true, stdio: "ignore", env: process.env });
  for (let i = 0; i < 60 && !(await serverAnswers(offlineBase)); i += 1) await sleep(1000);
  await ownerContext.addCookies((await ownerContext.cookies(base)).map(({ name, value }) => ({ name, value, url: offlineBase })));
  const ready = await ownerContext.newPage();
  await ready.goto(`${offlineBase}/app/meetings`);
  await settle(ready);
  const controlled = await ready
    .waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  const readyItem = ready.getByTestId("meetings-tonight").locator(`[data-testid="meeting-item"][data-lead="${tonightLead}"]`);
  const savedBefore = await readyItem.getByTestId("meeting-saved").innerText({ timeout: 10000 }).catch(() => "");
  await ready.getByRole("button", { name: "Get tonight ready" }).click();
  await ready
    .waitForFunction(
      (id) => document.querySelector(`[data-lead="${id}"] [data-testid="meeting-saved"]`)?.textContent?.startsWith("Saved on this device"),
      tonightLead,
      { timeout: 60000 },
    )
    .catch(() => {});
  // The summary waits for the Meetings page itself to be saved too.
  await ready
    .waitForFunction(() => /saved on this device/i.test(document.querySelector('[data-testid="tonight-saved-summary"]')?.textContent ?? ""), null, { timeout: 60000 })
    .catch(() => {});
  const savedAfter = (await readyItem.getByTestId("meeting-saved").innerText().catch(() => "")).trim();
  const summary = (await ready.getByTestId("tonight-saved-summary").innerText().catch(() => "")).trim();
  check(
    "Get tonight ready saves tonight on the device and says so on each meeting",
    controlled && savedBefore.includes("Not saved") && /^Saved on this device, \d{1,2}:\d{2} [ap]\.m\.$/.test(savedAfter) && /saved on this device/i.test(summary),
    `${savedBefore} / ${savedAfter} / ${summary}`,
  );
  await ready.screenshot({ path: `${out}/m5p-ipad-tonight-saved.png`, fullPage: true });

  // A change after the save (here, a note on the test lead) makes it out of date until saved again.
  await sleep(1500);
  await admin.from("leads").update({ notes: "Changed after Get tonight ready (automated)." }).eq("id", tonightLead);
  await ready.reload();
  await settle(ready);
  await ready
    .waitForFunction((id) => document.querySelector(`[data-lead="${id}"] [data-testid="meeting-saved"]`)?.textContent?.startsWith("Changed since"), tonightLead, { timeout: 20000 })
    .catch(() => {});
  const staleLine = (await readyItem.getByTestId("meeting-saved").innerText().catch(() => "")).trim();
  await ready.getByRole("button", { name: "Get tonight ready" }).click();
  await ready
    .waitForFunction((id) => document.querySelector(`[data-lead="${id}"] [data-testid="meeting-saved"]`)?.textContent?.startsWith("Saved on this device"), tonightLead, { timeout: 60000 })
    .catch(() => {});
  await ready
    .waitForFunction(() => /saved on this device/i.test(document.querySelector('[data-testid="tonight-saved-summary"]')?.textContent ?? ""), null, { timeout: 60000 })
    .catch(() => {});
  const resavedLine = (await readyItem.getByTestId("meeting-saved").innerText().catch(() => "")).trim();
  check(
    "a change to the lead after saving shows the save is out of date, and saving again fixes it",
    staleLine === "Changed since it was saved. Tap Get tonight ready again." && resavedLine.startsWith("Saved on this device"),
    `${staleLine} / ${resavedLine}`,
  );
  try {
    process.kill(-offlineServer.pid, "SIGTERM");
  } catch {}
  for (let i = 0; i < 30 && (await serverAnswers(offlineBase)); i += 1) await sleep(500);
  const gone = !(await serverAnswers(offlineBase));
  // And the browser itself without a network, as in a dead spot.
  await ownerContext.setOffline(true);
  await ready.goto(`${offlineBase}/app`).catch(() => {});
  await ready.getByTestId("meetings-tonight").waitFor({ timeout: 30000 }).catch(() => {});
  const landedOnMeetings = new URL(ready.url()).pathname === "/app/meetings";
  check(
    "without signal, opening the app's start page lands on the saved Meetings page",
    gone && landedOnMeetings && (await ready.locator(`[data-testid="meeting-item"][data-lead="${tonightLead}"]`).count()) === 1,
    ready.url(),
  );
  const notice = (await ready.getByTestId("no-signal").innerText().catch(() => "")).trim();
  check(
    "it says there is no signal and when tonight was saved",
    /^No signal\. This is tonight as saved at \d{1,2}:\d{2} [ap]\.m\. Other pages need signal\.$/.test(notice),
    notice,
  );
  await ready.getByRole("link", { name: `Start the meeting with ${TEST_LEAD} Tonight` }).click().catch(() => {});
  await ready.locator('ol[aria-label="Where you are"]').waitFor({ timeout: 30000 }).catch(() => {});
  const opened = await ready
    .waitForFunction(() => {
      const img = document.querySelector('section[aria-label="This house"] img');
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }, null, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(
    "and its Start opens a meeting never opened on this device, from what Get tonight ready saved, mockup and all",
    gone && opened,
    gone ? "" : "the second server did not stop",
  );
  await ready.screenshot({ path: `${out}/m5p-offline-meeting.png` });
  await ownerContext.setOffline(false);
  await ready.close();
  offlineServer = null;

  // ---------------------------------------------------------------- setters never see it
  const setterContext = await browser.newContext(phone);
  const setterPage = await setterContext.newPage();
  await signIn(setterPage, setter);
  check("a setter's tabs have no Meetings", !(await visibleTabs(setterPage)).includes("Meetings") && (await setterPage.getByTestId("admin-gear").count()) === 0);
  await setterPage.goto(`${base}/app/meetings`);
  await settle(setterPage);
  check(
    "a setter who opens Meetings gets Not for your role, and none of the meetings",
    (await setterPage.getByRole("heading", { name: "Not for your role" }).count()) === 1 && (await setterPage.getByTestId("meeting-item").count()) === 0,
  );
  const setterSource = await setterPage.content();
  check(
    "and its page source carries none of them: no names, no addresses",
    !setterSource.includes(street) && !setterSource.includes(`${TEST_LEAD} Tonight`) && !setterSource.includes(`${TEST_LEAD} Later`),
  );
  await setterContext.close();

  // ---------------------------------------------------------------- nothing written as Keenan
  await ownerSession.close();
  ownerSession = null;
  check("nothing of the owner's changed: profile, settings, leads, timeline and quotes", before === (await ownerFootprint(ownerId)));
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)}${page ? ` at ${page.url()}` : ""}`);
  if (page) await page.screenshot({ path: `${out}/m5p-failure.png`, fullPage: true }).catch(() => {});
} finally {
  if (offlineServer) {
    try {
      process.kill(-offlineServer.pid, "SIGTERM");
    } catch {}
  }
  if (ownerSession) await ownerSession.close().catch(() => {});
  if (setter.id) {
    const { data: owned } = await admin.from("leads").select("id").eq("created_by", setter.id);
    const leadIds = (owned ?? []).map((row) => row.id);
    if (leadIds.length > 0) {
      await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
      await admin.from("meetings").delete().in("lead_id", leadIds);
      await admin.from("quotes").delete().in("lead_id", leadIds);
    }
    await admin.from("leads").delete().eq("created_by", setter.id);
    const { data: files } = await admin.storage.from(BUCKET).list(setter.id, { limit: 1000 });
    if (files && files.length > 0) await admin.storage.from(BUCKET).remove(files.map((file) => `${setter.id}/${file.name}`));
    await admin.auth.admin.deleteUser(setter.id);
  }
  const emails = await accountEmails();
  const leftoverUsers = emails.filter((email) => email.startsWith("m5p-live-"));
  const { count: leftoverLeads } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("first_name", TEST_LEAD);
  const { count: strays } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("first_name", NEVER_SAVED);
  check(
    "the throwaway setter, the test leads, their meetings and the mockup are gone",
    leftoverUsers.length === 0 && leftoverLeads === 0 && strays === 0,
    `${leftoverUsers.length} accounts, ${leftoverLeads} test leads, ${strays} strays left`,
  );
  results.push(`accounts remaining: ${JSON.stringify(emails)}`);
  await browser.close();
}

console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
