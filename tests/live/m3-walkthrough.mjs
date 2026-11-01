// Live walk-through of M3 on phone-sized screens against a running build.
// No double booking is a hard rule (Keenan, 2026-11-01), so it starts with
// two throwaway setters in two browsers: the second sees the first one's
// hold appear, cannot pick that time, sees it open again when the first
// backs out, and sees it grey out when the first books. Then: Before you
// book with a lead that isn't ready, the distance warning, moving and
// cancelling, Hold a time and Save and book on New lead with the phone's
// GPS, the time picker's opening evening, My pay, and Keenan's screens
// through the view-only owner session.
//
// The holds and bookings land on Keenan's real board, so the run uses only
// the last evening of the booking window, under test names, and removes
// everything at the end. My pay's qualified booking sits on a throwaway
// test host of its own, so nothing lands on Keenan's Tonight.
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

const slotButton = (page, iso) => page.locator(`[data-testid="time-picker"] [data-time="${iso}"]`).first();

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

async function chooseEvening(page, day) {
  const chip = page.getByRole("group", { name: "Evenings" }).getByRole("button", { name: new RegExp(`^${escape(dayChip(day))}`) });
  await chip.click();
  await page.getByTestId("picker-day").filter({ hasText: new RegExp(escape(dayChip(day).split(", ")[1])) }).waitFor({ timeout: 10000 }).catch(() => {});
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
  await chooseEvening(pageA, testDay);
  await chooseEvening(pageB, testDay);
  check("both setters see the test time open", (await slotButton(pageA, X).getAttribute("data-state")) === "open" && (await slotButton(pageB, X).getAttribute("data-state")) === "open");
  await checkTapTargets(pageB, "Schedule");
  await pageB.screenshot({ path: `${out}/m3-schedule.png`, fullPage: true });

  // ---------------------------------------------------------------- two browsers: hold, back out, book
  await slotButton(pageA, X).click();
  await pageA.waitForURL(/\/app\/schedule\/book\?start=/, { timeout: 20000 });
  await settle(pageA);
  check("tapping an open time holds it for the setter at once", (await pageA.getByTestId("hold-banner").getAttribute("data-held")) === "yes");
  const seenHeld = await waitForState(pageB, X, "held");
  check("the other setter sees the hold appear without refreshing, within a few seconds", seenHeld !== null && seenHeld <= 8000, seenHeld === null ? "never" : `${(seenHeld / 1000).toFixed(1)} s`);
  const initialsShown = (await slotButton(pageB, X).locator('[data-testid="holder-initials"]').innerText().catch(() => "")).trim();
  check("the held time shows the holder's initials", initialsShown === "TA", initialsShown);
  await slotButton(pageB, X).click();
  const heldMessage = (await pageB.getByTestId("picker-message").innerText().catch(() => "")).trim();
  check("tapping a held time says who is booking it, and does not pick it", heldMessage === "TEST Setter A is booking this time." && pageB.url().endsWith("/app/schedule"), heldMessage);
  const { data: bTried } = await admin.from("slot_holds").select("id").eq("holder_id", people.b.id);
  check("no hold was made for the second setter", (bTried ?? []).length === 0);
  await pageB.screenshot({ path: `${out}/m3-held-by-other.png`, fullPage: false });

  await pageA.getByRole("button", { name: "Let go" }).click();
  await pageA.waitForURL("**/app/schedule/book*", { timeout: 20000 }).catch(() => {});
  const seenOpen = await waitForState(pageB, X, "open");
  check("when the first setter backs out, the time opens again on the other phone", seenOpen !== null && seenOpen <= 8000, seenOpen === null ? "never" : `${(seenOpen / 1000).toFixed(1)} s`);

  await pageA.goto(`${base}/app/schedule`);
  await settle(pageA);
  await chooseEvening(pageA, testDay);
  await slotButton(pageA, X).click();
  await pageA.waitForURL(/\/app\/schedule\/book\?start=/, { timeout: 20000 });
  await settle(pageA);
  await pageA.getByRole("link", { name: /301 Hold Test Way NW/ }).click();
  await pageA.waitForURL(/lead=/, { timeout: 20000 });
  await settle(pageA);
  const readiness = await pageA.getByTestId("readiness").locator("li").evaluateAll((items) => items.map((item) => item.getAttribute("data-ok")));
  check("Before you book shows what's done and what's missing", JSON.stringify(readiness) === JSON.stringify(["yes", "yes", "yes", "yes", "no", "yes"]), readiness.join(","));
  const book = pageA.getByRole("button", { name: "Book this time" });
  check("Book stays off until the photo reason and the decision-makers question are answered", await book.isDisabled());
  await pageA.locator("fieldset", { hasText: "Why are photos missing?" }).getByText("Homeowner said no", { exact: true }).click();
  await pageA.getByText("Everyone who decides on the house will be at the meeting").click();
  check("then Book turns on", await book.isEnabled());
  await checkTapTargets(pageA, "the booking screen");
  await pageA.screenshot({ path: `${out}/m3-booking.png`, fullPage: true });
  await book.click();
  await pageA.waitForURL(`**/app/leads/${lead1}?booked=*`, { timeout: 30000 });
  await settle(pageA);
  check("booking lands on the lead with the time to confirm at the door", (await pageA.getByTestId("booked-notice").count()) === 1);
  const seenBooked = await waitForState(pageB, X, "booked");
  check("the other setter sees the time grey out, booked", seenBooked !== null && seenBooked <= 8000, seenBooked === null ? "never" : `${(seenBooked / 1000).toFixed(1)} s`);
  const bookedLabel = (await slotButton(pageB, X).getAttribute("aria-label")) ?? "";
  check("a booked time shows the neighbourhood and who booked it, and can't be tapped", bookedLabel.includes(TEST_PLACE) && bookedLabel.includes("TEST Setter A") && (await slotButton(pageB, X).isDisabled()), bookedLabel);
  const { data: meeting1 } = await admin.from("meetings").select("id, status, setter_id, photos_skipped").eq("lead_id", lead1).eq("status", "booked").single();
  check("the meeting is booked for the lead's setter with the photo reason", meeting1?.setter_id === people.a.id && meeting1?.photos_skipped === "homeowner_said_no");

  // ---------------------------------------------------------------- a lead that isn't ready
  await pageA.goto(`${base}/app/schedule/book?lead=${lead2}`);
  await settle(pageA);
  await chooseEvening(pageA, testDay);
  await slotButton(pageA, Y).click();
  await pageA.waitForURL(/start=.*lead=|lead=.*start=/, { timeout: 20000 });
  await settle(pageA);
  const missing = await pageA.getByTestId("readiness").locator('li[data-ok="no"]').count();
  check("a lead that isn't ready lists every missing item and can't be booked", missing === 6 && (await pageA.getByRole("button", { name: "Book this time" }).isDisabled()), `${missing} missing`);
  await pageA.getByRole("button", { name: "Let go" }).click();
  await pageA.waitForURL("**/app/schedule/book*", { timeout: 20000 }).catch(() => {});

  // ---------------------------------------------------------------- the distance warning
  await pageB.goto(`${base}/app/schedule/book?lead=${lead3}`);
  await settle(pageB);
  await chooseEvening(pageB, testDay);
  await slotButton(pageB, Z).click();
  await pageB.waitForURL(/start=/, { timeout: 20000 });
  await settle(pageB);
  const warning = (await pageB.getByTestId("distance-warning").innerText().catch(() => "")).replace(/\s+/g, " ");
  check(
    "booking a far address next to another meeting warns with the straight-line distance",
    new RegExp(`\\d+ km in a straight line from the ${escape(timeLabel(X))} meeting`).test(warning),
    warning,
  );
  await pageB.locator("fieldset", { hasText: "Why are photos missing?" }).getByText("Homeowner said no", { exact: true }).click();
  await pageB.getByText("Everyone who decides on the house will be at the meeting").click();
  await pageB.getByRole("button", { name: "Book this time" }).click();
  await pageB.waitForURL(`**/app/leads/${lead3}?booked=*`, { timeout: 30000 });
  check("the warning doesn't block: the setter can still book", true);

  // ---------------------------------------------------------------- move, then cancel
  await pageB.goto(`${base}/app/schedule`);
  await settle(pageB);
  await chooseEvening(pageB, testDay);
  await pageA.goto(`${base}/app/leads/${lead1}`);
  await settle(pageA);
  await pageA.getByTestId("lead-meetings").getByRole("link", { name: "Move" }).click();
  await pageA.waitForURL(/move=/, { timeout: 20000 });
  await settle(pageA);
  await chooseEvening(pageA, testDay);
  await slotButton(pageA, W).click();
  await pageA.waitForURL(/move=.*start=/, { timeout: 20000 });
  await settle(pageA);
  check("moving holds the new time first", (await pageA.getByTestId("hold-banner").getAttribute("data-held")) === "yes");
  await pageA.getByRole("button", { name: "Move the booking" }).click();
  await pageA.waitForURL(`**/app/leads/${lead1}?moved=1`, { timeout: 30000 });
  await settle(pageA);
  const movedTo = await waitForState(pageB, W, "booked");
  const freed = await waitForState(pageB, X, "open");
  check("a move frees the old time and books the new one on other phones", movedTo !== null && freed !== null);
  const { data: moves } = await admin.from("meetings").select("status, rebooked_as").eq("lead_id", lead1).order("created_at");
  check("the old meeting is marked moved and points to the new one", moves?.[0]?.status === "moved" && Boolean(moves?.[0]?.rebooked_as) && moves?.[1]?.status === "booked");
  check("the timeline says the meeting moved", (await pageA.getByText(/^Moved the meeting from /).count()) === 1);

  await pageA.getByRole("button", { name: "Cancel booking" }).click();
  await pageA.getByRole("button", { name: "Yes, cancel it" }).click();
  await pageA.getByText(/^Cancelled the meeting on /).waitFor({ timeout: 20000 }).catch(() => {});
  const { data: afterCancel } = await admin.from("leads").select("status, follow_up_on").eq("id", lead1).single();
  check("cancelling sends the lead to Follow up for tomorrow and says so in the timeline", afterCancel?.status === "follow_up" && Boolean(afterCancel?.follow_up_on) && (await pageA.getByText(/^Cancelled the meeting on /).count()) === 1, JSON.stringify(afterCancel));
  const reopened = await waitForState(pageB, W, "open");
  check("the cancelled time opens again on other phones", reopened !== null);

  // ---------------------------------------------------------------- Hold a time, then Save and book
  await pageA.goto(`${base}/app/leads/new`);
  await settle(pageA);
  const holdButton = pageA.getByRole("button", { name: "Hold a time" });
  const holdBox = await holdButton.boundingBox();
  const addressBox = await pageA.locator("#lead-address").boundingBox();
  check("New lead has Hold a time near the top, above the address", holdBox !== null && addressBox !== null && holdBox.y < addressBox.y);
  await holdButton.click();
  await chooseEvening(pageA, testDay);
  await slotButton(pageA, V).click();
  await pageA.getByTestId("held-time").waitFor({ timeout: 20000 });
  check("the time is held while the form is filled in", (await pageA.getByTestId("held-time").innerText()).includes(timeLabel(V)));
  const seenFromNewLead = await waitForState(pageB, V, "held");
  check("other phones see a time held from New lead", seenFromNewLead !== null);
  await pageA.fill("#lead-address", "305 Brand New Test Way NW (TEST)");
  await pageA.keyboard.press("Escape");
  await pageA.getByRole("button", { name: "Use where I'm standing" }).click();
  await pageA.getByText(/Map position from this phone at the door, accurate to about 10 m\./).waitFor({ timeout: 15000 });
  check("a brand-new street gets its map position from the phone at the door", true);
  await pageA.fill("#lead-first_name", TEST_LEAD);
  await pageA.fill("#lead-phone", "403 555 0188");
  for (const [legend, choice] of [["Owns the home", "Yes"], ["Wants a price", "Yes"], ["Soffit colour", "White"]]) {
    await pageA.locator("fieldset").filter({ has: pageA.locator("legend", { hasText: new RegExp(`^${legend}$`) }) }).getByText(choice, { exact: true }).click();
  }
  await pageA.getByText("Everyone who decides on the house will be at the meeting").click();
  await pageA.locator("fieldset", { hasText: "why not?" }).getByText("Homeowner said no", { exact: true }).click();
  await checkTapTargets(pageA, "New lead with a held time");
  await pageA.screenshot({ path: `${out}/m3-new-lead-held.png`, fullPage: true });
  await pageA.getByRole("button", { name: "Save and book" }).click();
  await pageA.waitForURL(/\/app\/leads\/[0-9a-f-]{36}\?booked=/, { timeout: 30000 });
  await settle(pageA);
  check("Save and book books the held time", (await pageA.getByTestId("booked-notice").count()) === 1);
  const newLeadId = pageA.url().match(/leads\/([0-9a-f-]{36})/)?.[1];
  const { data: newLead } = await admin.from("leads").select("position_source, position_accuracy_m, status").eq("id", newLeadId).single();
  check("the new lead keeps its phone position, accuracy and booked status", newLead?.position_source === "device" && Number(newLead?.position_accuracy_m) === 10 && newLead?.status === "meeting_booked", JSON.stringify(newLead));
  check("the position source shows on the lead", (await pageA.getByTestId("position-source").innerText()).includes("Placed from the phone at the door"));
  const seenNewBooked = await waitForState(pageB, V, "booked");
  check("and the time greys out on other phones", seenNewBooked !== null);

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
  check("Keenan can block times on the evening", (await op.getByRole("button", { name: "Block the whole evening" }).count()) === 1);
  await op.screenshot({ path: `${out}/m3-owner-schedule.png`, fullPage: true });
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
