// Live walk-through of M3 and M3.5 on phone-sized screens against a running
// build. No double booking is a hard rule (Keenan, 2026-11-01), and the
// booking sheet is the only way to book (Keenan, 2026-11-02). It starts with
// two throwaway setters in two browsers: the second sees the first one's hold
// appear, cannot pick that time, and sees it open again when the first lets
// go. Then the two race for the same time through the booking sheet, several
// rounds, and exactly one gets it each time. Then the sheet end to end with a
// new person (a reload in the middle, a hold that lapses and is held again,
// photos, Book, the done screen), an existing lead that skips what it has, a
// lead that isn't ready, the distance warning, Move and Cancel, Save and book
// from New lead with the phone's GPS, My pay, and Keenan's screens through
// the view-only owner session.
//
// The holds and bookings land on Keenan's real board, so the run uses only
// the last evening of the booking window, under test names, and removes
// everything at the end. My pay's qualified booking sits on a throwaway test
// host of its own, so nothing lands on Keenan's Tonight.
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import sharp from "sharp";
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
    const box = document.querySelector('[data-testid="booking-sheet"] .overflow-y-auto');
    return box ? box.scrollHeight > box.clientHeight + 1 : null;
  });
async function letGo(page) {
  await sheet(page).getByRole("button", { name: "Let go", exact: true }).click();
  await page.getByTestId("sheet-let-go").getByRole("button", { name: "Let go", exact: true }).click();
  await sheet(page).waitFor({ state: "detached", timeout: 20000 });
}
// Takes the three guided photos on the Photos screen and waits for the uploads.
async function takePhotos(page) {
  for (const slot of ["front", "left_corner", "right_corner"]) {
    await page.setInputFiles(`[data-testid="booking-sheet"] [data-testid="slot-input-${slot}"]`, fixture);
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => !document.querySelector('[data-testid="booking-sheet"]')?.textContent?.includes("Uploading"), null, { timeout: 30000 });
}
async function skipPhotos(page) {
  await sheet(page).getByRole("button", { name: "Can't get the photos?" }).click();
  await answer(page, "Why can't you get them?", "Homeowner said no");
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
const contextA = await browser.newContext({ ...iphone, geolocation: { latitude: 51.0447, longitude: -114.0719, accuracy: 10 }, permissions: ["geolocation"] });
const contextB = await browser.newContext(iphone);
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
    person.client = createClient(url, anonKey, noSession);
    const signedIn = await person.client.auth.signInWithPassword({ email: person.email, password: person.password });
    if (signedIn.error) throw new Error(`sign in ${key}: ${signedIn.error.message}`);
  }
  await admin.from("profiles").update({ hosts_meetings: true }).eq("id", people.host.id);
  const { data: settings } = await admin
    .from("settings")
    .select("booking_pay, distance_warning_km, booking_window_days, meeting_slot_minutes")
    .eq("id", 1)
    .single();
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
  const homeOrder = await pageA.evaluate(() => [...document.querySelectorAll("main [data-testid]")].map((el) => el.getAttribute("data-testid")).filter((id) => ["tonight-times", "my-bookings"].includes(id)));
  const knockY = await pageA.getByRole("button", { name: /Start knocking/ }).boundingBox().catch(() => null);
  const timesY = await pageA.getByTestId("tonight-times").boundingBox();
  const bookingsY = await pageA.getByTestId("my-bookings").boundingBox();
  const dueY = await pageA.getByRole("heading", { name: "Follow-ups due" }).boundingBox().catch(() => null);
  check(
    "Home runs top to bottom: tonight's open times, my bookings, the knock session, follow-ups due",
    JSON.stringify(homeOrder) === JSON.stringify(["tonight-times", "my-bookings"]) && timesY && bookingsY && knockY && dueY && timesY.y < bookingsY.y && bookingsY.y < knockY.y && knockY.y < dueY.y,
  );
  const tonight = (byDay.get(today) ?? []).filter((row) => row.state === "open");
  const homeDay = (await pageA.getByTestId("picker-day").first().innerText()).trim();
  if (tonight.length > 0) {
    check("Home opens on tonight's open times", homeDay === "Tonight", homeDay);
  } else {
    const fullTitle = await pageA.getByTestId("tonight-times").getByRole("heading", { name: "Nothing left tonight" }).count();
    check("with tonight full, Home says so and shows the next evening with an opening", fullTitle === 1 && homeDay !== "Tonight", homeDay);
  }
  const homeSlot = await pageA.locator('[data-testid="tonight-times"] [data-time]').first().getAttribute("aria-label").catch(() => null);
  check("tonight's times are big and readable: each is a tap target with the time", Boolean(homeSlot), homeSlot ?? "none");
  await checkTapTargets(pageA, "the setter's Home");
  await pageA.screenshot({ path: `${out}/m3-setter-home.png`, fullPage: true });

  await pageA.getByRole("navigation", { name: "Tabs" }).filter({ visible: true }).getByRole("link", { name: "Schedule", exact: true }).click();
  await pageA.waitForURL("**/app/schedule", { timeout: 20000 });
  await settle(pageA);
  const scheduleDay = (await pageA.getByTestId("picker-day").innerText()).trim();
  check("Schedule opens on the same evening as Home", scheduleDay === homeDay, `${scheduleDay} / ${homeDay}`);
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
  check("the sheet starts straight into At the door, for a new person", (await sheet(pageA).getByRole("listitem").filter({ hasText: "At the door" }).getAttribute("aria-current")) === "step");
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
  check("Let go asks first, then closes the sheet and returns to the schedule", pageA.url().endsWith("/app/schedule") && (await sheet(pageA).count()) === 0);
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

  // ---------------------------------------------------------------- the sheet end to end, with a new person
  await waitForState(pageA, X, "open");
  await slotButton(pageA, X).click();
  await waitView(pageA, "who");
  const scrolls = {};
  scrolls.who = await sheetScrolls(pageA);
  await checkTapTargets(pageA, "the sheet's first screen");
  const bar = await sheet(pageA).getByTestId("sheet-next").boundingBox();
  const viewport = pageA.viewportSize();
  check("Next is the primary button at the bottom right, in thumb reach", bar !== null && bar.x + bar.width / 2 > viewport.width / 2 && bar.y > viewport.height * 0.8, bar ? `${Math.round(bar.x)},${Math.round(bar.y)}` : "none");
  await sheet(pageA).getByRole("button", { name: "What to talk about" }).click();
  const noteText = (await pageA.getByTestId("sheet-note").innerText().catch(() => "")).trim();
  check("the ? shows what to talk about at the door, from Keenan's step note", /What to talk about: At the door/.test(noteText) && noteText.length > 60, noteText.slice(0, 80));
  await pageA.getByTestId("sheet-note").getByRole("button", { name: "Close", exact: true }).click();
  await pageA.fill("#sheet-first-name", TEST_LEAD);
  await pageA.fill("#sheet-last-name", "Sheet");
  await pageA.fill("#sheet-phone", "403 555 0166");
  await pageA.waitForTimeout(300);
  await pageA.reload();
  await settle(pageA);
  await waitView(pageA, "who").catch(() => {});
  check(
    "after a reload, the sheet comes back with the same time still held and what was typed",
    (await viewOf(pageA)) === "who" && (await pageA.inputValue("#sheet-first-name").catch(() => "")) === TEST_LEAD && (await heldState(pageA)) === "yes",
  );
  await next(pageA);
  await waitView(pageA, "find1");
  scrolls.find1 = await sheetScrolls(pageA);
  await answer(pageA, "Owns the home", "Yes");
  await answer(pageA, "Wants a price", "Yes");
  await answer(pageA, "Christmas lights now", "Hires someone");
  await checkTapTargets(pageA, "Find out");
  await next(pageA);
  await waitView(pageA, "find2");
  scrolls.find2 = await sheetScrolls(pageA);
  await answer(pageA, "Looked into it before", "Got quotes");
  await answer(pageA, "Which areas", "Front and sides");
  await answer(pageA, "Timing", "Before Christmas");
  await next(pageA);
  await waitView(pageA, "everyone");
  scrolls.everyone = await sheetScrolls(pageA);
  await sheet(pageA).getByTestId("sheet-everyone").click();
  await next(pageA);
  await waitView(pageA, "address");
  check("After the door starts with the address", (await sheet(pageA).getByRole("listitem").filter({ hasText: "After the door" }).getAttribute("aria-current")) === "step");
  scrolls.address = await sheetScrolls(pageA);
  await pageA.fill("#lead-address", "306 Sheet Test Way NW (TEST)");
  await pageA.getByTestId("sheet-heading").click();
  await sheet(pageA).getByRole("button", { name: "Use where I'm standing" }).click();
  await sheet(pageA).getByText(/accurate to about 10 m/).first().waitFor({ timeout: 15000 });
  await next(pageA);
  await waitView(pageA, "soffit");
  scrolls.soffit = await sheetScrolls(pageA);
  await answer(pageA, "Soffit colour", "White");
  await next(pageA);
  await waitView(pageA, "photos");
  scrolls.photos = await sheetScrolls(pageA);
  // The hold lapses (as when a phone sleeps past the grace period): the sheet
  // says so and offers to hold it again while it's still free.
  await admin.from("slot_holds").update({ released_at: new Date().toISOString(), release_reason: "lapsed" }).eq("holder_id", people.a.id).is("released_at", null);
  await pageA.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const lost = await pageA.getByTestId("sheet-hold-lost").innerText({ timeout: 15000 }).catch(() => "");
  check("when the hold lapses, the sheet says so and that the time is still free", lost.includes("let go") && lost.includes("still free") && (await heldState(pageA)) === "no", lost.replace(/\s+/g, " "));
  await sheet(pageA).getByRole("button", { name: "Hold it again" }).click();
  await pageA.getByTestId("sheet-hold-lost").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  check("Hold it again takes the time back, and the sheet carries on", (await heldState(pageA)) === "yes" && (await viewOf(pageA)) === "photos");
  await takePhotos(pageA);
  scrolls.photosTaken = await sheetScrolls(pageA);
  await checkTapTargets(pageA, "Photos");
  await next(pageA);
  await waitView(pageA, "book");
  scrolls.book = await sheetScrolls(pageA);
  check("no screen of At the door, After the door or Book scrolls on a phone", Object.values(scrolls).every((value) => value === false), JSON.stringify(scrolls));
  const ticks = await sheet(pageA).getByTestId("readiness").locator("li").evaluateAll((items) => items.map((item) => item.getAttribute("data-ok")));
  check("Book lists every Before you book item, all ticked", ticks.length === 7 && ticks.every((tick) => tick === "yes"), ticks.join(","));
  const bookLabel = (await pageA.getByTestId("sheet-next").innerText()).trim();
  check("the Book button says which time it books", bookLabel === `Book ${timeLabel(X)}`, bookLabel);
  await checkTapTargets(pageA, "Book");
  await pageA.screenshot({ path: `${out}/m3-sheet-book.png` });
  await next(pageA);
  await waitView(pageA, "done", 30000);
  const doneHeading = (await pageA.getByTestId("sheet-heading").innerText()).trim();
  const expectedDone = testDay === today ? `Booked for ${timeLabel(X)} tonight.` : `Booked for ${dayChip(testDay)} at ${timeLabel(X)}`;
  check("then a done screen says when it's booked for, in one sentence", doneHeading === expectedDone, doneHeading);
  check("the chip at the top says booked", (await heldState(pageA)) === "booked");
  await pageA.screenshot({ path: `${out}/m3-sheet-done.png` });
  const seenBooked = await waitForState(pageB, X, "booked");
  check("the other setter sees the time grey out, booked", seenBooked !== null && seenBooked <= 8000, seenBooked === null ? "never" : `${(seenBooked / 1000).toFixed(1)} s`);
  const bookedLabel = (await slotButton(pageB, X).getAttribute("aria-label")) ?? "";
  check("a booked time shows who booked it, and can't be tapped", bookedLabel.includes("TEST Setter A") && (await slotButton(pageB, X).isDisabled()), bookedLabel);
  const { data: sheetLead } = await admin
    .from("leads")
    .select("id, status, looked_into_before, christmas_lights_now, position_source, position_accuracy_m, phone")
    .eq("address_line", "306 Sheet Test Way NW (TEST)")
    .single();
  check(
    "the sheet saved the person as a lead with every answer, the phone's position and Booked",
    sheetLead?.status === "meeting_booked" && sheetLead?.looked_into_before === "got_quotes" && sheetLead?.christmas_lights_now === "hires" && sheetLead?.position_source === "device" && Number(sheetLead?.position_accuracy_m) === 10,
    JSON.stringify(sheetLead),
  );
  const { data: sheetMeeting } = await admin.from("meetings").select("id, setter_id, everyone_deciding_present, photos_skipped, starts_at").eq("lead_id", sheetLead?.id).eq("status", "booked").single();
  const { data: sheetPhotos } = await admin.from("lead_photos").select("slot").eq("lead_id", sheetLead?.id);
  check(
    "the meeting is booked for the setter, with everyone who decides confirmed and the three photos in their slots",
    sheetMeeting?.setter_id === people.a.id && sheetMeeting?.everyone_deciding_present === true && sheetMeeting?.photos_skipped === null && new Date(sheetMeeting?.starts_at).toISOString() === X && (sheetPhotos ?? []).map((photo) => photo.slot).sort().join(",") === "front,left_corner,right_corner",
  );
  await sheet(pageA).getByRole("button", { name: "Done", exact: true }).click();
  await sheet(pageA).waitFor({ state: "detached", timeout: 15000 });

  // ---------------------------------------------------------------- an existing lead skips what it already has
  await waitForState(pageA, Z, "open");
  await slotButton(pageA, Z).click();
  await waitView(pageA, "who");
  await sheet(pageA).getByRole("button", { name: "Existing lead instead" }).click();
  await waitView(pageA, "existing");
  const listed = (await sheet(pageA).getByRole("list", { name: "Your leads" }).innerText().catch(() => "")).replace(/\s+/g, " ");
  check("Existing lead instead lists the setter's New and Follow up leads, not booked ones or other setters'", listed.includes("301 Hold Test Way") && !listed.includes("306 Sheet Test Way") && !listed.includes("9 Far Test Way"), listed.slice(0, 160));
  await sheet(pageA).getByRole("button", { name: /301 Hold Test Way NW/ }).click();
  await waitView(pageA, "find1");
  check("picking an existing lead skips the name and phone it already has", true);
  await answer(pageA, "Christmas lights now", "Does it themselves");
  await next(pageA);
  await waitView(pageA, "find2");
  await answer(pageA, "Looked into it before", "New to them");
  await answer(pageA, "Which areas", "Full wrap");
  await answer(pageA, "Timing", "No rush");
  await next(pageA);
  await waitView(pageA, "everyone");
  await sheet(pageA).getByTestId("sheet-everyone").click();
  await next(pageA);
  await waitView(pageA, "photos");
  check("and skips the address and soffit it already has", true);
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
  await sheet(pageA).getByRole("button", { name: "Done", exact: true }).click();
  await sheet(pageA).waitFor({ state: "detached", timeout: 15000 });

  // ---------------------------------------------------------------- a lead that isn't ready, booked from its page
  await pageA.goto(`${base}/app/leads/${lead2}`);
  await settle(pageA);
  await pageA.getByRole("button", { name: "Book a meeting" }).click();
  await waitView(pageA, "times");
  await chooseEvening(sheet(pageA), testDay);
  await sheetSlot(pageA, W).click();
  await waitView(pageA, "who");
  check("the lead page's Book a meeting opens the same sheet, prefilled, with the time held", (await heldState(pageA)) === "yes" && (await pageA.inputValue("#sheet-first-name")) === TEST_LEAD);
  for (let step = 0; step < 8 && (await viewOf(pageA)) !== "book"; step += 1) {
    await next(pageA);
    await pageA.waitForTimeout(700);
  }
  const missing = await sheet(pageA).getByTestId("readiness").locator('li[data-ok="no"]').count();
  const blocked = pageA.getByTestId("sheet-next");
  check("a lead that isn't ready lists every missing item and can't be booked", missing === 7 && (await blocked.isDisabled()) && (await blocked.innerText()).trim() === "Fix 7 first", `${missing} missing`);
  await sheet(pageA).getByRole("button", { name: "Fix: Phone number saved" }).click();
  await waitView(pageA, "who");
  check("each missing item's Fix goes to the screen that asks for it, with the time still held", (await heldState(pageA)) === "yes");
  await letGo(pageA);
  const reopenedW = await waitForState(pageB, W, "open");
  check("letting go from the lead page frees the time on other phones", reopenedW !== null);

  // ---------------------------------------------------------------- the distance warning
  await pageB.goto(`${base}/app/leads/${lead3}`);
  await settle(pageB);
  await pageB.getByRole("button", { name: "Book a meeting" }).click();
  await waitView(pageB, "times");
  await chooseEvening(sheet(pageB), testDay);
  await sheetSlot(pageB, W).click();
  await waitView(pageB, "find1");
  await answer(pageB, "Christmas lights now", "None");
  await next(pageB);
  await waitView(pageB, "find2");
  await answer(pageB, "Looked into it before", "Thought about it");
  await answer(pageB, "Which areas", "Front only");
  await answer(pageB, "Timing", "New year");
  await next(pageB);
  await waitView(pageB, "everyone");
  await sheet(pageB).getByTestId("sheet-everyone").click();
  await next(pageB);
  await waitView(pageB, "photos");
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
  check("Move opens the same sheet and holds the new time first", (await heldState(pageA)) === "yes");
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
  await pageA.goto(`${base}/app/leads/new`);
  await settle(pageA);
  check("New lead has no Hold a time any more: booking happens in the sheet", (await pageA.getByRole("button", { name: "Hold a time" }).count()) === 0);
  await pageA.fill("#lead-address", "305 Brand New Test Way NW (TEST)");
  await pageA.keyboard.press("Escape");
  await pageA.getByRole("button", { name: "Use where I'm standing" }).click();
  await pageA.getByText(/Map position from this phone at the door, accurate to about 10 m\./).waitFor({ timeout: 15000 });
  check("a brand-new street gets its map position from the phone at the door", true);
  await pageA.fill("#lead-first_name", TEST_LEAD);
  await pageA.fill("#lead-phone", "403 555 0188");
  for (const [legend, choice] of [["Owns the home", "Yes"], ["Wants a price", "Yes"], ["Soffit colour", "White"]]) {
    await pageA.locator("main fieldset").filter({ has: pageA.locator("legend", { hasText: new RegExp(`^${legend}$`) }) }).getByText(choice, { exact: true }).click();
  }
  await pageA.getByRole("button", { name: "Save and book" }).click();
  await waitView(pageA, "times", 30000);
  check("Save and book saves the lead and opens the booking sheet on its page", /\/app\/leads\/[0-9a-f-]{36}$/.test(new URL(pageA.url()).pathname), pageA.url());
  const newLeadId = pageA.url().match(/leads\/([0-9a-f-]{36})/)?.[1];
  await chooseEvening(sheet(pageA), testDay);
  await sheetSlot(pageA, Y).click();
  await waitView(pageA, "find1");
  check("it skips what New lead already has", true);
  const seenFromNewLead = await waitForState(pageB, Y, "held");
  check("other phones see a time held from Save and book", seenFromNewLead !== null);
  await answer(pageA, "Christmas lights now", "None");
  await next(pageA);
  await waitView(pageA, "find2");
  await answer(pageA, "Looked into it before", "New to them");
  await answer(pageA, "Which areas", "Not sure");
  await answer(pageA, "Timing", "No rush");
  await next(pageA);
  await waitView(pageA, "everyone");
  await sheet(pageA).getByTestId("sheet-everyone").click();
  await next(pageA);
  await waitView(pageA, "photos");
  await skipPhotos(pageA);
  await next(pageA);
  await waitView(pageA, "book");
  await next(pageA);
  await waitView(pageA, "done", 30000);
  const { data: newLead } = await admin.from("leads").select("position_source, position_accuracy_m, status").eq("id", newLeadId).single();
  check("the new lead keeps its phone position, accuracy and booked status", newLead?.position_source === "device" && Number(newLead?.position_accuracy_m) === 10 && newLead?.status === "meeting_booked", JSON.stringify(newLead));
  const seenNewBooked = await waitForState(pageB, Y, "booked");
  check("and the time greys out on other phones", seenNewBooked !== null);
  await sheet(pageA).getByRole("button", { name: "Open the lead" }).click();
  await sheet(pageA).waitFor({ state: "detached", timeout: 15000 });
  await settle(pageA);
  check("the position source shows on the lead", (await pageA.getByTestId("position-source").innerText()).includes("Placed from the phone at the door"));

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
  check("My pay shows owed now, pending install and paid", totals.includes(`Owed now $${fee}`) && totals.includes("Pending install $0.00") && totals.includes("Paid $0.00"), totals);
  const lines = (await pageA.getByTestId("pay-lines").innerText()).replace(/\s+/g, " ");
  check("each booking shows how it went and its fee", lines.includes(`Qualified $${fee} owed`) && lines.includes("Cancelled No fee") && lines.includes("Upcoming No fee"), lines.slice(0, 200));
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
        admin.from("day_schedules").select("id, day, start_time, slot_minutes, slot_count").is("removed_at", null).order("id").then((r) => r.data),
      ]),
    );
  const before = await footprint();
  await op.goto(`${base}/app`);
  await settle(op);
  const homeHeadings = await op.locator("main h1, main [data-testid='tonight']").evaluateAll((els) => els.map((el) => el.tagName));
  check("Keenan's Home starts with Tonight", homeHeadings[0] === "H1" && homeHeadings[1] === "DIV" && (await op.getByTestId("tonight").count()) === 1);
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
