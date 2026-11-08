// Live walk-through of M3, M3.5 and the setter side's round 2 on phone-sized
// screens against a running build. No double booking is a hard rule (Keenan,
// 2026-11-01), and the booking sheet is the only way to book (Keenan,
// 2026-11-02; round 2, 2026-11-03). Setter A uses Keenan's phone size, 430 x
// 932, and setter B 390 x 844, both as the installed app with the iPhone's
// safe areas. It starts with the two in two browsers: the second sees the
// first one's hold appear, cannot pick that time, and sees it open again when
// the first lets go. Then the two race for the same time through the booking
// sheet, several rounds, and exactly one gets it each time. Then the sheet
// end to end with a new person: the header's countdown and its menu, the six
// steps with their counter, swiping, Not collected, a reload in the middle,
// under a minute and Add 5 minutes, a hold that runs out and is held again,
// photos taken and uploaded, Book, the done screen. Then a run-out hold that
// someone else takes, an existing lead that skips what it has, every step at
// 390 wide with a draft left and picked up from Home, a lead that isn't
// ready, the distance warning, Move and Cancel, Save and book from New lead
// with the phone's GPS, My pay, and Keenan's screens through the view-only
// owner session. Last, Book's answer lost to the signal (2026-11-03): the
// sheet asks whether the lead booked before it says anything, in four
// cases; and a new person's first save whose answer is lost (2026-11-04):
// Next again gets back the same lead through its save key, never a copy.
// The phone's requests and answers are dropped as a lost signal would, in
// the browser's own network (tests/live/drop.mjs).
//
// The holds and bookings land on Keenan's real board, so the run uses only
// the last evening of the booking window, under test names, and removes
// everything at the end. My pay's qualified booking sits on a throwaway test
// host of its own, so nothing lands on Keenan's Tonight.
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import sharp from "sharp";
import { interceptFetches } from "./drop.mjs";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The M3 walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const TEST_PLACE = "TEST (automated)";
const SOFFIT_NOTE = "TEST (automated) white at the front, cream at the back";
const BUCKET = "lead-photos";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const people = {
  a: { email: `m3-live-a-${stamp}@example.com`, password: `amber-falcon-river-${digits}`, name: "TEST Setter A", id: null, client: null },
  b: { email: `m3-live-b-${stamp}@example.com`, password: `cobalt-heron-ridge-${digits}`, name: "TEST Setter B", id: null, client: null },
  host: { email: `m3-live-host-${stamp}@example.com`, password: `silver-maple-stone-${digits}`, name: "TEST Host", id: null, client: null },
};
const EVANSTON = { lat: 51.1743, lng: -114.1044 };
const MAHOGANY = { lat: 50.896, lng: -113.933 };

// Calgary's date the way the app works it out: UTC-6 for good since Alberta
// stopped changing clocks on 2026-11-01 (lib/time.ts).
const calgaryZone = (moment) => (moment.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton");
const calgaryToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(new Date()), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const timeLabel = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(new Date(iso)), hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dayChip = (day) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function tapTargetsTooSmall(page) {
  return page.evaluate(() => {
    const offenders = [];
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="option"], label:has(input[type="radio"])';
    for (const element of document.querySelectorAll(selector)) {
      if (element.matches('input[type="radio"]') || element.matches('input[type="checkbox"]')) continue;
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

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}

const slotButton = (page, iso) => page.locator(`main [data-testid="time-picker"] [data-time="${iso}"]`).first();

// ------------------------------------------------------------ the booking sheet
const sheet = (page) => page.getByTestId("booking-sheet");
const sheetSlot = (page, iso) => page.locator(`[data-testid="booking-sheet"] [data-testid="time-picker"] [data-time="${iso}"]`).first();
const viewOf = (page) => sheet(page).getAttribute("data-view", { timeout: 2000 }).catch(() => null);
async function waitView(page, view, timeout = 20000) {
  await page.locator(`[data-testid="booking-sheet"][data-view="${view}"]`).waitFor({ timeout });
}
const next = (page) => page.getByTestId("sheet-next").click();
const answer = (page, legend, choice) =>
  page
    .locator('[data-testid="booking-sheet"] fieldset')
    .filter({ has: page.locator("legend", { hasText: new RegExp(`^${escape(legend)}$`) }) })
    .getByText(choice, { exact: true })
    .click();
const heldState = (page) => page.getByTestId("sheet-held").getAttribute("data-held", { timeout: 5000 }).catch(() => null);
// Whether the open screen scrolls inside the sheet: content taller than its box.
const sheetScrolls = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('[data-testid="sheet-body"]');
    return box ? box.scrollHeight > box.clientHeight + 1 : null;
  });
let holdMinutes = 5;
// The held time in the header opens the hold menu; Let go asks first.
async function openHoldMenu(page) {
  await sheet(page).getByTestId("sheet-held").click();
  await page.getByTestId("hold-menu").waitFor({ timeout: 5000 });
}
async function letGo(page) {
  await openHoldMenu(page);
  await page.getByTestId("hold-menu").getByRole("menuitem", { name: "Let go" }).click();
  await page.getByTestId("sheet-let-go").getByRole("button", { name: "Let go", exact: true }).click();
  await sheet(page).waitFor({ state: "detached", timeout: 20000 });
}
// Takes the three guided photos on the house screen and waits for the
// uploads: two with the camera, one uploaded from the phone.
async function takePhotos(page) {
  await page.setInputFiles('[data-testid="booking-sheet"] [data-testid="slot-input-front"]', fixture);
  await page.waitForTimeout(300);
  await page.setInputFiles('[data-testid="booking-sheet"] [data-testid="slot-input-left_corner"]', fixture);
  await page.waitForTimeout(300);
  await page.setInputFiles('[data-testid="booking-sheet"] [data-testid="slot-upload-right_corner"]', fixture);
  await page.waitForFunction(() => !document.querySelector('[data-testid="booking-sheet"]')?.textContent?.includes("Uploading"), null, { timeout: 30000 });
}
async function skipPhotos(page) {
  await sheet(page).getByRole("button", { name: "Can't get the photos?" }).click();
  await answer(page, "Why can't you get them?", "Homeowner said no");
}
const stepCounter = (page) => sheet(page).getByTestId("sheet-step-count").innerText().then((text) => text.replace(/\s+/g, " ").trim()).catch(() => "");
const nextLabel = (page) => page.getByTestId("sheet-next").innerText().then((text) => text.trim()).catch(() => "");
// Seconds left on the header's countdown, as the screen shows it.
// Drops setter A's requests as a lost signal would (2026-11-03). drop.book:
// "before" stops Book on the phone, so nothing books; "after" lets it reach
// the server, which books, and drops only the answer. drop.check drops the
// sheet's question of whether the lead booked; drop.sync drops the hold's
// own checks, so only a tap can find the booking. Server actions are POSTs
// whose body is their arguments, which is how each one is told apart.
// Drops the sheet's Book, its check and the hold's sync for one lead, in the
// browser's own network (tests/live/drop.mjs). Book can drop "before" it
// reaches the server or "after" the server booked.
function dropping(page, leadId) {
  const drop = { book: null, check: false, sync: false };
  const seen = { book: 0, check: 0 };
  let stop = async () => {};
  const decide = (request, stage) => {
    if (request.method !== "POST") return null;
    const body = request.body;
    if (body.includes(`"leadId":"${leadId}"`) && body.includes('"everyone":')) {
      if (stage === "request") seen.book += 1;
      return drop.book && (drop.book === "before") === (stage === "request") ? "drop" : null;
    }
    if (body.startsWith(`[{"leadId":"${leadId}","startsAt":`) && !body.includes('"everyone":')) {
      if (stage === "request") seen.check += 1;
      return drop.check && stage === "request" ? "drop" : null;
    }
    if (drop.sync && body === "[]" && stage === "request") return "drop";
    return null;
  };
  return {
    drop,
    seen,
    start: async () => {
      stop = await interceptFetches(page, decide);
    },
    stop: () => stop(),
  };
}

async function secondsLeft(page) {
  const text = (await sheet(page).getByTestId("sheet-countdown").innerText().catch(() => "")).trim();
  const match = /^(\d+):(\d{2}) left$/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
// A swipe across the sheet, as a thumb does it: real touch events.
async function swipe(page, direction) {
  const box = await page.getByTestId("sheet-body").boundingBox();
  const y = box.y + 24;
  const from = direction === "left" ? box.x + box.width * 0.85 : box.x + box.width * 0.15;
  const to = direction === "left" ? box.x + box.width * 0.15 : box.x + box.width * 0.85;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y }] });
  for (let i = 1; i <= 6; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from + ((to - from) * i) / 6, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(400);
}
// Moves a person's hold so its timer shows this many seconds left (or, below
// zero, ran out that long ago), then wakes their screen so it checks.
async function setSecondsLeft(page, person, seconds) {
  const renewed = new Date(Date.now() - (holdMinutes * 60 - seconds) * 1000).toISOString();
  await admin.from("slot_holds").update({ renewed_at: renewed }).eq("holder_id", person.id).is("released_at", null);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}
async function renewedAt(person) {
  const { data } = await admin.from("slot_holds").select("renewed_at").eq("holder_id", person.id).is("released_at", null).maybeSingle();
  return data ? Date.parse(data.renewed_at) : null;
}

// Waits until another phone's screen shows a time in a state, and says how long it took.
async function waitForState(page, iso, state, timeout = 12000) {
  const started = Date.now();
  try {
    await page.waitForFunction(
      ([selector, wanted]) => document.querySelector(selector)?.getAttribute("data-state") === wanted,
      [`[data-testid="time-picker"] [data-time="${iso}"]`, state],
      { timeout },
    );
    return Date.now() - started;
  } catch {
    return null;
  }
}

// Picks an evening on a picker: the page's own (root is the page's main) or
// the sheet's.
async function chooseEvening(root, day) {
  const chip = root.getByRole("group", { name: "Evenings" }).getByRole("button", { name: new RegExp(`^${escape(dayChip(day))}`) });
  await chip.click();
  await root.getByTestId("picker-day").filter({ hasText: new RegExp(escape(dayChip(day).split(", ")[1])) }).waitFor({ timeout: 10000 }).catch(() => {});
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

async function readyLead(person, address, extra = {}) {
  const { data, error } = await person.client
    .from("leads")
    .insert({
      first_name: TEST_LEAD,
      address_line: address,
      neighbourhood: TEST_PLACE,
      created_by: person.id,
      phone: "+14035550177",
      owns_home: true,
      wants_price: true,
      soffit_colour: "white",
      ...EVANSTON,
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(`lead ${address}: ${error.message}`);
  return data.id;
}

async function removeEverything() {
  const ids = Object.values(people).map((person) => person.id).filter(Boolean);
  if (ids.length === 0) return;
  const { data: leads } = await admin.from("leads").select("id").in("created_by", ids);
  const leadIds = (leads ?? []).map((lead) => lead.id);
  if (leadIds.length > 0) await admin.from("earnings").delete().in("lead_id", leadIds);
  await admin.from("earnings").delete().in("profile_id", ids);
  await admin.from("slot_holds").delete().in("holder_id", ids);
  if (people.host.id) {
    await admin.from("slot_holds").delete().eq("host_id", people.host.id);
    await admin.from("time_blocks").delete().eq("host_id", people.host.id);
  }
  if (leadIds.length > 0) {
    await admin.from("slot_holds").delete().in("lead_id", leadIds);
    await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
    await admin.from("meetings").delete().in("lead_id", leadIds);
  }
  for (const id of ids) {
    await admin.from("leads").delete().eq("created_by", id);
    await admin.from("knock_sessions").delete().eq("user_id", id);
    const { data: files } = await admin.storage.from(BUCKET).list(id, { limit: 1000 });
    if (files && files.length > 0) await admin.storage.from(BUCKET).remove(files.map((file) => `${id}/${file.name}`));
    await admin.auth.admin.deleteUser(id);
  }
}

await mkdir(out, { recursive: true });
const fixture = `${out}/m3-fixture.jpg`;
await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#5b7083" } }).jpeg({ quality: 85 }).toFile(fixture);
const browser = await chromium.launch();
const { defaultBrowserType, ...iphone } = devices["iPhone 14"];
void defaultBrowserType;
// The installed app fills the screen; the iPhone keeps its safe areas at the
// top and bottom, which a test browser leaves out, so they're added to the
// sheet here: 59 and 34 px on Keenan's 15 Pro Max, 47 and 34 on a 390 wide one.
async function installedPhone(width, height, top) {
  const context = await browser.newContext({
    ...iphone,
    viewport: { width, height },
    screen: { width, height },
    geolocation: { latitude: 51.0447, longitude: -114.0719, accuracy: 10 },
    permissions: ["geolocation"],
  });
  await context.addInitScript((insets) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = `[data-testid="booking-sheet"] header { padding-top: ${insets.top}px !important } [data-testid="booking-sheet"] footer { padding-bottom: 34px !important }`;
      document.head.appendChild(style);
    });
  }, { top });
  return context;
}
const contextA = await installedPhone(430, 932, 59);
const contextB = await installedPhone(390, 844, 47);
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
let ownerSession = null;
let ownerPage = null;

try {
  // ---------------------------------------------------------------- setup
  for (const key of ["a", "b", "host"]) {
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
  await admin.from("profiles").update({ hosts_meetings: true }).eq("id", people.host.id);
  const { data: settings } = await admin
    .from("settings")
    .select("booking_pay, distance_warning_km, booking_window_days, meeting_slot_minutes, hold_minutes")
    .eq("id", 1)
    .single();
  holdMinutes = settings.hold_minutes;
  const lead1 = await readyLead(people.a, "301 Hold Test Way NW (TEST)");
  const lead2 = await readyLead(people.a, "302 Hold Test Way NW (TEST)", { phone: null, owns_home: null, wants_price: null, soffit_colour: null, lat: null, lng: null });
  const lead3 = await readyLead(people.b, "9 Far Test Way SE (TEST)", MAHOGANY);
  const lead4 = await readyLead(people.a, "304 Pay Test Way NW (TEST)");

  const today = calgaryToday();
  const { data: boardRows, error: boardError } = await people.a.client.rpc("schedule_board");
  if (boardError) throw new Error(`board: ${boardError.message}`);
  const board = boardRows.map((row) => ({ ...row, iso: new Date(row.starts_at).toISOString() }));
  const byDay = new Map();
  for (const row of board) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
  const testDay = [...byDay.keys()].sort().reverse().find((day) => (byDay.get(day) ?? []).filter((row) => row.state === "open").length >= 5);
  if (!testDay) throw new Error("no evening in the booking window has five open times");
  const open = byDay.get(testDay).filter((row) => row.state === "open").map((row) => row.iso);
  const [X, Z, W, V, Y] = open;
  note(`Test evening: ${testDay} (${dayChip(testDay)}), the last in the window with open times; times ${[X, Z, W, V, Y].map(timeLabel).join(", ")}.`);

  // ---------------------------------------------------------------- Home and the time picker's opening evening
  await signIn(pageA, people.a);
  await signIn(pageB, people.b);
  check("a setter's Home has no role line under the greeting", (await pageA.getByText("Signed in as").count()) === 0 && (await pageA.getByRole("heading", { name: /^Hello, TEST$/ }).count()) === 1);
  // Home (Keenan, 2026-11-05): Start knocking or the live session, the
  // team's schedule with Today and Tomorrow, How mine went, follow-ups due.
  const homeOrder = await pageA.evaluate(() =>
    [...document.querySelectorAll("main [data-testid]")]
      .map((el) => el.getAttribute("data-testid"))
      .filter((id) => ["home-start-knocking", "home-session-bar", "team-schedule", "how-mine-went"].includes(id)),
  );
  const mineY = await pageA.getByTestId("how-mine-went").boundingBox();
  const dueY = await pageA.getByRole("heading", { name: "Follow-ups due" }).boundingBox().catch(() => null);
  check(
    "Home runs top to bottom: Start knocking, the team's schedule, How mine went, follow-ups due",
    JSON.stringify(homeOrder) === JSON.stringify(["home-start-knocking", "team-schedule", "how-mine-went"]) && mineY && dueY && mineY.y < dueY.y,
    homeOrder.join(", "),
  );
  check("Start knocking on Home opens Session", (await pageA.getByTestId("home-start-knocking").getAttribute("href")) === "/app/session");
  check("Home has no open-times grid any more: times are on Session and Schedule", (await pageA.locator("main [data-time]").count()) === 0);
  const team = pageA.getByTestId("team-schedule");
  await team.getByRole("button", { name: /^Tomorrow/ }).click();
  check(
    "the team's schedule switches to tomorrow in place",
    (await team.getByRole("button", { name: /^Tomorrow/ }).getAttribute("aria-pressed")) === "true" &&
      (await team.locator('[data-day-list="Tomorrow"]').isVisible()) &&
      !(await team.locator('[data-day-list="Today"]').isVisible()) &&
      (await team.getByRole("heading", { name: "Team schedule tomorrow", exact: true }).count()) === 1,
  );
  await team.getByRole("button", { name: /^Today/ }).click();
  const teamHtml = await team.innerHTML();
  check("the team's schedule carries no phone number, email or call link", !/tel:|mailto:|@[a-z0-9-]+\./i.test(teamHtml) && !/\(\d{3}\) \d{3}-\d{4}/.test(teamHtml));
  const tonight = (byDay.get(today) ?? []).filter((row) => row.state === "open");
  await checkTapTargets(pageA, "the setter's Home");
  await pageA.screenshot({ path: `${out}/m3-setter-home.png`, fullPage: true });

  await pageA.getByRole("navigation", { name: "Tabs" }).filter({ visible: true }).getByRole("link", { name: "Schedule", exact: true }).click();
  await pageA.waitForURL("**/app/schedule", { timeout: 20000 });
  await settle(pageA);
  const scheduleDay = (await pageA.getByTestId("picker-day").innerText()).trim();
  if (tonight.length > 0) {
    check("Schedule opens on tonight when tonight has open times", scheduleDay === "Tonight", scheduleDay);
  } else {
    check("with nothing open tonight, Schedule opens on another evening", scheduleDay !== "Tonight", scheduleDay);
  }
  const chips = await pageA.getByRole("group", { name: "Evenings" }).getByRole("button").count();
  check(`every evening in the ${settings.booking_window_days}-day window is one tap away`, chips === settings.booking_window_days + 1, `${chips} evenings`);
  await pageB.goto(`${base}/app/schedule`);
  await settle(pageB);
  await chooseEvening(pageA.locator("main"), testDay);
  await chooseEvening(pageB.locator("main"), testDay);
  check("both setters see the test time open", (await slotButton(pageA, X).getAttribute("data-state")) === "open" && (await slotButton(pageB, X).getAttribute("data-state")) === "open");
  await checkTapTargets(pageB, "Schedule");
  await pageB.screenshot({ path: `${out}/m3-schedule.png`, fullPage: true });

  // ---------------------------------------------------------------- two browsers: a hold shows on the other phone
  check("setters don't get Keenan's Block time and pencil", (await pageA.getByTestId("owner-schedule-tools").count()) === 0);
  await slotButton(pageA, X).click();
  await waitView(pageA, "who");
  check("tapping an open time holds it and opens the booking sheet over the schedule", (await heldState(pageA)) === "yes" && pageA.url().endsWith("/app/schedule"), pageA.url());
  const headerText = (await sheet(pageA).locator("header").innerText()).replace(/\s+/g, " ").trim();
  const leftAtStart = await secondsLeft(pageA);
  check(
    "the header has the Vesper wordmark on the left and the held time on the right, counting down from the hold length",
    /^VESPER/.test(headerText) && headerText.includes(timeLabel(X)) && leftAtStart !== null && leftAtStart <= holdMinutes * 60 && leftAtStart > holdMinutes * 60 - 30,
    `${headerText} (${leftAtStart} s)`,
  );
  const wordmarkBox = await sheet(pageA).locator("header").getByText("Vesper", { exact: true }).boundingBox();
  const timeBox = await sheet(pageA).getByTestId("sheet-held").boundingBox();
  check("the wordmark sits left and the time right", wordmarkBox && timeBox && wordmarkBox.x < 60 && timeBox.x + timeBox.width > pageA.viewportSize().width - 40);
  await pageA.waitForTimeout(2100);
  const leftLater = await secondsLeft(pageA);
  check("the countdown ticks down on its own", leftLater !== null && leftAtStart !== null && leftLater < leftAtStart, `${leftAtStart} then ${leftLater}`);
  check(
    "the sheet starts At the door, with a clear counter: Step 1 of 6, 10 to answer",
    (await sheet(pageA).getByTestId("sheet-part").innerText()).startsWith("At the door") && (await stepCounter(pageA)) === "Step 1 of 6, 10 to answer",
    await stepCounter(pageA),
  );
  const tapped = Date.now();
  await openHoldMenu(pageA);
  const menuMs = Date.now() - tapped;
  const menuItems = (await pageA.getByTestId("hold-menu").getByRole("menuitem").allInnerTexts()).map((item) => item.trim());
  check(
    "tapping the time opens its menu at once: Add 5 minutes, Change time, Let go",
    JSON.stringify(menuItems) === JSON.stringify([`Add ${holdMinutes} minutes`, "Change time", "Let go"]) && menuMs < 1500,
    `${menuItems.join(", ")} in ${menuMs} ms`,
  );
  await pageA.screenshot({ path: `${out}/r2-hold-menu-430.png` });
  await pageA.keyboard.press("Escape");
  check("Escape closes the menu and keeps the sheet and the hold", (await pageA.getByTestId("hold-menu").count()) === 0 && (await heldState(pageA)) === "yes");
  const seenHeld = await waitForState(pageB, X, "held");
  check("the other setter sees the hold appear without refreshing, within a few seconds", seenHeld !== null && seenHeld <= 8000, seenHeld === null ? "never" : `${(seenHeld / 1000).toFixed(1)} s`);
  const initialsShown = (await slotButton(pageB, X).locator('[data-testid="holder-initials"]').innerText().catch(() => "")).trim();
  check("the held time shows the holder's initials", initialsShown === "TA", initialsShown);
  await slotButton(pageB, X).click();
  const heldMessage = (await pageB.getByTestId("picker-message").innerText().catch(() => "")).trim();
  check("tapping a held time says who is booking it, and opens nothing", heldMessage === "TEST Setter A is booking this time." && (await sheet(pageB).count()) === 0, heldMessage);
  const { data: bTried } = await admin.from("slot_holds").select("id").eq("holder_id", people.b.id);
  check("no hold was made for the second setter", (bTried ?? []).length === 0);
  await pageB.screenshot({ path: `${out}/m3-held-by-other.png`, fullPage: false });
  await letGo(pageA);
  check("Let go from the time's menu asks first, then closes the sheet and returns to the schedule", pageA.url().endsWith("/app/schedule") && (await sheet(pageA).count()) === 0);
  const seenOpen = await waitForState(pageB, X, "open");
  check("when the first setter lets go, the time opens again on the other phone", seenOpen !== null && seenOpen <= 8000, seenOpen === null ? "never" : `${(seenOpen / 1000).toFixed(1)} s`);

  // ---------------------------------------------------------------- two setters race for the same time through the sheet
  const ROUNDS = 3;
  for (let round = 1; round <= ROUNDS; round += 1) {
    const ready = await Promise.all([waitForState(pageA, X, "open"), waitForState(pageB, X, "open")]);
    if (ready.includes(null)) throw new Error(`race ${round}: the time did not open again on both phones`);
    await Promise.all([slotButton(pageA, X).click(), slotButton(pageB, X).click()]);
    const winner = await Promise.race([
      sheet(pageA).waitFor({ timeout: 20000 }).then(() => "a"),
      sheet(pageB).waitFor({ timeout: 20000 }).then(() => "b"),
    ]).catch(() => null);
    await pageA.waitForTimeout(2000);
    const sheets = (await sheet(pageA).count()) + (await sheet(pageB).count());
    const { data: holds } = await admin.from("slot_holds").select("holder_id").eq("starts_at", X).is("released_at", null);
    const loser = winner === "a" ? pageB : pageA;
    const loserMessage = (await loser.locator("main").getByTestId("picker-message").innerText().catch(() => "")).trim();
    const winnerName = winner === "a" ? "TEST Setter A" : "TEST Setter B";
    check(
      `race ${round} of ${ROUNDS}: both setters tap the same time at once, and exactly one gets the hold and the sheet`,
      winner !== null && sheets === 1 && (holds ?? []).length === 1 && holds[0].holder_id === people[winner].id,
      `winner ${winner}; ${sheets} sheets; ${(holds ?? []).length} holds`,
    );
    check(`race ${round} of ${ROUNDS}: the other setter is told who is booking it`, loserMessage === `${winnerName} is booking this time.`, loserMessage);
    if (winner) await letGo(winner === "a" ? pageA : pageB);
  }

  // ---------------------------------------------------------------- the sheet end to end, with a new person, at 430 x 932
  // Round 3 (Keenan, 2026-11-05): answers come out of order at the door, so
  // nothing stops a setter moving on; a step left with something missing is
  // marked on the progress bar, and Book lists it, each with a tap to its
  // step. The phone is asked last, on Book. This run does it the way a door
  // goes: a question skipped, the soffit left for later, the photos before
  // the person is saved, then Book's list, and the number typed last.
  await waitForState(pageA, X, "open");
  await slotButton(pageA, X).click();
  await waitView(pageA, "who");
  const scrolls = {};
  scrolls.who = await sheetScrolls(pageA);
  await checkTapTargets(pageA, "the sheet's first screen at 430 wide");
  const bar = await sheet(pageA).getByTestId("sheet-next").boundingBox();
  const viewport = pageA.viewportSize();
  check("Next is at the bottom right, in thumb reach", bar !== null && bar.x + bar.width / 2 > viewport.width / 2 && bar.y > viewport.height * 0.8, bar ? `${Math.round(bar.x)},${Math.round(bar.y)}` : "none");
  check(
    "the first step asks only the name, and its counter says how many answers are still to come",
    (await sheet(pageA).getByTestId("sheet-body").locator("#sheet-phone").count()) === 0 && (await nextLabel(pageA)) === "Next" && (await stepCounter(pageA)) === "Step 1 of 6, 10 to answer",
    `${await nextLabel(pageA)}; ${await stepCounter(pageA)}`,
  );
  // Round 5 (Keenan, 2026-11-06): the phone is a slim one-line field at the
  // bottom of every step, right above Back and Next, opening the number pad.
  const footPhone = await sheet(pageA).getByTestId("sheet-phone-block").boundingBox();
  const footNext = await sheet(pageA).getByTestId("sheet-next").boundingBox();
  check(
    "the phone is a slim line at the bottom of the first step, right above Back and Next, and opens the number pad",
    footPhone !== null && footNext !== null && footPhone.height <= 52 && footPhone.y + footPhone.height <= footNext.y && footNext.y - (footPhone.y + footPhone.height) <= 24 &&
      (await pageA.locator("#sheet-phone").getAttribute("inputmode")) === "tel" && (await pageA.locator("#sheet-phone").getAttribute("type")) === "tel",
    footPhone ? `${Math.round(footPhone.height)} px tall, ${Math.round(footNext.y - footPhone.y - footPhone.height)} px above Next` : "missing",
  );
  await sheet(pageA).getByRole("button", { name: /^What to talk about/ }).click();
  // The "?" is there from the first moment; the note fills in once it arrives.
  await pageA
    .waitForFunction(() => {
      const panel = document.querySelector('[data-testid="sheet-note"]');
      return Boolean(panel && panel.textContent && !panel.textContent.includes("One moment."));
    }, null, { timeout: 15000 })
    .catch(() => {});
  const noteText = (await pageA.getByTestId("sheet-note").innerText().catch(() => "")).trim();
  check("the ? beside the title shows what to talk about at the door, from Keenan's step note", /What to talk about: At the door/.test(noteText) && noteText.length > 60, noteText.replace(/\s+/g, " ").slice(0, 80));
  await pageA.getByTestId("sheet-note").getByRole("button", { name: "Close", exact: true }).click();
  await pageA.fill("#sheet-first-name", TEST_LEAD);
  await pageA.fill("#sheet-last-name", "Sheet");
  await pageA.waitForTimeout(300);
  await pageA.reload();
  await settle(pageA);
  await waitView(pageA, "who").catch(() => {});
  check(
    "after a reload, the sheet comes back with the same time still held and what was typed",
    (await viewOf(pageA)) === "who" && (await pageA.inputValue("#sheet-first-name").catch(() => "")) === TEST_LEAD && (await heldState(pageA)) === "yes",
  );
  await next(pageA);
  await waitView(pageA, "door");
  check("step 2 is At the door's three questions to book", (await stepCounter(pageA)).startsWith("Step 2 of 6") && (await sheet(pageA).getByTestId("sheet-heading").innerText()) === "Three questions to book", await stepCounter(pageA));
  const doorLegends = await sheet(pageA).locator("fieldset legend").allTextContents();
  check(
    "At the door asks only what booking needs face to face: owns the home, wants a price, everyone who decides",
    JSON.stringify(doorLegends.map((text) => text.trim())) === JSON.stringify(["Owns the home", "Wants a price", "Everyone who decides will be there"]),
    doorLegends.join(", "),
  );
  check("each question there offers Not collected", (await sheet(pageA).locator('fieldset input[value="not_collected"]').count()) === 3);
  scrolls.door = await sheetScrolls(pageA);
  // Out of order, as at a real door: Wants a price is left for later.
  await answer(pageA, "Everyone who decides will be there", "Yes");
  await answer(pageA, "Owns the home", "Yes");
  check("with a question still open, Next still says Next: nothing blocks", (await nextLabel(pageA)) === "Next" && (await pageA.getByTestId("sheet-next").getAttribute("data-ready")) === "yes");
  await checkTapTargets(pageA, "At the door's questions");
  // Round 4 (Keenan, 2026-11-05): each step on the progress bar jumps
  // straight to it, so Book is one tap from the door. A step jumped over
  // isn't marked; Book lists what's missing.
  const bookStep = await sheet(pageA).getByTestId("sheet-step-book").boundingBox();
  const stepBoxes = await sheet(pageA).locator('[data-testid="sheet-progress"] button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect()).map((box) => [Math.round(box.width), Math.round(box.height)]));
  check(
    "each step on the progress bar is a thumb-sized button, 44 px tall and wider than that",
    stepBoxes.length === 6 && stepBoxes.every(([width, height]) => width >= 44 && height >= 44) && bookStep !== null,
    JSON.stringify(stepBoxes),
  );
  await sheet(pageA).getByTestId("sheet-step-book").click();
  await waitView(pageA, "book");
  const jumpedMarks = await sheet(pageA).locator('[data-testid="sheet-progress"] [data-missing="yes"]').evaluateAll((items) => items.map((item) => item.getAttribute("data-step")));
  check(
    "from the door, tapping Book on the bar goes straight to Book with the phone right there, and the steps jumped over aren't marked",
    (await viewOf(pageA)) === "book" && (await pageA.locator("#sheet-phone").count()) === 1 && JSON.stringify(jumpedMarks) === JSON.stringify(["door"]),
    jumpedMarks.join(", "),
  );
  await sheet(pageA).getByTestId("sheet-step-door").click();
  await waitView(pageA, "door");
  check("tapping At the door on the bar goes straight back, and Next there is the plain next step", (await nextLabel(pageA)) === "Next");
  await swipe(pageA, "right");
  check("swiping right goes back a step", (await viewOf(pageA)) === "who");
  await swipe(pageA, "left");
  check("swiping left goes on a step", (await viewOf(pageA)) === "door");
  await swipe(pageA, "left");
  await waitView(pageA, "learned");
  const doorMarked = await sheet(pageA).locator('[data-testid="sheet-progress"] [data-step="door"]').getAttribute("data-missing");
  check(
    "a swipe moves on with a question open, and the progress bar marks that step",
    doorMarked === "yes" && (await sheet(pageA).getByTestId("sheet-part").innerText()).startsWith("After the door") && (await stepCounter(pageA)) === "Step 3 of 6, 7 to answer",
    `${doorMarked}; ${await stepCounter(pageA)}`,
  );
  await answer(pageA, "Christmas lights now", "Hires someone");
  await answer(pageA, "Setter's read (optional)", "Hot");
  await answer(pageA, "What would make them say yes (optional, pick any)", "No more ladders");
  await answer(pageA, "What would make them say yes (optional, pick any)", "Up for Christmas");
  await sheet(pageA).getByTestId("mark-rest").click();
  // Round 6 (Keenan, 2026-11-07): Which areas and Timing aren't asked any
  // more, so the step has two counted questions.
  const counted = ["christmas_lights_now", "looked_into_before"];
  const marked = await Promise.all(counted.map((question) => sheet(pageA).locator(`fieldset[data-question="sheet-${question}"] input:checked`).getAttribute("value").catch(() => "")));
  check(
    "Mark the rest Not collected answers the two counted questions in one tap, keeping the answer given, and leaves the optional ones as chosen",
    JSON.stringify(marked) === JSON.stringify(["hires", "not_collected"]) &&
      (await sheet(pageA).locator("fieldset legend").filter({ hasText: /^(Which areas|Timing)$/ }).count()) === 0 &&
      (await sheet(pageA).locator('[data-question="sheet-hot-buttons"] input:checked').count()) === 2,
    marked.join(", "),
  );
  scrolls.learned = await sheetScrolls(pageA);
  await checkTapTargets(pageA, "What else did you learn");
  await pageA.screenshot({ path: `${out}/r3-learned-430.png` });
  await next(pageA);
  await waitView(pageA, "address");
  scrolls.address = await sheetScrolls(pageA);
  await pageA.fill("#lead-address", "306 Sheet Test Way NW (TEST)");
  await pageA.getByTestId("sheet-heading").click();
  // A rough first reading, as an iPhone gives before GPS settles: it says
  // it's working at once and keeps listening, then takes the good one.
  await pageA.context().setGeolocation({ latitude: 51.0447, longitude: -114.0719, accuracy: 220 });
  await sheet(pageA).getByRole("button", { name: "Use where I'm standing" }).click();
  await sheet(pageA).getByTestId("position-status").getByText(/^Finding where you are/).waitFor({ timeout: 5000 }).catch(() => {});
  const finding = (await sheet(pageA).getByTestId("position-status").innerText().catch(() => "")).trim();
  const listening = (await sheet(pageA).getByTestId("use-my-position").getByRole("button").innerText().catch(() => "")).trim();
  await pageA.context().setGeolocation({ latitude: 51.0447, longitude: -114.0719, accuracy: 10 });
  await sheet(pageA).getByText(/^Position saved from this phone at the door, accurate to about 10 m\.$/).first().waitFor({ timeout: 20000 });
  check(
    "Use where I'm standing says it's working at once and keeps listening past a rough reading, then says the position saved from this phone at the door",
    finding.startsWith("Finding where you are") && listening === "Listening, up to 15 seconds",
    `${finding}; ${listening}`,
  );
  // The soffit is left for later; the house type is optional.
  await answer(pageA, "House type (optional)", "Two storey");
  scrolls.addressDone = await sheetScrolls(pageA);
  await next(pageA);
  await waitView(pageA, "house", 30000);
  scrolls.house = await sheetScrolls(pageA);
  check(
    "Next moves on with the soffit still open, and marks the house step",
    (await sheet(pageA).locator('[data-testid="sheet-progress"] [data-step="address"]').getAttribute("data-missing")) === "yes" && (await nextLabel(pageA)) === "Next",
  );
  const tiles = await Promise.all(
    ["Front", "Left corner", "Right corner", "Soffit close-up"].map(async (label) => [
      await sheet(pageA).getByRole("button", { name: `Take photo, ${label}` }).count(),
      await sheet(pageA).getByRole("button", { name: `Upload a photo from the phone, ${label}` }).count(),
    ]),
  );
  check(
    "the photos can be taken before the person is saved: each slot is a big Take photo button with a line drawing of the angle, and a smaller Upload",
    tiles.every(([take, upload]) => take === 1 && upload === 1) && (await sheet(pageA).locator("svg[data-guide]").count()) === 4,
    JSON.stringify(tiles),
  );

  // Under a minute: the time says so and offers Add 5 minutes.
  await setSecondsLeft(pageA, people.a, 45);
  await pageA.locator('[data-testid="sheet-held"][data-phase="under_a_minute"]').waitFor({ timeout: 15000 }).catch(() => {});
  const warning45 = (await pageA.getByTestId("hold-warning").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const left45 = await secondsLeft(pageA);
  check(
    "with under a minute left, the time says so and offers Add 5 minutes",
    warning45 === `Under a minute left on ${timeLabel(X)}${timeLabel(X).endsWith(".") ? "" : "."} Add ${holdMinutes} minutes` && left45 !== null && left45 <= 45,
    `${warning45} (${left45} s)`,
  );
  await pageA.screenshot({ path: `${out}/r2-under-a-minute-430.png` });
  const before45 = await renewedAt(people.a);
  await pageA.getByTestId("hold-warning").getByRole("button", { name: `Add ${holdMinutes} minutes` }).click();
  await pageA.locator('[data-testid="sheet-held"][data-phase="plenty"]').waitFor({ timeout: 15000 }).catch(() => {});
  const leftAdded = await secondsLeft(pageA);
  const after45 = await renewedAt(people.a);
  check(
    "Add 5 minutes adds the hold length to what was left, in the database too",
    leftAdded !== null && leftAdded > holdMinutes * 60 && leftAdded <= holdMinutes * 60 + 45 && after45 - before45 === holdMinutes * 60_000,
    `${leftAdded} s left; moved ${(after45 - before45) / 1000} s`,
  );
  await openHoldMenu(pageA);
  await pageA.getByTestId("hold-menu").getByRole("menuitem", { name: `Add ${holdMinutes} minutes` }).click();
  await pageA.waitForTimeout(1500);
  const leftTwice = await secondsLeft(pageA);
  check("Add 5 minutes in the time's menu does the same", leftTwice !== null && leftAdded !== null && leftTwice > leftAdded + holdMinutes * 60 - 30, `${leftAdded} then ${leftTwice}`);

  // Run out: the sheet says so, and holds it again while it's still free.
  await setSecondsLeft(pageA, people.a, -5);
  const lost = await pageA.getByTestId("sheet-hold-lost").innerText({ timeout: 15000 }).catch(() => "");
  check("when the hold runs out, the sheet says so and that the time is still free", lost.includes("ran out") && lost.includes("still free") && (await heldState(pageA)) === "no", lost.replace(/\s+/g, " "));
  check("and Book can't be reached on a time that isn't held: the countdown says Ran out", ((await sheet(pageA).getByTestId("sheet-countdown").innerText()).trim()) === "Ran out");
  await pageA.screenshot({ path: `${out}/r2-ran-out-430.png` });
  await sheet(pageA).getByRole("button", { name: "Hold it again" }).click();
  await pageA.getByTestId("sheet-hold-lost").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  const leftAgain = await secondsLeft(pageA);
  check(
    "Hold it again takes the time back with a fresh timer, and the sheet carries on",
    (await heldState(pageA)) === "yes" && (await viewOf(pageA)) === "house" && leftAgain !== null && leftAgain > holdMinutes * 60 - 30,
    `${leftAgain} s`,
  );
  await takePhotos(pageA);
  scrolls.houseTaken = await sheetScrolls(pageA);
  await checkTapTargets(pageA, "Soffit and photos");
  await pageA.screenshot({ path: `${out}/r2-house-430.png` });
  const { count: savedEarly } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("address_line", "306 Sheet Test Way NW (TEST)");
  check("with the phone still to come, nothing is saved yet: the photos wait in the setter's own folder", savedEarly === 0, `${savedEarly} leads`);
  await next(pageA);
  await waitView(pageA, "book");
  scrolls.bookMissing = await sheetScrolls(pageA);
  check("the last step says so, with what's left, the same count as Book's button: Step 6 of 6, 3 to answer", (await stepCounter(pageA)) === "Step 6 of 6, 3 to answer", await stepCounter(pageA));
  const missingRows = await sheet(pageA).getByTestId("readiness").locator("li").evaluateAll((items) => items.map((item) => item.getAttribute("data-item")));
  check(
    "Book lists everything still missing on other steps, each with a tap to its step, and stays off until it's all answered",
    JSON.stringify(missingRows) === JSON.stringify(["wants_price", "soffit_colour"]) && (await nextLabel(pageA)) === "3 left to answer" && (await pageA.getByTestId("sheet-next").getAttribute("data-ready")) === "no",
    `${missingRows.join(", ")}; ${await nextLabel(pageA)}`,
  );
  await pageA.screenshot({ path: `${out}/r3-book-missing-430.png` });
  await next(pageA);
  check("tapping Book that isn't ready books nothing and stays on Book", (await viewOf(pageA)) === "book");
  await sheet(pageA).getByTestId("readiness").locator('li[data-item="wants_price"] button').click();
  await waitView(pageA, "door");
  check("a missing item opens its step, and Next there says Return to Book", (await nextLabel(pageA)) === "Return to Book");
  await answer(pageA, "Wants a price", "Yes");
  await next(pageA);
  await waitView(pageA, "book");
  await sheet(pageA).getByTestId("readiness").locator('li[data-item="soffit_colour"] button').click();
  await waitView(pageA, "address");
  // Round 6 (Keenan, 2026-11-07): a split soffit takes two colours, and then
  // a note on which is where, which Book asks for until it's typed.
  await answer(pageA, "Soffit colour", "White");
  await answer(pageA, "Soffit colour", "Off-white or cream");
  await next(pageA);
  await waitView(pageA, "book");
  const soffitNoteRow = sheet(pageA).getByTestId("readiness").locator('li[data-items~="soffit_note"]');
  const soffitNoteText = (await soffitNoteRow.innerText({ timeout: 5000 }).catch(() => "")).replace(/\s+/g, " ").trim();
  check(
    "a split soffit, White and Off-white or cream, needs a note: Book lists Which soffit colour is where until it's typed",
    soffitNoteText.startsWith("Which soffit colour is where") && (await nextLabel(pageA)) === "2 left to answer",
    `${soffitNoteText}; ${await nextLabel(pageA)}`,
  );
  await soffitNoteRow.locator("button").click();
  await waitView(pageA, "address");
  check("the note asks Which colour is where?", (await sheet(pageA).locator('label[for="sheet-soffit-note"]').innerText().catch(() => "")).trim() === "Which colour is where?");
  await pageA.fill("#sheet-soffit-note", SOFFIT_NOTE);
  await next(pageA);
  await waitView(pageA, "book");
  check(
    "with everything else answered, Book says so and waits only for the number",
    (await sheet(pageA).getByTestId("readiness").innerText()).includes("Everything else is answered") && (await nextLabel(pageA)) === "1 left to answer",
    await nextLabel(pageA),
  );
  // The number, right above Book in the footer, as on every step; the
  // phone's Not collected is on the Book page itself. Round 6: Call or text
  // to confirm isn't asked any more; Book says Keenan confirms instead.
  const phoneBox = await sheet(pageA).getByTestId("sheet-phone-block").boundingBox();
  const bookBox = await pageA.getByTestId("sheet-next").boundingBox();
  check("on Book the phone is right above the Book button and in view", phoneBox !== null && bookBox !== null && phoneBox.y + phoneBox.height <= bookBox.y && phoneBox.y > 0);
  check(
    "the phone's Not collected is on the Book page, not in the footer",
    (await sheet(pageA).getByTestId("sheet-body").getByTestId("book-confirm").count()) === 1 &&
      (await sheet(pageA).getByTestId("sheet-body").getByTestId("sheet-phone-not-collected").count()) === 1 &&
      (await sheet(pageA).getByTestId("sheet-phone-block").locator("button").count()) === 0,
  );
  const confirmsLine = (await sheet(pageA).getByTestId("book-confirm").getByTestId("keenan-confirms").innerText({ timeout: 5000 }).catch(() => "")).trim();
  check(
    "Book says Keenan confirms the meeting with them, and asks no Call or text to confirm",
    confirmsLine === "Keenan confirms the meeting with them." &&
      (await sheet(pageA).locator("fieldset").filter({ has: pageA.locator("legend", { hasText: /^Call or text/ }) }).count()) === 0,
    confirmsLine,
  );
  await pageA.fill("#sheet-phone", "403 555 0166");
  scrolls.book = await sheetScrolls(pageA);
  // The learned step holds the two questions and the two optional ones:
  // it may scroll a little, and so may Book's list while things are missing
  // (the phone and Book stay pinned below it). Every other step fits
  // Keenan's phone.
  const fit = Object.fromEntries(Object.entries(scrolls).filter(([key]) => key !== "learned" && key !== "bookMissing"));
  check("no step but What else did you learn, and Book's missing list, scrolls on Keenan's phone, 430 x 932", Object.values(fit).every((value) => value === false), JSON.stringify(scrolls));
  const bookLabel = (await pageA.getByTestId("sheet-next").innerText()).trim();
  const weekday = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short" }).format(new Date(`${testDay}T12:00:00Z`));
  const tomorrowDay = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const expectedBook = testDay === today ? `Book ${timeLabel(X)}` : testDay === tomorrowDay ? `Book tomorrow ${timeLabel(X)}` : `Book ${weekday} ${timeLabel(X)}`;
  check("with the number in, the Book button says which time it books, with the day when it isn't tonight", bookLabel === expectedBook, bookLabel);
  const heldShown = (await sheet(pageA).getByTestId("sheet-held-time").innerText()).trim();
  check("the held time in the header names its day", heldShown.endsWith(timeLabel(X)) && (testDay === today ? heldShown.startsWith("Tonight") : heldShown.startsWith(testDay === tomorrowDay ? "Tomorrow" : weekday)), heldShown);
  await swipe(pageA, "left");
  check("a swipe never books: Book is a tap", (await viewOf(pageA)) === "book");
  await checkTapTargets(pageA, "Book");
  await pageA.screenshot({ path: `${out}/m3-sheet-book.png` });
  await next(pageA);
  await waitView(pageA, "done", 30000);
  const doneHeading = (await pageA.getByTestId("sheet-heading").innerText()).trim();
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const expectedDone =
    testDay === today ? `Booked for ${timeLabel(X)} tonight.` : testDay === tomorrow ? `Booked for ${timeLabel(X)} tomorrow.` : `Booked for ${dayChip(testDay)} at ${timeLabel(X)}`;
  check("then a done screen says when it's booked for, in one sentence", doneHeading === expectedDone, doneHeading);
  check("the time at the top says booked", (await heldState(pageA)) === "booked");
  await pageA.screenshot({ path: `${out}/m3-sheet-done.png` });
  const seenBooked = await waitForState(pageB, X, "booked");
  check("the other setter sees the time grey out, booked", seenBooked !== null && seenBooked <= 8000, seenBooked === null ? "never" : `${(seenBooked / 1000).toFixed(1)} s`);
  const bookedLabel = (await slotButton(pageB, X).getAttribute("aria-label")) ?? "";
  check("a booked time shows who booked it, and can't be tapped", bookedLabel.includes("TEST Setter A") && (await slotButton(pageB, X).isDisabled()), bookedLabel);
  const { data: sheetLead } = await admin
    .from("leads")
    .select("id, status, looked_into_before, christmas_lights_now, wants_price, both_decision_makers, soffit_colour, soffit_colour_2, soffit_note, not_collected, position_source, position_accuracy_m, house_type, setter_read, hot_buttons, confirm_by, areas_wanted, install_timing")
    .eq("address_line", "306 Sheet Test Way NW (TEST)")
    .single();
  check(
    "the sheet saved the person as a lead with every answer, out of order, Not collected as such, the phone's position and Booked",
    sheetLead?.status === "meeting_booked" &&
      sheetLead?.christmas_lights_now === "hires" &&
      sheetLead?.looked_into_before === null &&
      sheetLead?.wants_price === true &&
      sheetLead?.both_decision_makers === true &&
      sheetLead?.soffit_colour === "white" &&
      JSON.stringify(sheetLead?.not_collected) === JSON.stringify(["looked_into_before"]) &&
      sheetLead?.areas_wanted === null &&
      sheetLead?.install_timing === null &&
      sheetLead?.position_source === "device" &&
      Number(sheetLead?.position_accuracy_m) === 10,
    JSON.stringify(sheetLead),
  );
  check(
    "and the optional answers: house type, the setter's read and the hot buttons; call or text to confirm is never written",
    sheetLead?.house_type === "two_storey" && sheetLead?.setter_read === "hot" && JSON.stringify(sheetLead?.hot_buttons) === JSON.stringify(["no_ladders", "up_for_christmas"]) && sheetLead?.confirm_by === null,
  );
  check(
    "the split soffit saves both colours and the note on which is where",
    sheetLead?.soffit_colour === "white" && sheetLead?.soffit_colour_2 === "off_white" && sheetLead?.soffit_note === SOFFIT_NOTE,
    `${sheetLead?.soffit_colour}, ${sheetLead?.soffit_colour_2}: ${sheetLead?.soffit_note}`,
  );
  const { data: sheetContact } = await admin.from("leads").select("phone").eq("id", sheetLead?.id).single();
  check("the number typed last is saved", sheetContact?.phone === "+14035550166", sheetContact?.phone);
  const { data: sheetMeeting } = await admin.from("meetings").select("id, setter_id, everyone_deciding_present, photos_skipped, starts_at").eq("lead_id", sheetLead?.id).eq("status", "booked").single();
  const { data: sheetPhotos } = await admin.from("lead_photos").select("slot").eq("lead_id", sheetLead?.id);
  check(
    "the meeting is booked for the setter, with everyone who decides confirmed and the three photos taken before the save in their slots",
    sheetMeeting?.setter_id === people.a.id && sheetMeeting?.everyone_deciding_present === true && sheetMeeting?.photos_skipped === null && new Date(sheetMeeting?.starts_at).toISOString() === X && (sheetPhotos ?? []).map((photo) => photo.slot).sort().join(",") === "front,left_corner,right_corner",
  );
  await sheet(pageA).getByRole("button", { name: "Done", exact: true }).click();
  await sheet(pageA).waitFor({ state: "detached", timeout: 15000 });
  check("Done closes the sheet and returns to the schedule", new URL(pageA.url()).pathname === "/app/schedule");

  // ---------------------------------------------------------------- a run-out hold that someone else takes can't be held again
  // The reload above opened the schedule on its first evening again.
  await chooseEvening(pageA.locator("main"), testDay);
  await waitForState(pageA, Z, "open");
  await slotButton(pageA, Z).click();
  await waitView(pageA, "who");
  await setSecondsLeft(pageA, people.a, -5);
  await pageA.getByTestId("sheet-hold-lost").waitFor({ timeout: 15000 }).catch(() => {});
  const freeForB = await waitForState(pageB, Z, "open");
  await slotButton(pageB, Z).click();
  await waitView(pageB, "who");
  check("once A's hold ran out, B can hold that time", freeForB !== null && (await heldState(pageB)) === "yes");
  // A's notice checks again every few seconds while it offers the time back.
  await pageA
    .waitForFunction(() => document.querySelector('[data-testid="sheet-hold-lost"]')?.textContent?.includes("TEST Setter B is booking it now"), null, { timeout: 15000 })
    .catch(() => {});
  const takenNotice = (await pageA.getByTestId("sheet-hold-lost").innerText().catch(() => "")).replace(/\s+/g, " ");
  await openHoldMenu(pageA);
  const runOutMenu = (await pageA.getByTestId("hold-menu").getByRole("menuitem").allInnerTexts()).map((item) => item.trim());
  await pageA.keyboard.press("Escape");
  const { data: zHolds } = await admin.from("slot_holds").select("holder_id").eq("starts_at", Z).is("released_at", null);
  check(
    "a run-out time someone else took can't be held again: A is told who is booking it, with no Hold it again or Add 5 minutes",
    takenNotice.includes("ran out") &&
      takenNotice.includes("TEST Setter B is booking it now") &&
      (await sheet(pageA).getByRole("button", { name: "Hold it again" }).count()) === 0 &&
      !runOutMenu.some((item) => /^(Add |Hold it again)/.test(item)),
    `${takenNotice} | menu: ${runOutMenu.join(", ")}`,
  );
  check("B still has the time: exactly one hold", (zHolds ?? []).length === 1 && zHolds[0].holder_id === people.b.id);
  await pageA.keyboard.press("Escape");
  await sheet(pageA).waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  await letGo(pageB);

  // ---------------------------------------------------------------- an existing lead skips what it already has
  await waitForState(pageA, Z, "open");
  await slotButton(pageA, Z).click();
  await waitView(pageA, "who");
  await sheet(pageA).getByRole("button", { name: "Existing lead instead" }).click();
  await waitView(pageA, "existing");
  const listed = (await sheet(pageA).getByRole("list", { name: "Your leads" }).innerText().catch(() => "")).replace(/\s+/g, " ");
  check("Existing lead instead lists the setter's New and Follow up leads, not booked ones or other setters'", listed.includes("301 Hold Test Way") && !listed.includes("306 Sheet Test Way") && !listed.includes("9 Far Test Way"), listed.slice(0, 160));
  await sheet(pageA).getByRole("button", { name: /301 Hold Test Way NW/ }).click();
  await waitView(pageA, "door");
  check("picking an existing lead skips the name and phone it already has", (await sheet(pageA).getByTestId("sheet-for").count()) === 1);
  await answer(pageA, "Everyone who decides will be there", "Yes");
  await next(pageA);
  await waitView(pageA, "learned");
  await answer(pageA, "Christmas lights now", "Does it themselves");
  // Round 6: Got quotes and Thought about it can be picked together.
  await answer(pageA, "Looked into it before", "Got quotes");
  await answer(pageA, "Looked into it before", "Thought about it");
  await next(pageA);
  await waitView(pageA, "house", 30000);
  check("and skips the address it already has", true);
  await skipPhotos(pageA);
  await next(pageA);
  await waitView(pageA, "book");
  await next(pageA);
  await waitView(pageA, "done", 30000);
  const seenZ = await waitForState(pageB, Z, "booked");
  const zLabel = (await slotButton(pageB, Z).getAttribute("aria-label")) ?? "";
  check("the existing lead is booked; others see the neighbourhood and who booked it", seenZ !== null && zLabel.includes(TEST_PLACE) && zLabel.includes("TEST Setter A"), zLabel);
  const { data: meeting1 } = await admin.from("meetings").select("id, status, setter_id, photos_skipped").eq("lead_id", lead1).eq("status", "booked").single();
  check("the meeting is booked for the lead's setter with the photo reason", meeting1?.setter_id === people.a.id && meeting1?.photos_skipped === "homeowner_said_no");
  const { data: lead1Answers } = await admin.from("leads").select("christmas_lights_now, looked_into_before").eq("id", lead1).single();
  check(
    "Got quotes and Thought about it, picked together on the sheet, save as quotes_and_thought",
    lead1Answers?.looked_into_before === "quotes_and_thought" && lead1Answers?.christmas_lights_now === "diy",
    JSON.stringify(lead1Answers),
  );
  await sheet(pageA).getByRole("button", { name: "Done", exact: true }).click();
  await sheet(pageA).waitFor({ state: "detached", timeout: 15000 });

  // ---------------------------------------------------------------- every step at 390 wide, then a draft picked up from Home
  await waitForState(pageB, V, "open");
  await slotButton(pageB, V).click();
  await waitView(pageB, "who");
  const scrollsB = {};
  scrollsB.who = await sheetScrolls(pageB);
  await pageB.fill("#sheet-first-name", TEST_LEAD);
  await pageB.fill("#sheet-last-name", "Narrow");
  await next(pageB);
  await waitView(pageB, "door");
  scrollsB.door = await sheetScrolls(pageB);
  await answer(pageB, "Owns the home", "Yes");
  await answer(pageB, "Wants a price", "Yes");
  await answer(pageB, "Everyone who decides will be there", "Yes");
  await checkTapTargets(pageB, "At the door's questions at 390 wide");
  await next(pageB);
  await waitView(pageB, "learned");
  scrollsB.learned = await sheetScrolls(pageB);
  await checkTapTargets(pageB, "What else did you learn at 390 wide");
  await pageB.screenshot({ path: `${out}/r2-learned-390.png` });
  await sheet(pageB).getByTestId("mark-rest").click();
  scrollsB.learnedMarked = await sheetScrolls(pageB);
  await next(pageB);
  await waitView(pageB, "address");
  scrollsB.address = await sheetScrolls(pageB);
  await pageB.fill("#lead-address", "307 Narrow Test Way NW (TEST)");
  await pageB.getByTestId("sheet-heading").click();
  await sheet(pageB).getByRole("button", { name: "Use where I'm standing" }).click();
  await sheet(pageB).getByText(/accurate to about 10 m/).first().waitFor({ timeout: 15000 });
  await answer(pageB, "Soffit colour", "Not sure");
  scrollsB.addressDone = await sheetScrolls(pageB);
  await checkTapTargets(pageB, "The house at 390 wide");
  await next(pageB);
  await waitView(pageB, "house", 30000);
  scrollsB.house = await sheetScrolls(pageB);
  await checkTapTargets(pageB, "Photos at 390 wide");
  await pageB.screenshot({ path: `${out}/r2-house-390.png` });
  await skipPhotos(pageB);
  scrollsB.houseSkipped = await sheetScrolls(pageB);
  // The number can come up at any point: typed here, on the photos step,
  // it is still in the footer on Book.
  await pageB.fill("#sheet-phone", "403 555 0133");
  await pageB.getByTestId("sheet-heading").click();
  await next(pageB);
  await waitView(pageB, "book");
  check(
    "a number typed on an earlier step stays put in the footer when the step changes, ticked once it's a real number",
    (await pageB.inputValue("#sheet-phone")) === "(403) 555-0133" && (await sheet(pageB).getByTestId("sheet-phone-ok").count()) === 1,
    await pageB.inputValue("#sheet-phone"),
  );
  await checkTapTargets(pageB, "Book at 390 wide");
  // Book's list of what's missing may scroll above the pinned phone and Book.
  const missingB = await sheet(pageB).getByTestId("readiness").locator('li[data-ok="no"]').count();
  scrollsB[missingB > 0 ? "bookMissing" : "book"] = await sheetScrolls(pageB);
  await pageB.screenshot({ path: `${out}/r3-book-390.png` });
  // The learned step's two optional groups make it scroll a little at 390,
  // as can the photos with the skip reason open.
  check(
    "no step of the sheet scrolls at 390 x 844 but What else did you learn",
    Object.entries(scrollsB).every(([key, value]) => value === false || key === "houseSkipped" || key === "bookMissing" || key.startsWith("learned")),
    JSON.stringify(scrollsB),
  );
  await letGo(pageB);
  await pageB.goto(`${base}/app/session`);
  await settle(pageB);
  // On Session it's one row saying how many, which opens the list.
  const unfinishedToggle = pageB.getByTestId("unfinished-toggle");
  check("Session shows unfinished bookings as one row saying how many", ((await unfinishedToggle.innerText().catch(() => "")) ?? "").includes("1 unfinished booking"));
  await unfinishedToggle.click();
  const unfinished = (await pageB.getByTestId("unfinished").innerText().catch(() => "")).replace(/\s+/g, " ");
  check(
    "leaving the sheet keeps what was entered: Session lists it under Unfinished, where it stopped, even before knocking starts",
    unfinished.includes(`${TEST_LEAD} Narrow`) && unfinished.includes("307 Narrow Test Way NW (TEST)") && unfinished.includes("Stopped at Book"),
    unfinished.slice(0, 200),
  );
  const keptKeys = await pageB.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("vesper:sheet-drafts:")));
  check("the draft lives on this phone, under the setter's own key", JSON.stringify(keptKeys) === JSON.stringify([`vesper:sheet-drafts:${people.b.id}`]), keptKeys.join(", "));
  // Round 5 (Keenan, 2026-11-06): a tap gives two choices, pick up where
  // you left off, or Delete.
  await pageB.getByTestId("unfinished-item").first().click();
  check(
    "tapping an unfinished booking gives two choices: pick up where you left off, or Delete",
    (await pageB.getByTestId("unfinished-pick-up").innerText()).trim() === "Pick up where you left off" && (await pageB.getByTestId("unfinished-delete").innerText()).trim() === "Delete",
  );
  await pageB.getByTestId("unfinished-pick-up").click();
  await waitView(pageB, "times");
  const pickupHeading = (await pageB.getByTestId("sheet-heading").innerText()).trim();
  check("tapping it reopens the sheet and asks for a time first", pickupHeading === `Pick a time for ${TEST_LEAD} Narrow`, pickupHeading);
  await chooseEvening(sheet(pageB), testDay);
  await sheetSlot(pageB, V).click();
  await waitView(pageB, "book");
  check(
    "then it picks up where it was left, with everything entered",
    (await sheet(pageB).getByTestId("sheet-summary").innerText()).includes(`${TEST_LEAD} Narrow`) && (await heldState(pageB)) === "yes",
  );
  await letGo(pageB);
  // Delete takes a second, deliberate tap; the draft goes from this phone
  // and a lead it already saved stays in Leads, as the confirm says.
  await pageB.goto(`${base}/app/session`);
  await settle(pageB);
  await pageB.getByTestId("unfinished-toggle").click();
  const draftKey = await pageB.getByTestId("unfinished-item").first().getAttribute("data-draft");
  await pageB.getByTestId("unfinished-item").first().click();
  await pageB.getByTestId("unfinished-delete").click();
  const confirmText = (await pageB.getByTestId("unfinished-confirm").innerText().catch(() => "")).trim();
  const savedLeadId = draftKey?.startsWith("lead:") ? draftKey.slice(5) : null;
  check(
    "the first Delete only asks: it says Tap again to delete, and the draft is still on the phone",
    (await pageB.getByTestId("unfinished-delete").innerText()).trim() === "Tap again to delete" &&
      (await pageB.evaluate((key) => (localStorage.getItem(key) ?? "").length > 0, `vesper:sheet-drafts:${people.b.id}`)),
  );
  check(
    "the confirm says what happens to the person: a saved lead stays in Leads",
    savedLeadId ? confirmText.includes("stay in Leads") : confirmText.includes("deletes what's on this phone"),
    confirmText,
  );
  await pageB.getByTestId("unfinished-delete").click();
  await pageB.getByTestId("unfinished").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  const draftsLeft = await pageB.evaluate((key) => localStorage.getItem(key), `vesper:sheet-drafts:${people.b.id}`);
  const { data: stillALead } = savedLeadId ? await admin.from("leads").select("id").eq("id", savedLeadId).maybeSingle() : { data: null };
  const { data: bHolds } = await admin.from("slot_holds").select("id").eq("holder_id", people.b.id).is("released_at", null);
  check(
    "the second tap deletes it: gone from the phone and from Session, no time held, and the lead it saved is still in Leads",
    draftsLeft === null && (await pageB.getByTestId("unfinished").count()) === 0 && (bHolds ?? []).length === 0 && (savedLeadId ? stillALead?.id === savedLeadId : true),
    `${draftKey}; holds ${(bHolds ?? []).length}`,
  );
  // Back to watching the test evening from Schedule.
  await pageB.goto(`${base}/app/schedule`);
  await settle(pageB);
  await chooseEvening(pageB.locator("main"), testDay);

  // ---------------------------------------------------------------- a lead that isn't ready, booked from its page
  await pageA.goto(`${base}/app/leads/${lead2}`);
  await settle(pageA);
  await pageA.getByRole("button", { name: "Book a meeting" }).click();
  await waitView(pageA, "times");
  await chooseEvening(sheet(pageA), testDay);
  await sheetSlot(pageA, W).click();
  // It has a name, so it opens on the first step that still needs something.
  await waitView(pageA, "door");
  check(
    "the lead page's Book a meeting opens the same sheet, prefilled, with the time held",
    (await heldState(pageA)) === "yes" && (await sheet(pageA).getByTestId("sheet-for").innerText()).includes(TEST_LEAD),
  );
  await sheet(pageA).getByTestId("mark-rest").click();
  const doorNote = (await sheet(pageA).getByTestId("door-note").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  check(
    "Mark the rest at the door says at once what it means for booking, offers Keep as a lead, and steps Next back",
    doorNote.startsWith("Booking needs a Yes for owns the home, wants a price and everyone who decides.") &&
      doorNote.includes("Keep as a lead") &&
      (await pageA.getByTestId("sheet-next").getAttribute("data-step-back")) === "yes",
    doorNote,
  );
  await next(pageA);
  await waitView(pageA, "learned");
  await sheet(pageA).getByTestId("mark-rest").click();
  await next(pageA);
  await waitView(pageA, "address", 30000);
  await sheet(pageA).getByRole("button", { name: "Use where I'm standing" }).click();
  await sheet(pageA).getByText(/accurate to about 10 m/).first().waitFor({ timeout: 15000 });
  await answer(pageA, "Soffit colour", "Not sure");
  await next(pageA);
  await waitView(pageA, "house", 30000);
  await skipPhotos(pageA);
  await next(pageA);
  await waitView(pageA, "book");
  // The phone, last, on Book: Not collected.
  await sheet(pageA).getByTestId("sheet-phone-not-collected").click();
  const ruled = (await sheet(pageA).getByTestId("book-ruled-out").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const blocked = pageA.getByTestId("sheet-next");
  check(
    "Not collected never counts where booking needs a real answer: Book says it needs a number and a Yes for the three",
    ruled.startsWith("Booking needs a number and a Yes for owns the home, wants a price and everyone who decides.") &&
      (await blocked.innerText()).trim() === "Can't book yet" &&
      (await blocked.getAttribute("data-ready")) === "no",
    ruled,
  );
  check("Book offers one Keep as a lead, once an answer rules booking out", (await sheet(pageA).getByTestId("keep-as-lead").count()) === 1);
  await next(pageA);
  check(
    "Can't book yet stays on Book with the time still held and goes to Keep as a lead",
    (await viewOf(pageA)) === "book" && (await heldState(pageA)) === "yes" && (await pageA.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "keep-as-lead",
  );
  await sheet(pageA).getByTestId("keep-as-lead").click();
  // Keep as a lead saves what was entered first (with the phone asked last,
  // the sheet hadn't saved yet), then lets the time go and closes.
  await sheet(pageA).waitFor({ state: "detached", timeout: 30000 });
  await pageA.waitForURL(`**/app/leads/${lead2}`, { timeout: 30000 });
  const reopenedW = await waitForState(pageB, W, "open");
  check("Keep as a lead on a saved lead frees the time on other phones at once and opens their lead, for a follow-up day", reopenedW !== null);
  const { data: lead2Now } = await admin.from("leads").select("not_collected").eq("id", lead2).single();
  check("the lead keeps what was marked Not collected", (lead2Now?.not_collected ?? []).includes("phone") && (lead2Now?.not_collected ?? []).includes("owns_home"), JSON.stringify(lead2Now));

  // ---------------------------------------------------------------- Keep as a lead: a new person the sheet can't book
  await pageA.goto(`${base}/app/schedule`);
  await settle(pageA);
  await chooseEvening(pageA.locator("main"), testDay);
  await slotButton(pageA, W).click();
  await waitView(pageA, "who");
  check("the first step's corner lets the time go, instead of a Back with nowhere to go", ((await pageA.getByTestId("sheet-let-go-first").innerText().catch(() => "")).trim()) === "Let go");
  await pageA.fill("#sheet-first-name", `${TEST_LEAD} Keep`);
  await next(pageA);
  await waitView(pageA, "door");
  await answer(pageA, "Owns the home", "Yes");
  await answer(pageA, "Wants a price", "Not yet");
  check(
    "a Not yet at the door makes Keep as a lead the gold button and steps Next back",
    (await sheet(pageA).getByTestId("door-note").getByTestId("keep-as-lead").count()) === 1 && (await pageA.getByTestId("sheet-next").getAttribute("data-step-back")) === "yes",
  );
  await sheet(pageA).getByTestId("keep-as-lead").click();
  await pageA.waitForURL("**/app/leads/new", { timeout: 30000 });
  await settle(pageA);
  const kept = await waitForState(pageB, W, "open");
  check("Keep as a lead lets the time go at once: it is open again on other phones", kept !== null);
  const keptNotice = (await pageA.getByTestId("draft-restored").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  check(
    "New lead opens with the person and their answers, and says the time is free again",
    keptNotice.startsWith("Kept as a lead, and the time is free again.") &&
      (await pageA.inputValue("#lead-first_name")) === `${TEST_LEAD} Keep` &&
      (await pageA.locator('[data-question="wants_price"] input[value="not_yet"]').isChecked()) &&
      (await pageA.locator('[data-question="owns_home"] input[value="yes"]').isChecked()),
    keptNotice,
  );
  const sheetDraftsLeft = await pageA.evaluate(() => Object.entries(localStorage).filter(([key, value]) => key.startsWith("vesper:sheet-drafts:") && value.includes("Keep")).length);
  check("it leaves nothing in Unfinished: the person carries on in New lead", sheetDraftsLeft === 0);
  await pageA.fill("#lead-address", "308 Keep Test Way NW (TEST)");
  await pageA.locator("#lead-first_name").click();
  await pageA.getByRole("button", { name: "Use where I'm standing" }).click();
  await pageA.getByText(/accurate to about 10 m/).first().waitFor({ timeout: 15000 });
  // The number wasn't asked at the door; New lead takes it.
  await pageA.fill("#lead-phone", "403 555 0142");
  await pageA.getByTestId("mark-rest").click();
  await pageA.getByRole("button", { name: "Save lead" }).click();
  await pageA.waitForURL((url) => !url.pathname.endsWith("/leads/new"), { timeout: 30000 }).catch(() => {});
  const { data: keptLead } = await admin
    .from("leads")
    .select("status, owns_home, wants_price, phone, lat")
    .eq("created_by", people.a.id)
    .eq("first_name", `${TEST_LEAD} Keep`)
    .maybeSingle();
  check(
    "saved from New lead, they're a lead with what was asked at the door: Owns the home Yes, Wants a price Not yet",
    keptLead?.status === "new" && keptLead?.owns_home === true && keptLead?.wants_price === false && keptLead?.phone === "+14035550142" && keptLead?.lat !== null,
    JSON.stringify(keptLead),
  );

  // ---------------------------------------------------------------- the distance warning
  await pageB.goto(`${base}/app/leads/${lead3}`);
  await settle(pageB);
  await pageB.getByRole("button", { name: "Book a meeting" }).click();
  await waitView(pageB, "times");
  await chooseEvening(sheet(pageB), testDay);
  await sheetSlot(pageB, W).click();
  await waitView(pageB, "door");
  await answer(pageB, "Everyone who decides will be there", "Yes");
  await next(pageB);
  await waitView(pageB, "learned");
  await answer(pageB, "Christmas lights now", "None");
  await answer(pageB, "Looked into it before", "Thought about it");
  await next(pageB);
  await waitView(pageB, "house", 30000);
  await skipPhotos(pageB);
  await next(pageB);
  await waitView(pageB, "book");
  const warning = (await pageB.getByTestId("distance-warning").innerText({ timeout: 10000 }).catch(() => "")).replace(/\s+/g, " ");
  check(
    "booking a far address next to another meeting warns with the straight-line distance",
    new RegExp(`\\d+ km in a straight line from the ${escape(timeLabel(Z))} meeting`).test(warning),
    warning,
  );
  await next(pageB);
  await waitView(pageB, "done", 30000);
  check("the warning doesn't block: the setter can still book", true);
  await sheet(pageB).getByRole("button", { name: "Done", exact: true }).click();
  await sheet(pageB).waitFor({ state: "detached", timeout: 15000 });
  // Round 3: a new person is usually saved only at Book, so the warning
  // works from the position on the sheet, before anything is saved. Here a
  // new person placed downtown, held next to the Mahogany meeting just
  // booked, is warned on Book; the time is let go and nothing is saved.
  await pageB.goto(`${base}/app/schedule`);
  await settle(pageB);
  await chooseEvening(pageB.locator("main"), testDay);
  await waitForState(pageB, V, "open");
  await slotButton(pageB, V).click();
  await waitView(pageB, "who");
  await pageB.fill("#sheet-first-name", `${TEST_LEAD} Far New`);
  for (const step of ["door", "learned", "address"]) {
    await next(pageB);
    await waitView(pageB, step);
  }
  // Next while it's still finding: the step keeps listening out of sight,
  // and the position that lands after counts on Book.
  await pageB.context().setGeolocation({ latitude: 51.0447, longitude: -114.0719, accuracy: 220 });
  await pageB.fill("#lead-address", "1 Far New Test Way SW (TEST)");
  await pageB.getByTestId("sheet-heading").click();
  await sheet(pageB).getByRole("button", { name: "Use where I'm standing" }).click();
  await pageB.getByTestId("position-status").getByText(/220 m so far/).waitFor({ timeout: 10000 }).catch(() => {});
  await next(pageB);
  await waitView(pageB, "house", 30000);
  await pageB.context().setGeolocation({ latitude: 51.0447, longitude: -114.0719, accuracy: 10 });
  await pageB.waitForFunction(() => !document.querySelector('[data-testid="sheet-address-step"]'), null, { timeout: 20000 }).catch(() => {});
  await next(pageB);
  await waitView(pageB, "book");
  const addressListed = await sheet(pageB).getByTestId("readiness").locator('li[data-items~="map_position"]').count();
  check("Next while Use where I'm standing is still finding: the position that lands after still counts, and Book doesn't ask for the address", addressListed === 0, `${addressListed} address rows`);
  const newWarning = (await pageB.getByTestId("distance-warning").innerText({ timeout: 10000 }).catch(() => "")).replace(/\s+/g, " ");
  const { count: farSaved } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("first_name", `${TEST_LEAD} Far New`);
  check(
    "a new person not saved yet is warned on Book too, from the position on the sheet",
    new RegExp(`\\d+ km in a straight line from the ${escape(timeLabel(W))} meeting`).test(newWarning) && farSaved === 0,
    `${newWarning}; ${farSaved} saved`,
  );
  await letGo(pageB);

  // ---------------------------------------------------------------- move, then cancel
  await pageB.goto(`${base}/app/schedule`);
  await settle(pageB);
  await chooseEvening(pageB.locator("main"), testDay);
  await pageA.goto(`${base}/app/leads/${lead1}`);
  await settle(pageA);
  await pageA.getByTestId("lead-meetings").getByRole("button", { name: "Move", exact: true }).click();
  await waitView(pageA, "times");
  await chooseEvening(sheet(pageA), testDay);
  await sheetSlot(pageA, V).click();
  await waitView(pageA, "move-confirm");
  check("Move opens the same sheet and holds the new time first, with its countdown", (await heldState(pageA)) === "yes" && (await secondsLeft(pageA)) !== null);
  await sheet(pageA).getByRole("button", { name: "Move", exact: true }).click();
  await waitView(pageA, "moved", 30000);
  const movedTo = await waitForState(pageB, V, "booked");
  const freed = await waitForState(pageB, Z, "open");
  check("a move frees the old time and books the new one on other phones", movedTo !== null && freed !== null);
  const { data: moves } = await admin.from("meetings").select("status, rebooked_as").eq("lead_id", lead1).order("created_at");
  check("the old meeting is marked moved and points to the new one", moves?.[0]?.status === "moved" && Boolean(moves?.[0]?.rebooked_as) && moves?.[1]?.status === "booked");
  await sheet(pageA).getByRole("button", { name: "Done", exact: true }).click();
  await sheet(pageA).waitFor({ state: "detached", timeout: 15000 });
  await pageA.getByText(/^Moved the meeting from /).waitFor({ timeout: 15000 }).catch(() => {});
  check("the timeline says the meeting moved", (await pageA.getByText(/^Moved the meeting from /).count()) === 1);

  await pageA.getByRole("button", { name: "Cancel booking" }).click();
  await pageA.getByRole("button", { name: "Yes, cancel it" }).click();
  await pageA.getByText(/^Cancelled the meeting on /).waitFor({ timeout: 20000 }).catch(() => {});
  const { data: afterCancel } = await admin.from("leads").select("status, follow_up_on").eq("id", lead1).single();
  check("cancelling sends the lead to Follow up for tomorrow and says so in the timeline", afterCancel?.status === "follow_up" && Boolean(afterCancel?.follow_up_on) && (await pageA.getByText(/^Cancelled the meeting on /).count()) === 1, JSON.stringify(afterCancel));
  const reopened = await waitForState(pageB, V, "open");
  check("the cancelled time opens again on other phones", reopened !== null);

  // ---------------------------------------------------------------- New lead: Save and book opens the same sheet
  await pageA.goto(`${base}/app/schedule/book?start=${encodeURIComponent(Y)}`);
  await pageA.waitForURL("**/app/schedule", { timeout: 20000 }).catch(() => {});
  check("the old booking page is gone: its address goes to Schedule", new URL(pageA.url()).pathname === "/app/schedule", pageA.url());
  // While knocking (2026-11-05), Save and book comes back to Session once
  // it's booked, with the saved line.
  const { data: aKnock, error: aKnockError } = await admin
    .from("knock_sessions")
    .insert({ user_id: people.a.id, neighbourhood: TEST_PLACE, started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (aKnockError) throw new Error(`A's knock session: ${aKnockError.message}`);
  await pageA.goto(`${base}/app/leads/new`);
  await settle(pageA);
  check("New lead has no Hold a time any more: booking happens in the sheet", (await pageA.getByRole("button", { name: "Hold a time" }).count()) === 0);
  // New lead's Cancel (the X at the top) leaves at once when nothing is
  // entered: while knocking, back to Session.
  await pageA.getByRole("button", { name: "Cancel", exact: true }).click();
  await pageA.waitForURL("**/app/session", { timeout: 20000 }).catch(() => {});
  check("while knocking, New lead's Cancel goes back to Session", new URL(pageA.url()).pathname === "/app/session", pageA.url());
  await pageA.goto(`${base}/app/leads/new`);
  await settle(pageA);
  await pageA.fill("#lead-address", "305 Brand New Test Way NW (TEST)");
  await pageA.keyboard.press("Escape");
  await pageA.getByRole("button", { name: "Use where I'm standing" }).click();
  await pageA.getByText(/Position saved from this phone at the door, accurate to about 10 m\./).waitFor({ timeout: 15000 });
  check("a brand-new street gets its map position from the phone at the door", true);
  await pageA.fill("#lead-first_name", TEST_LEAD);
  await pageA.fill("#lead-phone", "403 555 0188");
  for (const [legend, choice] of [["Owns the home", "Yes"], ["Wants a price", "Yes"], ["Everyone who decides will be there", "Yes"], ["Soffit colour (two for a split soffit)", "White"]]) {
    await pageA.locator("main fieldset").filter({ has: pageA.locator("legend", { hasText: new RegExp(`^${escape(legend)}$`) }) }).getByText(choice, { exact: true }).click();
  }
  await pageA.getByTestId("mark-rest").click();
  await pageA.getByRole("button", { name: "Save and book" }).click();
  await waitView(pageA, "times", 30000);
  check("Save and book saves the lead and opens the booking sheet on its page", /\/app\/leads\/[0-9a-f-]{36}$/.test(new URL(pageA.url()).pathname), pageA.url());
  const newLeadId = pageA.url().match(/leads\/([0-9a-f-]{36})/)?.[1];
  await chooseEvening(sheet(pageA), testDay);
  await sheetSlot(pageA, Y).click();
  await waitView(pageA, "house");
  check("it skips everything New lead already has, straight to the photos", true);
  const seenFromNewLead = await waitForState(pageB, Y, "held");
  check("other phones see a time held from Save and book", seenFromNewLead !== null);
  await skipPhotos(pageA);
  await next(pageA);
  await waitView(pageA, "book");
  await next(pageA);
  await waitView(pageA, "done", 30000);
  const { data: newLead } = await admin.from("leads").select("position_source, position_accuracy_m, status").eq("id", newLeadId).single();
  check("the new lead keeps its phone position, accuracy and booked status", newLead?.position_source === "device" && Number(newLead?.position_accuracy_m) === 10 && newLead?.status === "meeting_booked", JSON.stringify(newLead));
  const seenNewBooked = await waitForState(pageB, Y, "booked");
  check("and the time greys out on other phones", seenNewBooked !== null);
  await sheet(pageA).getByRole("button", { name: "Done", exact: true }).click();
  await pageA.waitForURL("**/app/session?added=*", { timeout: 20000 }).catch(() => {});
  await settle(pageA);
  // Session shows the saved line, then tidies ?added= out of the address so
  // a reload doesn't show it again.
  const savedRow = pageA.getByTestId("tap-status");
  check(
    "while knocking, Done after Save and book comes back to Session with the saved line and a link to the lead",
    new URL(pageA.url()).pathname === "/app/session" &&
      ((await pageA.getByTestId("lead-saved").innerText().catch(() => "")) ?? "").includes("Lead saved. On to the next door.") &&
      (await savedRow.getByRole("link").getAttribute("href").catch(() => null)) === `/app/leads/${newLeadId}`,
    pageA.url(),
  );
  const { data: knockLinked } = await admin.from("leads").select("knock_session_id").eq("id", newLeadId).single();
  check("and the lead links to the knock session", knockLinked?.knock_session_id === aKnock.id);
  await admin.from("knock_sessions").update({ ended_at: new Date().toISOString() }).eq("id", aKnock.id);
  await pageA.goto(`${base}/app/leads/${newLeadId}`);
  await settle(pageA);
  check("the position source shows on the lead", (await pageA.getByTestId("position-source").innerText()).includes("Placed from the phone at the door"));
  check("the lead page says how complete it is: 4 of 6 collected", (await pageA.getByTestId("completeness").innerText()).trim() === "4 of 6 collected", await pageA.getByTestId("completeness").innerText());
  await pageA.goto(`${base}/app`);
  await settle(pageA);
  const myBookings = (await pageA.getByTestId("how-mine-went").innerText()).replace(/\s+/g, " ");
  check("How mine went lists the setter's own bookings coming up, each saying how complete its lead is", /\d of 6 collected/.test(myBookings) && myBookings.includes("4 of 6 collected") && myBookings.includes("Coming up"), myBookings.slice(0, 200));

  // ---------------------------------------------------------------- My pay
  // A qualified booking on the throwaway test host, so Keenan's evenings stay
  // clear. The service role stands in for Keenan marking it Qualified.
  const past = new Date(Date.now() - 3 * 3600_000);
  const { data: payMeeting, error: payMeetingError } = await admin
    .from("meetings")
    .insert({
      lead_id: lead4,
      host_id: people.host.id,
      setter_id: people.a.id,
      booked_by: people.a.id,
      starts_at: past.toISOString(),
      ends_at: new Date(past.getTime() + settings.meeting_slot_minutes * 60_000).toISOString(),
      everyone_deciding_present: true,
    })
    .select("id")
    .single();
  if (payMeetingError) throw new Error(`pay meeting: ${payMeetingError.message}`);
  const qualified = await admin.rpc("set_meeting_outcome", { p_meeting_id: payMeeting.id, p_outcome: "qualified" });
  if (qualified.error) throw new Error(`outcome: ${qualified.error.message}`);
  const fee = Number(settings.booking_pay).toFixed(2);
  await pageA.getByRole("navigation", { name: "Tabs" }).filter({ visible: true }).getByRole("link", { name: "My pay", exact: true }).click();
  await pageA.waitForURL("**/app/pay", { timeout: 20000 });
  await settle(pageA);
  const totals = (await pageA.getByTestId("pay-totals").innerText()).replace(/\s+/g, " ");
  check("My pay shows owed now, pending install and paid", totals.includes(`Owed now $${fee}`) && totals.includes("Pending install $0.00") && totals.includes("Paid, all time $0.00"), totals);
  const lines = (await pageA.getByTestId("pay-lines").innerText()).replace(/\s+/g, " ");
  check("each booking shows how it went and its fee", lines.includes(`Qualified $${fee} owed`) && lines.includes("Cancelled No fee") && lines.includes("Upcoming Fee if Qualified"), lines.slice(0, 200));
  check("My pay never shows anyone else's bookings", !lines.includes("9 Far Test Way"));
  await checkTapTargets(pageA, "My pay");
  await pageA.screenshot({ path: `${out}/m3-my-pay.png`, fullPage: true });

  // ---------------------------------------------------------------- Keenan's screens, view only
  const ownerContext = await browser.newContext(iphone);
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  ownerPage = await ownerContext.newPage();
  const op = ownerPage;
  const footprint = async () =>
    JSON.stringify(
      await Promise.all([
        admin.from("settings").select("*").eq("id", 1).single().then((r) => r.data),
        admin.from("earnings").select("id, status, paid_at").eq("profile_id", people.a.id).then((r) => r.data),
        admin.from("meetings").select("id, status, starts_at").in("lead_id", [lead1, lead3, lead4, newLeadId]).order("id").then((r) => r.data),
        admin.from("time_blocks").select("id").is("removed_at", null).then((r) => r.data),
        admin.from("day_schedules").select("id, day, meeting_start, meeting_slot_minutes, meeting_slot_count").is("removed_at", null).order("id").then((r) => r.data),
      ]),
    );
  const before = await footprint();
  await op.goto(`${base}/app`);
  await settle(op);
  const ownerOrder = await op.evaluate(() =>
    [...document.querySelectorAll("main h1, main [data-testid]")]
      .map((el) => (el.tagName === "H1" ? "h1" : el.getAttribute("data-testid")))
      .filter((id) => ["h1", "home-start-knocking", "home-session-bar", "home-meetings", "out-now"].includes(id)),
  );
  check(
    "Keenan's Home: the date, then Start knocking or his live session, then Meetings, then who's out knocking now",
    ownerOrder[0] === "h1" && ["home-start-knocking", "home-session-bar"].includes(ownerOrder[1]) && ownerOrder[2] === "home-meetings" && ownerOrder[3] === "out-now",
    ownerOrder.join(", "),
  );
  await op.goto(`${base}/app/schedule?day=${testDay}`);
  await settle(op);
  const cards = op.getByTestId("meeting-card");
  const cardText = (await cards.allInnerTexts()).join(" | ").replace(/\s+/g, " ");
  check("Keenan's Schedule shows the evening's bookings in full", cardText.includes("TEST Setter B's lead") && cardText.includes("Navigate") && cardText.includes("Photos skipped: Homeowner said no"), cardText.slice(0, 200));
  check("it shows how a map position was set", cardText.includes("Placed from the phone at the door, accurate to about 10 m"));
  check("moved and cancelled bookings stay listed, muted", (await op.locator('[data-testid="meeting-card"][data-status="cancelled"]').count()) >= 1 && (await op.locator('[data-testid="meeting-card"][data-status="moved"]').count()) >= 1);
  const tools = op.getByTestId("owner-schedule-tools");
  check("Keenan's Schedule header has Block time and the pencil", (await tools.getByRole("button", { name: "Block time" }).count()) === 1 && (await tools.getByRole("button", { name: "Change this evening's times" }).count()) === 1);
  check("the blocked-times column is gone", (await op.getByRole("button", { name: "Block the whole evening" }).count()) === 0);
  await op.screenshot({ path: `${out}/m3-owner-schedule.png`, fullPage: true });
  await tools.getByRole("button", { name: "Block time" }).click();
  const blockDialog = op.getByTestId("block-time");
  await blockDialog.waitFor({ timeout: 10000 });
  const blockText = (await blockDialog.innerText()).replace(/\s+/g, " ");
  check("Block time offers the whole evening or one free time, not a booked one", blockText.includes("The whole evening") && blockText.includes(timeLabel(Z)) && !blockText.includes(timeLabel(X)), blockText.slice(0, 160));
  await blockDialog.getByRole("button", { name: "Cancel" }).click();
  await tools.getByRole("button", { name: "Change this evening's times" }).click();
  const dayDialog = op.getByTestId("day-times");
  await dayDialog.waitFor({ timeout: 10000 });
  await dayDialog.getByRole("button", { name: `More: Meeting length` }).click();
  const warned = await op.getByTestId("day-times-warning").innerText({ timeout: 10000 }).catch(() => "");
  check("changing the evening's times warns, before saving, about bookings that won't line up", /won.t line up with the new times/.test(warned), warned.replace(/\s+/g, " ").slice(0, 160));
  check("it offers Just this day, and All days on a usual meeting day", (await dayDialog.getByRole("button", { name: "Just this day" }).count()) === 1 && (await dayDialog.getByRole("button", { name: "All days" }).count()) === 1);
  await op.keyboard.press("Escape");
  await dayDialog.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  const xMeeting = sheetMeeting?.id;
  await slotButton(op, X).click();
  await op.waitForTimeout(1200);
  const inView = await op.locator(`#meeting-${xMeeting}`).evaluate((card) => {
    const box = card.getBoundingClientRect();
    return box.top >= 0 && box.top < window.innerHeight;
  }).catch(() => false);
  check("tapping a booked time takes Keenan to that booking's card", inView);
  await op.goto(`${base}/app/admin/pay`);
  await settle(op);
  const payCard = op.getByTestId("pay-setter").filter({ hasText: "TEST Setter A" });
  check("Pay in Admin shows the setter's owed line, ready to tick", (await payCard.count()) === 1 && (await payCard.getByRole("checkbox").count()) === 1 && (await payCard.innerText()).includes(`Owed now $${fee}`));
  await op.goto(`${base}/app/leads/${lead4}`);
  await settle(op);
  const outcomeForm = op.getByTestId("outcome-form");
  await outcomeForm.locator("fieldset").first().getByText("Not qualified", { exact: true }).click();
  await outcomeForm.getByRole("button", { name: "Save outcome" }).click();
  await outcomeForm.getByRole("alert").waitFor({ timeout: 20000 });
  check("an outcome form missing its reason is refused before anything saves", (await outcomeForm.getByRole("alert").innerText()).includes("Pick a reason"));
  await ownerSession.close();
  ownerSession = null;
  check("nothing of Keenan's changed: settings, pay, meetings and blocks", (await footprint()) === before);
  note("Keenan's own outcome buttons, Mark paid, time blocks and booking a setter's lead are walked up to the save only, because the owner session is view only; the database tests prove them with the service role standing in.");

  // ---------------------------------------------------------------- Book's answer lost to the signal (2026-11-03)
  // The booking may go through while its answer never reaches the phone. The
  // sheet asks whether the lead now has the booking before it says anything.
  // V and Z are free again by now: the move freed Z, and the cancel freed V.
  const leadD = await readyLead(people.a, "306 Drop Test Way NW (TEST)");
  const leadE = await readyLead(people.a, "307 Drop Test Way NW (TEST)");
  const leadF = await readyLead(people.a, "308 Drop Test Way NW (TEST)");
  const liveMeetings = async (leadId) =>
    (await admin.from("meetings").select("id").eq("lead_id", leadId).in("status", ["booked", "confirmed"])).data ?? [];
  const sheetError = async (startsWith) => {
    await pageA
      .waitForFunction((text) => document.querySelector('[data-testid="sheet-error"]')?.textContent?.trim().startsWith(text), startsWith, { timeout: 20000 })
      .catch(() => {});
    return (await sheet(pageA).getByTestId("sheet-error").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  };
  async function toBook(leadId, at) {
    await pageA.goto(`${base}/app/leads/${leadId}`);
    await settle(pageA);
    await pageA.getByRole("button", { name: "Book a meeting" }).click();
    await waitView(pageA, "times");
    await chooseEvening(sheet(pageA), testDay);
    await sheetSlot(pageA, at).click();
    await waitView(pageA, "door");
    await answer(pageA, "Everyone who decides will be there", "Yes");
    await next(pageA);
    await waitView(pageA, "learned");
    await sheet(pageA).getByTestId("mark-rest").click();
    await next(pageA);
    await waitView(pageA, "house", 30000);
    await skipPhotos(pageA);
    await next(pageA);
    await waitView(pageA, "book");
  }
  async function closeDone() {
    await sheet(pageA).getByRole("button", { name: "Done", exact: true }).click();
    await sheet(pageA).waitFor({ state: "detached", timeout: 15000 });
  }

  // 1. The server booked, and the answer dropped on its way back.
  await toBook(leadD, V);
  const lossD = dropping(pageA, leadD);
  lossD.drop.book = "after";
  await lossD.start();
  await next(pageA);
  await waitView(pageA, "done", 30000);
  await lossD.stop();
  check(
    "Book's answer dropped after the server booked: the sheet finds the booking and shows the done screen, no error",
    lossD.seen.book === 1 && (await liveMeetings(leadD)).length === 1 && (await sheet(pageA).getByTestId("sheet-error").count()) === 0,
    `${lossD.seen.book} dropped`,
  );
  await closeDone();

  // 2. Book dropped on the phone, before the server got it: nothing booked.
  await toBook(leadE, Z);
  const lossE = dropping(pageA, leadE);
  lossE.drop.book = "before";
  await lossE.start();
  await next(pageA);
  const notYet = await sheetError("Not booked");
  check(
    "Book dropped before it reached the server: it says not booked yet, the time stays held, and nothing is booked",
    notYet === "Not booked yet. Check your signal and tap Book again." && (await heldState(pageA)) === "yes" && (await liveMeetings(leadE)).length === 0,
    notYet,
  );

  // 3. Book again: the server books, the answer drops, and the check can't get through either.
  lossE.drop.book = "after";
  lossE.drop.check = true;
  await next(pageA);
  const cantTell = await sheetError("No signal");
  check(
    "with no signal for the check either, it says it can't tell yet and that Book again can't book twice",
    cantTell === "No signal to check whether it booked. Tap Book again once you have signal: it can't book twice." && lossE.seen.check >= 1 && (await liveMeetings(leadE)).length === 1,
    cantTell,
  );

  // 4. The signal comes back: the hold has gone to the booking, and the sheet says booked by itself.
  await lossE.stop();
  await pageA.evaluate(() => window.dispatchEvent(new Event("online")));
  await waitView(pageA, "done", 30000);
  check("when the signal comes back, the sheet finds its hold went to this booking and shows the done screen by itself", (await liveMeetings(leadE)).length === 1);
  await closeDone();

  // 5. Book again after a booking whose answer never came: refused as already booked, checked, done.
  await admin.from("meetings").delete().eq("lead_id", leadE);
  const freedZ = await waitForState(pageB, Z, "open");
  check("the test frees Z again for the last case", freedZ !== null);
  await toBook(leadF, Z);
  const lossF = dropping(pageA, leadF);
  lossF.drop.book = "after";
  lossF.drop.check = true;
  lossF.drop.sync = true;
  await lossF.start();
  await next(pageA);
  await sheetError("No signal");
  lossF.drop.book = null;
  lossF.drop.check = false;
  await next(pageA);
  await waitView(pageA, "done", 30000);
  await lossF.stop();
  check(
    "Book again after an unanswered booking is refused as already booked, then checked and shown as booked: one booking only",
    (await liveMeetings(leadF)).length === 1 && lossF.seen.book === 2,
    `${lossF.seen.book} Book taps`,
  );
  await closeDone();

  // ---------------------------------------------------------------- a new person's first save, its answer lost (2026-11-04)
  // The server makes the lead and the answer never reaches the phone. Next
  // again sends the same save key and gets back that lead, never a copy.
  const ONCE_ADDRESS = "309 Once Test Way NW (TEST)";
  const onceLeads = async () =>
    (await admin.from("leads").select("id, save_key, status").eq("created_by", people.a.id).eq("address_line", ONCE_ADDRESS)).data ?? [];
  await pageA.goto(`${base}/app/schedule`);
  await settle(pageA);
  await chooseEvening(pageA.locator("main"), testDay);
  let freeAt = null;
  for (let attempt = 0; attempt < 20 && !freeAt; attempt += 1) {
    freeAt = await pageA.evaluate(
      () =>
        [...document.querySelectorAll('main [data-testid="time-picker"] [data-time]')]
          .find((element) => element.getAttribute("data-state") === "open")
          ?.getAttribute("data-time") ?? null,
    );
    if (!freeAt) await pageA.waitForTimeout(500);
  }
  if (!freeAt) throw new Error("no open time on the test evening for the first-save case");
  await slotButton(pageA, freeAt).click();
  await waitView(pageA, "who");
  await pageA.fill("#sheet-first-name", TEST_LEAD);
  await pageA.fill("#sheet-last-name", "Once");
  await next(pageA);
  await waitView(pageA, "door");
  await answer(pageA, "Owns the home", "Yes");
  await answer(pageA, "Wants a price", "Yes");
  await answer(pageA, "Everyone who decides will be there", "Yes");
  await next(pageA);
  await waitView(pageA, "learned");
  await sheet(pageA).getByTestId("mark-rest").click();
  await next(pageA);
  await waitView(pageA, "address", 30000);
  await pageA.fill("#lead-address", ONCE_ADDRESS);
  await pageA.getByTestId("sheet-heading").click();
  await sheet(pageA).getByRole("button", { name: "Use where I'm standing" }).click();
  await sheet(pageA).getByText(/accurate to about 10 m/).first().waitFor({ timeout: 15000 });
  await answer(pageA, "Soffit colour", "Not sure");
  await next(pageA);
  await waitView(pageA, "house", 30000);
  await skipPhotos(pageA);
  await next(pageA);
  await waitView(pageA, "book");
  // With the phone asked last, a new person's first save is Book's.
  await pageA.fill("#sheet-phone", "403 555 0168");
  const firstSave = { drop: true, seen: 0 };
  const stopFirstSave = await interceptFetches(pageA, (request, stage) => {
    if (request.method !== "POST" || !request.body.startsWith("[null,") || !request.body.includes(`"address_line":"${ONCE_ADDRESS}"`)) return null;
    if (stage === "request") firstSave.seen += 1;
    return firstSave.drop && stage === "response" ? "drop" : null;
  });
  await next(pageA);
  const lostSave = await sheetError("That's taking too long");
  const madeOnce = await onceLeads();
  check(
    "a new person's first save, at Book, whose answer is lost: the server made the lead once, and the sheet stays to try again",
    lostSave.startsWith("That's taking too long") && (await viewOf(pageA)) === "book" && madeOnce.length === 1 && Boolean(madeOnce[0]?.save_key) && firstSave.seen === 1,
    `${madeOnce.length} lead(s); ${lostSave}`,
  );
  firstSave.drop = false;
  await next(pageA);
  await waitView(pageA, "done", 30000);
  await stopFirstSave();
  const keptOnce = await onceLeads();
  check(
    "Book again sends the same save key and gets back that lead: one lead, and it books",
    firstSave.seen === 2 && keptOnce.length === 1 && keptOnce[0].id === madeOnce[0]?.id && keptOnce[0].status === "meeting_booked",
    `${keptOnce.length} lead(s), ${firstSave.seen} saves`,
  );
  await sheet(pageA).getByRole("button", { name: "Done", exact: true }).click();
  await sheet(pageA).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)} at A ${pageA.url()} / B ${pageB.url()}${ownerPage ? ` / owner ${ownerPage.url()}` : ""}`);
  await pageA.screenshot({ path: `${out}/m3-failure-a.png`, fullPage: true }).catch(() => {});
  await pageB.screenshot({ path: `${out}/m3-failure-b.png`, fullPage: true }).catch(() => {});
  if (ownerPage) await ownerPage.screenshot({ path: `${out}/m3-failure-owner.png`, fullPage: true }).catch(() => {});
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  await removeEverything();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const leftoverUsers = (list?.users ?? []).filter((u) => (u.email ?? "").startsWith("m3-live-"));
  const { count: leftoverLeads } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("first_name", TEST_LEAD);
  const { count: leftoverHolds } = await admin.from("slot_holds").select("id", { count: "exact", head: true }).is("released_at", null);
  check("the throwaway setters, their leads, holds, meetings and pay are gone", leftoverUsers.length === 0 && leftoverLeads === 0, `${leftoverUsers.length} accounts, ${leftoverLeads} test leads, ${leftoverHolds} live holds`);
  results.push(`accounts remaining: ${JSON.stringify((list?.users ?? []).map((u) => u.email))}`);
  await browser.close();
}

console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
