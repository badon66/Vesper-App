// Live walk-through of Book now, finish later (Keenan, 2026-11-10) against a
// running build, on Keenan's phone size (430 x 932, as the installed app
// with the iPhone's safe areas) and a look at 390 wide:
//   - Book needs only a held time and a first name or the address: with
//     neither, it says so; everything else is listed To finish later and
//     never stops it;
//   - a throwaway setter books one test lead with only an address (no
//     name) and another with only a name, through the booking sheet, on
//     the test evening;
//   - a No on owns the home still rules a booking out, with Keep as a lead;
//     a Not yet on wants a price or a No on everyone who decides doesn't;
//   - the reminder bar reads "2 bookings to finish" on Home, Schedule,
//     Leads and Session, never inside the open booking sheet; tapping it
//     lists both bookings with what each is missing, and each item lands on
//     its field on the edit page, or on the lead page's photos;
//   - the lead page has the address right under the name, and a closed "To
//     be completed (N)" that opens to the same items;
//   - filling the items in one by one (the edit page saves part answers)
//     brings the count down, and the bar clears itself.
//
// The bookings land on Keenan's real board, so the run uses only the last
// evening of the booking window with open times, as the M3 walk-through
// does, under test names, and removes everything at the end: earnings,
// holds, meetings, photos, leads, knock sessions and the account.
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import sharp from "sharp";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The book now walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const ADDRESS_A = "401 Finish Later Way NW (TEST)";
const ADDRESS_B = "402 Finish Later Way NW (TEST)";
const NAME_TO_COME = "Name to come";
const ADDRESS_TO_COME = "Address to come";
const SOFFIT_LEGEND = "Soffit colour (two for a split soffit)";
const BUCKET = "lead-photos";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const setter = { email: `bn-live-a-${stamp}@example.com`, password: `juniper-signal-harbour-${digits}`, name: "TEST Finisher", id: null, client: null };

// Calgary's date the way the app works it out: UTC-6 for good since Alberta
// stopped changing clocks on 2026-11-01 (lib/time.ts).
const calgaryZone = (moment) => (moment.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton");
const timeLabel = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(new Date(iso)), hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dayChip = (day) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const squash = (text) => (text ?? "").replace(/\s+/g, " ").trim();

function tapTargetsTooSmall(page, root = null) {
  return page.evaluate((rootSelector) => {
    const offenders = [];
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="option"], label:has(input[type="radio"])';
    const scope = rootSelector ? document.querySelector(rootSelector) : document;
    for (const element of scope?.querySelectorAll(selector) ?? []) {
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
  }, root);
}

async function checkTapTargets(page, screen, root = null) {
  const small = await tapTargetsTooSmall(page, root);
  check(`tap targets on ${screen} are at least 44 px`, small.length === 0, small.join("; "));
}

// Whether the page scrolls sideways: wider than the screen.
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function checkNoSideways(page, screen) {
  const extra = await sideways(page);
  check(`${screen} has no sideways scroll`, extra <= 0, `${extra} px`);
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}

// ------------------------------------------------------------ the booking sheet
const sheet = (page) => page.getByTestId("booking-sheet");
const slotButton = (page, iso) => page.locator(`main [data-testid="time-picker"] [data-time="${iso}"]`).first();
const viewOf = (page) => sheet(page).getAttribute("data-view", { timeout: 2000 }).catch(() => null);
async function waitView(page, view, timeout = 20000) {
  await page.locator(`[data-testid="booking-sheet"][data-view="${view}"]`).waitFor({ timeout });
}
const next = (page) => page.getByTestId("sheet-next").click();
const nextLabel = (page) => page.getByTestId("sheet-next").innerText().then((text) => text.trim()).catch(() => "");
const nextReady = (page) => page.getByTestId("sheet-next").getAttribute("data-ready").catch(() => null);
const answerIn = (page, legend, choice) =>
  page
    .locator('[data-testid="booking-sheet"] fieldset')
    .filter({ has: page.locator("legend", { hasText: new RegExp(`^${escape(legend)}$`) }) })
    .getByText(choice, { exact: true })
    .click();
const heldState = (page) => page.getByTestId("sheet-held").getAttribute("data-held", { timeout: 5000 }).catch(() => null);
async function letGo(page) {
  await sheet(page).getByTestId("sheet-held").click();
  await page.getByTestId("hold-menu").waitFor({ timeout: 5000 });
  await page.getByTestId("hold-menu").getByRole("menuitem", { name: "Let go" }).click();
  await page.getByTestId("sheet-let-go").getByRole("button", { name: "Let go", exact: true }).click();
  await sheet(page).waitFor({ state: "detached", timeout: 20000 });
}
// Book's "To finish later" rows: one per step, keyed by their first item.
const laterRows = (page) =>
  sheet(page)
    .locator('[data-testid="book-checklist"] li[data-item]')
    .evaluateAll((items) => items.map((item) => ({ step: item.getAttribute("data-step"), items: item.getAttribute("data-items") })));

async function waitForState(page, iso, state, timeout = 12000) {
  try {
    await page.waitForFunction(
      ([selector, wanted]) => document.querySelector(selector)?.getAttribute("data-state") === wanted,
      [`[data-testid="time-picker"] [data-time="${iso}"]`, state],
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

async function chooseEvening(root, day) {
  const chip = root.getByRole("group", { name: "Evenings" }).getByRole("button", { name: new RegExp(`^${escape(dayChip(day))}`) });
  await chip.click();
  await root.getByTestId("picker-day").filter({ hasText: new RegExp(escape(dayChip(day).split(", ")[1])) }).waitFor({ timeout: 10000 }).catch(() => {});
}

async function signIn(page) {
  await page.goto(`${base}/login`);
  await settle(page);
  await page.fill("#email", setter.email);
  await page.fill("#password", setter.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30000 });
  await settle(page);
}

// ------------------------------------------------------------ the reminder bar
async function barOf(page, expectBar = true) {
  if (expectBar) await page.getByTestId("to-finish-bar").waitFor({ timeout: 10000 }).catch(() => {});
  return page.evaluate(() => {
    const bar = document.querySelector('[data-testid="to-finish-bar"]');
    if (!bar) return null;
    const open = bar.querySelector('[data-testid="to-finish-open"]');
    const box = open?.getBoundingClientRect();
    return {
      count: bar.getAttribute("data-count"),
      text: (open?.innerText ?? "").replace(/\s+/g, " ").trim(),
      top: box ? Math.round(box.top) : null,
      height: box ? Math.round(box.height) : null,
    };
  });
}
const tab = (page, name) => page.getByRole("navigation", { name: "Tabs" }).filter({ visible: true }).getByRole("link", { name, exact: true });
async function goTab(page, name, path) {
  await tab(page, name).click();
  await page.waitForURL(`**${path}`, { timeout: 20000 });
  await settle(page);
}
async function openPanel(page) {
  await page.getByTestId("to-finish-open").click();
  await page.getByTestId("to-finish-panel").getByTestId("to-finish-booking").first().waitFor({ timeout: 10000 });
}
const panelBookings = (page) =>
  page
    .getByTestId("to-finish-panel")
    .getByTestId("to-finish-booking")
    .evaluateAll((rows) =>
      rows.map((row) => ({
        meeting: row.getAttribute("data-meeting"),
        text: row.innerText.replace(/\s+/g, " ").trim(),
        items: [...row.querySelectorAll('[data-testid="to-finish-item"]')].map((item) => item.getAttribute("data-item")),
        hrefs: [...row.querySelectorAll('[data-testid="to-finish-item"]')].map((item) => item.getAttribute("href")),
      })),
    );
const panelItem = (page, meetingId, item) =>
  page.locator(`[data-testid="to-finish-panel"] [data-testid="to-finish-booking"][data-meeting="${meetingId}"] [data-testid="to-finish-item"][data-item="${item}"]`);

// Where a jump landed: the element is in view, not under the sticky header,
// and (for a text field) has the focus.
function landing(page, id) {
  return page.evaluate((target) => {
    const element = document.getElementById(target);
    if (!element) return { found: false };
    const box = element.getBoundingClientRect();
    const x = box.left + Math.min(box.width / 2, 40);
    const y = box.top + Math.min(box.height / 2, 20);
    const hit = document.elementFromPoint(x, y);
    return {
      found: true,
      inView: box.top >= 0 && box.top < window.innerHeight && box.bottom > 0,
      uncovered: Boolean(hit && (element === hit || element.contains(hit))),
      focused: document.activeElement?.id ?? null,
      top: Math.round(box.top),
    };
  }, id);
}

// The lead page's To be completed: its summary, whether it's open, its items.
function toBeCompleted(page) {
  return page.evaluate(() => {
    const details = document.querySelector('[data-testid="to-be-completed"]');
    if (!details) return null;
    return {
      open: details.open,
      summary: (details.querySelector('[data-testid="to-be-completed-summary"]')?.textContent ?? "").replace(/\s+/g, " ").trim(),
      items: [...details.querySelectorAll("li[data-item]")].map((item) => item.getAttribute("data-item")),
    };
  });
}

// The edit page: a question group by its legend.
const editQuestion = (page, id) => page.locator(`#${id}`);
async function saveEdit(page, leadId) {
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL((current) => current.pathname === `/app/leads/${leadId}`, { timeout: 30000 });
  await settle(page);
}

async function leadRow(id) {
  const { data } = await admin
    .from("leads")
    .select("id, first_name, address_line, name_to_come, address_to_come, lat, lng, phone_saved, owns_home, wants_price, both_decision_makers, soffit_colour, not_collected, status")
    .eq("id", id)
    .single();
  return data;
}

async function waitForPhotos(leadId, count, timeout = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const { count: have } = await admin.from("lead_photos").select("id", { count: "exact", head: true }).eq("lead_id", leadId).in("slot", ["front", "left_corner", "right_corner"]);
    if ((have ?? 0) >= count) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// Takes the three guided photos on the lead page, one at a time: each is in
// the database before the next is taken.
async function uploadGuidedPhotos(page, leadId) {
  let taken = 0;
  for (const slot of ["front", "left_corner", "right_corner"]) {
    await page.setInputFiles(`[data-testid="slot-input-${slot}"]`, fixture);
    if (await waitForPhotos(leadId, taken + 1)) taken += 1;
    await page.waitForTimeout(300);
  }
  return taken === 3;
}

async function removeEverything() {
  const id = setter.id;
  if (!id) return;
  const { data: leads } = await admin.from("leads").select("id").eq("created_by", id);
  const leadIds = (leads ?? []).map((lead) => lead.id);
  await admin.from("earnings").delete().eq("profile_id", id);
  await admin.from("slot_holds").delete().eq("holder_id", id);
  if (leadIds.length > 0) {
    await admin.from("earnings").delete().in("lead_id", leadIds);
    await admin.from("slot_holds").delete().in("lead_id", leadIds);
    await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
    await admin.from("meetings").delete().in("lead_id", leadIds);
    await admin.from("lead_photos").delete().in("lead_id", leadIds);
  }
  await admin.from("leads").delete().eq("created_by", id);
  await admin.from("knock_sessions").delete().eq("user_id", id);
  const { data: files } = await admin.storage.from(BUCKET).list(id, { limit: 1000 });
  if (files && files.length > 0) await admin.storage.from(BUCKET).remove(files.map((file) => `${id}/${file.name}`));
  await admin.auth.admin.deleteUser(id);
}

await mkdir(out, { recursive: true });
const fixture = `${out}/bn-fixture.jpg`;
await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#5b7083" } }).jpeg({ quality: 85 }).toFile(fixture);
const browser = await chromium.launch();
const { defaultBrowserType, ...iphone } = devices["iPhone 14"];
void defaultBrowserType;
// The installed app fills the screen; the iPhone keeps its safe areas at the
// top and bottom of the sheet, which a test browser leaves out.
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
const context = await installedPhone(430, 932, 59);
const page = await context.newPage();
let narrowContext = null;

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
  // The first sign-in welcome has its own walk-through; this one starts after it.
  await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", setter.id);
  setter.client = createClient(url, anonKey, noSession);
  const signedIn = await setter.client.auth.signInWithPassword({ email: setter.email, password: setter.password });
  if (signedIn.error) throw new Error(`sign in: ${signedIn.error.message}`);

  // The test evening: the last in the booking window with three open times.
  const { data: boardRows, error: boardError } = await setter.client.rpc("schedule_board");
  if (boardError) throw new Error(`board: ${boardError.message}`);
  const board = boardRows.map((row) => ({ ...row, iso: new Date(row.starts_at).toISOString() }));
  const byDay = new Map();
  for (const row of board) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
  const testDay = [...byDay.keys()].sort().reverse().find((day) => (byDay.get(day) ?? []).filter((row) => row.state === "open").length >= 3);
  if (!testDay) throw new Error("no evening in the booking window has three open times");
  const [X, Y, W] = byDay.get(testDay).filter((row) => row.state === "open").map((row) => row.iso);
  note(`Test evening: ${testDay} (${dayChip(testDay)}), the last in the window with open times; times ${[X, Y, W].map(timeLabel).join(", ")}.`);

  await signIn(page);
  check("with no bookings, a setter's Home has no reminder bar", (await barOf(page, false)) === null);

  // ---------------------------------------------------------------- Book with neither a name nor an address
  await goTab(page, "Schedule", "/app/schedule");
  await chooseEvening(page.locator("main"), testDay);
  await slotButton(page, X).click();
  await waitView(page, "who");
  const whoHint = squash(await sheet(page).getByTestId("sheet-body").innerText().catch(() => ""));
  check("the first step says a first name or the address is enough to book", whoHint.includes("A first name or the address is enough to book. The rest can be finished later."), whoHint.slice(-120));
  await sheet(page).getByTestId("sheet-step-book").click();
  await waitView(page, "book");
  const needsText = squash(await sheet(page).getByTestId("book-needs").innerText().catch(() => ""));
  check(
    "Book with neither a name nor an address says it needs one, and Book stays off",
    needsText.startsWith("Add a first name or the address to book.") && (await nextLabel(page)) === "Add a name or address" && (await nextReady(page)) === "no",
    `${needsText}; ${await nextLabel(page)}`,
  );
  check("and it isn't ruled out: no Keep as a lead", (await sheet(page).getByTestId("keep-as-lead").count()) === 0);
  check(
    "while a name or the address is still needed, Book doesn't say that nothing on the list stops the booking",
    (await sheet(page).getByTestId("book-later-note").count()) === 0,
  );
  await page.screenshot({ path: `${out}/bn-book-needs-430.png` });
  await next(page);
  await waitView(page, "who").catch(() => {});
  check("tapping it takes the setter to the name", (await viewOf(page)) === "who", await viewOf(page));

  // ---------------------------------------------------------------- booking A: only an address
  await sheet(page).getByTestId("sheet-step-address").click();
  await waitView(page, "address");
  await page.fill("#lead-address", ADDRESS_A);
  await page.getByTestId("sheet-heading").click();
  await sheet(page).getByRole("button", { name: "Use where I'm standing" }).click();
  await sheet(page).getByText(/accurate to about 10 m/).first().waitFor({ timeout: 20000 });
  await sheet(page).getByTestId("sheet-step-book").click();
  await waitView(page, "book");
  const summaryA = squash(await sheet(page).getByTestId("sheet-summary").innerText());
  const rowsA = await laterRows(page);
  const laterNote = squash(await sheet(page).getByTestId("book-later-note").innerText().catch(() => ""));
  const bookLabelA = await nextLabel(page);
  check(
    "with only the address, Book is ready: it reads Name to come, the address, and the Book button names the time",
    summaryA.startsWith(`${NAME_TO_COME} ${ADDRESS_A}`) && bookLabelA.startsWith("Book ") && bookLabelA.endsWith(timeLabel(X)) && (await nextReady(page)) === "yes" && (await sheet(page).getByTestId("book-needs").count()) === 0,
    `${summaryA}; ${bookLabelA}`,
  );
  check(
    "Book lists what's left To finish later, by step, and says none of it stops the booking",
    laterNote === "None of it stops the booking." &&
      JSON.stringify(rowsA.map((row) => row.step)) === JSON.stringify(["who", "door", "learned", "address", "house", "book"]) &&
      rowsA.find((row) => row.step === "door")?.items === "owns_home wants_price both_decision_makers" &&
      rowsA.find((row) => row.step === "address")?.items === "soffit_colour" &&
      rowsA.find((row) => row.step === "book")?.items === "phone",
    `${laterNote}; ${JSON.stringify(rowsA)}`,
  );
  const laterHeading = squash(await sheet(page).getByTestId("book-checklist").locator("h3").innerText().catch(() => ""));
  check("the list is headed To finish later", laterHeading === "To finish later", laterHeading);
  await checkTapTargets(page, "Book with things to finish later, 430 wide", '[data-testid="booking-sheet"]');
  await checkNoSideways(page, "Book at 430 wide");
  await page.screenshot({ path: `${out}/bn-book-later-430.png` });
  // A row still goes to its step, with Next back to Book.
  await sheet(page).locator('[data-testid="book-checklist"] li[data-step="door"] button').click();
  await waitView(page, "door");
  check("a row on Book still opens its step, with Next back to Book", (await nextLabel(page)) === "Return to Book", await nextLabel(page));
  await next(page);
  await waitView(page, "book");
  await next(page);
  await waitView(page, "done", 30000);
  check("Book with only an address books: the done screen", (await heldState(page)) === "booked");
  await sheet(page).getByRole("button", { name: "Done", exact: true }).click();
  await sheet(page).waitFor({ state: "detached", timeout: 15000 });
  const { data: leadARow } = await admin.from("leads").select("id").eq("created_by", setter.id).eq("address_line", ADDRESS_A).single();
  const leadA = leadARow?.id;
  const savedA = await leadRow(leadA);
  check(
    "it saved the person as Name to come, with the flag, the address and its map position, Booked",
    savedA?.first_name === NAME_TO_COME && savedA?.name_to_come === true && savedA?.address_to_come === false && savedA?.lat !== null && savedA?.status === "meeting_booked" && savedA?.phone_saved === false && savedA?.owns_home === null,
    JSON.stringify(savedA),
  );

  // ---------------------------------------------------------------- booking B: only a name, and what rules a booking out
  await chooseEvening(page.locator("main"), testDay);
  await waitForState(page, Y, "open");
  await slotButton(page, Y).click();
  await waitView(page, "who");
  await page.fill("#sheet-first-name", TEST_LEAD);
  await page.fill("#sheet-last-name", "Name Only");
  await next(page);
  await waitView(page, "door");
  await answerIn(page, "Wants a price", "Not yet");
  await answerIn(page, "Everyone who decides will be there", "No");
  check(
    "a Not yet on wants a price and a No on everyone who decides don't rule a booking out: no note, Next carries on",
    (await sheet(page).getByTestId("door-note").count()) === 0 && (await page.getByTestId("sheet-next").getAttribute("data-step-back")) !== "yes",
  );
  await answerIn(page, "Owns the home", "No");
  const doorNote = squash(await sheet(page).getByTestId("door-note").innerText().catch(() => ""));
  check(
    "a No on owns the home still rules it out, said at once with Keep as a lead, and Next steps back",
    doorNote.startsWith("Only homeowners can be booked.") && (await sheet(page).getByTestId("door-note").getByTestId("keep-as-lead").count()) === 1 && (await page.getByTestId("sheet-next").getAttribute("data-step-back")) === "yes",
    doorNote,
  );
  await sheet(page).getByTestId("sheet-step-book").click();
  await waitView(page, "book");
  const ruledOut = squash(await sheet(page).getByTestId("book-ruled-out").innerText().catch(() => ""));
  check(
    "on Book the No rules it out: Can't book, Keep as a lead offered, and no line saying nothing stops it",
    ruledOut.startsWith("Only homeowners can be booked.") &&
      (await nextLabel(page)) === "Can't book" &&
      (await nextReady(page)) === "no" &&
      (await sheet(page).getByTestId("keep-as-lead").count()) === 1 &&
      (await sheet(page).getByTestId("book-later-note").count()) === 0,
    `${ruledOut}; ${await nextLabel(page)}`,
  );
  await page.screenshot({ path: `${out}/bn-book-ruled-out-430.png` });
  await next(page);
  check(
    "Can't book stays on Book with the time held and goes to Keep as a lead",
    (await viewOf(page)) === "book" && (await heldState(page)) === "yes" && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "keep-as-lead",
  );
  // They weren't sure after all: Not collected, which is finished later.
  await sheet(page).getByTestId("sheet-step-door").click();
  await waitView(page, "door");
  await sheet(page)
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Owns the home$/ }) })
    .getByText("Not collected", { exact: true })
    .click();
  check("Not collected on owns the home doesn't rule it out", (await sheet(page).getByTestId("door-note").count()) === 0);
  await sheet(page).getByTestId("sheet-step-book").click();
  await waitView(page, "book");
  const summaryB = squash(await sheet(page).getByTestId("sheet-summary").innerText());
  const rowsB = await laterRows(page);
  check(
    "with only a name, Book reads Address to come and lists the rest, the Not collected included, but not the answers given",
    summaryB.startsWith(`${TEST_LEAD} Name Only ${ADDRESS_TO_COME}`) &&
      rowsB.find((row) => row.step === "door")?.items === "owns_home" &&
      rowsB.some((row) => row.step === "address") &&
      (await nextLabel(page)).startsWith("Book ") &&
      (await nextReady(page)) === "yes",
    `${summaryB}; ${JSON.stringify(rowsB)}`,
  );
  await next(page);
  await waitView(page, "done", 30000);
  await sheet(page).getByRole("button", { name: "Done", exact: true }).click();
  await sheet(page).waitFor({ state: "detached", timeout: 15000 });
  const { data: leadBRow } = await admin.from("leads").select("id").eq("created_by", setter.id).eq("last_name", "Name Only").single();
  const leadB = leadBRow?.id;
  const savedB = await leadRow(leadB);
  check(
    "it saved the person with Address to come and its flag, no map position, the Not collected and the answers given",
    savedB?.first_name === TEST_LEAD &&
      savedB?.address_line === ADDRESS_TO_COME &&
      savedB?.address_to_come === true &&
      savedB?.name_to_come === false &&
      savedB?.lat === null &&
      savedB?.wants_price === false &&
      savedB?.both_decision_makers === false &&
      (savedB?.not_collected ?? []).includes("owns_home") &&
      savedB?.status === "meeting_booked",
    JSON.stringify(savedB),
  );
  const { data: meetings } = await admin.from("meetings").select("id, lead_id, starts_at, everyone_deciding_present, status").in("lead_id", [leadA, leadB]).order("starts_at");
  const meetingA = meetings?.find((meeting) => meeting.lead_id === leadA);
  const meetingB = meetings?.find((meeting) => meeting.lead_id === leadB);
  check(
    "both are booked for the setter at their times; the meetings table stores everyone who decides as true, as before",
    meetingA?.status === "booked" && meetingB?.status === "booked" && new Date(meetingA.starts_at).toISOString() === X && new Date(meetingB.starts_at).toISOString() === Y && meetings.every((meeting) => meeting.everyone_deciding_present === true),
    JSON.stringify(meetings),
  );

  // ---------------------------------------------------------------- the reminder bar
  // Done refreshes the screen behind the sheet; the bar follows within a moment.
  await page.locator('[data-testid="to-finish-bar"][data-count="2"]').waitFor({ timeout: 10000 }).catch(() => {});
  const onSchedule = await barOf(page);
  check("back on Schedule, once Done refreshes it, the bar reads 2 bookings to finish", onSchedule?.count === "2" && onSchedule.text.startsWith("2 bookings to finish"), JSON.stringify(onSchedule));
  // Not inside the open booking sheet: it covers the whole app.
  await chooseEvening(page.locator("main"), testDay);
  await waitForState(page, W, "open");
  await slotButton(page, W).click();
  await waitView(page, "who");
  const underSheet = await page.evaluate(() => {
    const open = document.querySelector('[data-testid="to-finish-open"]');
    const sheetBox = document.querySelector('[data-testid="booking-sheet"]');
    if (!open || !sheetBox) return { bar: Boolean(open), covered: null, inSheet: null };
    const box = open.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { bar: true, covered: Boolean(hit && sheetBox.contains(hit)), inSheet: sheetBox.querySelector('[data-testid="to-finish-bar"]') !== null };
  });
  const sheetText = squash(await sheet(page).innerText());
  check(
    "the bar doesn't show inside the open booking sheet: the sheet covers it, and carries none of its own",
    (underSheet.bar === false || underSheet.covered === true) && underSheet.inSheet !== true && !sheetText.includes("bookings to finish"),
    JSON.stringify(underSheet),
  );
  await page.screenshot({ path: `${out}/bn-sheet-open-430.png` });
  await letGo(page);

  for (const [name, path] of [["Home", "/app"], ["Leads", "/app/leads"], ["Session", "/app/session"]]) {
    await goTab(page, name, path);
    const bar = await barOf(page);
    check(`the bar reads 2 bookings to finish on ${name}, at the top, 44 px tall`, bar?.count === "2" && bar.text.startsWith("2 bookings to finish") && bar.top !== null && bar.top < 160 && bar.height >= 44, JSON.stringify(bar));
    if (name === "Home") {
      await checkTapTargets(page, "the reminder bar", '[data-testid="to-finish-bar"]');
      await page.screenshot({ path: `${out}/bn-bar-home-430.png` });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      const scrolled = await barOf(page);
      check("the bar stays at the top as the screen scrolls", scrolled?.top !== null && scrolled.top >= 0 && scrolled.top < 160, JSON.stringify(scrolled));
      await page.evaluate(() => window.scrollTo(0, 0));
      await checkNoSideways(page, "Home with the bar at 430 wide");
    }
  }

  // ---------------------------------------------------------------- the panel
  await goTab(page, "Home", "/app");
  await openPanel(page);
  const panelTitle = squash(await page.getByTestId("to-finish-panel").locator("h2").innerText());
  const listed = await panelBookings(page);
  check("tapping the bar opens a panel titled 2 bookings to finish", panelTitle === "2 bookings to finish", panelTitle);
  check(
    "it lists both bookings, soonest first, with the name, the time and the address",
    JSON.stringify(listed.map((row) => row.meeting)) === JSON.stringify([meetingA?.id, meetingB?.id]) &&
      listed[0]?.text.startsWith(NAME_TO_COME) &&
      listed[0]?.text.includes(ADDRESS_A) &&
      listed[0]?.text.includes(timeLabel(X)) &&
      listed[1]?.text.startsWith(`${TEST_LEAD} Name Only`) &&
      listed[1]?.text.includes(ADDRESS_TO_COME) &&
      listed[1]?.text.includes(timeLabel(Y)),
    listed.map((row) => row.text.slice(0, 90)).join(" | "),
  );
  check(
    "each booking lists what it's missing: the address-only one its name and the rest; the name-only one its address, without the answers given",
    JSON.stringify(listed[0]?.items) === JSON.stringify(["name", "phone", "owns_home", "wants_price", "both_decision_makers", "soffit_colour", "photos"]) &&
      JSON.stringify(listed[1]?.items) === JSON.stringify(["address", "phone", "owns_home", "soffit_colour", "photos"]),
    `${listed[0]?.items?.join(",")} | ${listed[1]?.items?.join(",")}`,
  );
  check(
    "each item goes to its field on the edit page, the photos to the lead page",
    listed[0]?.hrefs?.[0] === `/app/leads/${leadA}/edit#lead-first_name` &&
      listed[0]?.hrefs?.[1] === `/app/leads/${leadA}/edit#lead-phone` &&
      listed[0]?.hrefs?.[2] === `/app/leads/${leadA}/edit#q-owns_home` &&
      listed[0]?.hrefs?.[6] === `/app/leads/${leadA}#photos` &&
      listed[1]?.hrefs?.[0] === `/app/leads/${leadB}/edit#lead-address`,
    `${listed[0]?.hrefs?.join(" ")} | ${listed[1]?.hrefs?.join(" ")}`,
  );
  const panelHtml = await page.getByTestId("to-finish-panel").innerHTML();
  check("the panel carries no phone number or call link", !/tel:|sms:|mailto:/.test(panelHtml));
  await checkTapTargets(page, "the reminder's panel", '[data-testid="to-finish-panel"]');
  await checkNoSideways(page, "Home with the panel open at 430 wide");
  await page.screenshot({ path: `${out}/bn-panel-430.png` });

  // ---------------------------------------------------------------- a look at 390 wide
  narrowContext = await installedPhone(390, 844, 47);
  const narrow = await narrowContext.newPage();
  await signIn(narrow);
  const narrowBar = await barOf(narrow);
  check("at 390 wide the bar reads the same, 44 px tall", narrowBar?.count === "2" && narrowBar.text.startsWith("2 bookings to finish") && narrowBar.height >= 44, JSON.stringify(narrowBar));
  await checkNoSideways(narrow, "Home with the bar at 390 wide");
  await narrow.screenshot({ path: `${out}/bn-bar-home-390.png` });
  await openPanel(narrow);
  await checkTapTargets(narrow, "the reminder's panel at 390 wide", '[data-testid="to-finish-panel"]');
  await checkNoSideways(narrow, "the panel at 390 wide");
  await narrow.screenshot({ path: `${out}/bn-panel-390.png` });
  await narrow.keyboard.press("Escape");
  await narrow.goto(`${base}/app/leads/${leadA}`);
  await settle(narrow);
  await narrow.getByTestId("to-be-completed-summary").click();
  // The chevron turns as it opens; the picture waits for it.
  await narrow.waitForTimeout(400);
  await checkNoSideways(narrow, "the lead page at 390 wide");
  await narrow.screenshot({ path: `${out}/bn-lead-top-390.png` });
  await narrow.goto(`${base}/app/schedule`);
  await settle(narrow);
  await chooseEvening(narrow.locator("main"), testDay);
  await waitForState(narrow, W, "open");
  await slotButton(narrow, W).click();
  await waitView(narrow, "who");
  await narrow.fill("#sheet-first-name", `${TEST_LEAD} Narrow`);
  await sheet(narrow).getByTestId("sheet-step-book").click();
  await waitView(narrow, "book");
  check("at 390 wide, Book with only a name is ready and lists the rest to finish later", (await nextReady(narrow)) === "yes" && (await sheet(narrow).getByTestId("book-later-note").count()) === 1);
  await checkTapTargets(narrow, "Book at 390 wide", '[data-testid="booking-sheet"]');
  await checkNoSideways(narrow, "Book at 390 wide");
  await narrow.screenshot({ path: `${out}/bn-book-later-390.png` });
  await letGo(narrow);
  await narrowContext.close();
  narrowContext = null;

  // ---------------------------------------------------------------- finishing booking A, one item at a time
  // The phone, from the panel: straight to the field, with the focus.
  await panelItem(page, meetingA.id, "phone").click();
  await page.waitForURL((current) => current.pathname === `/app/leads/${leadA}/edit` && current.hash === "#lead-phone", { timeout: 20000 });
  await settle(page);
  await page.locator("#lead-phone").waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  const phoneLanding = await landing(page, "lead-phone");
  check("Phone number lands on the edit page's phone field, in view, clear of the header, with the focus", phoneLanding.inView && phoneLanding.uncovered && phoneLanding.focused === "lead-phone", JSON.stringify(phoneLanding));
  await checkNoSideways(page, "the edit page at 430 wide");
  await page.screenshot({ path: `${out}/bn-landed-phone-430.png` });
  await page.fill("#lead-phone", "403 555 0150");
  await saveEdit(page, leadA);
  const afterPhone = await toBeCompleted(page);
  check("the edit page saves the phone alone, part answers and all", (await leadRow(leadA))?.phone_saved === true);

  // The lead page: the address right under the name, and To be completed.
  const top = await page.evaluate(() => {
    const heading = document.querySelector("main h1");
    const address = document.querySelector('[data-testid="lead-address-top"]');
    if (!heading || !address) return null;
    const h = heading.getBoundingClientRect();
    const a = address.getBoundingClientRect();
    return { gap: Math.round(a.top - h.bottom), name: heading.textContent.trim(), address: address.textContent.replace(/\s+/g, " ").trim() };
  });
  check(
    "the lead page has the address right under the name",
    top !== null && top.address.startsWith(ADDRESS_A) && top.gap >= 0 && top.gap <= 24 && top.name === NAME_TO_COME,
    JSON.stringify(top),
  );
  check(
    "To be completed is there, closed, with its count: 8 left",
    afterPhone !== null && afterPhone.open === false && afterPhone.summary === "To be completed (8)",
    JSON.stringify(afterPhone),
  );
  check("Before you book is gone from the lead page", (await page.getByTestId("before-you-book").count()) === 0 && (await page.getByText("Before you book", { exact: true }).count()) === 0);
  await page.getByTestId("to-be-completed-summary").click();
  await page.waitForTimeout(400);
  const opened = await toBeCompleted(page);
  check(
    "it opens to the same items, Christmas lights now and Looked into it before added",
    opened?.open === true && JSON.stringify(opened.items) === JSON.stringify(["name", "owns_home", "wants_price", "both_decision_makers", "christmas_lights_now", "looked_into_before", "soffit_colour", "photos"]),
    JSON.stringify(opened),
  );
  await checkTapTargets(page, "To be completed", '[data-testid="to-be-completed"]');
  await checkNoSideways(page, "the lead page at 430 wide");
  await page.screenshot({ path: `${out}/bn-lead-top-430.png` });
  const afterOne = await barOf(page);
  check("the bar still counts both bookings while A misses anything", afterOne?.count === "2", JSON.stringify(afterOne));

  // The name: Name to come is selected when the field takes the focus, so typing replaces it.
  await page.locator('[data-testid="to-be-completed"] li[data-item="name"] a').click();
  await page.waitForURL((current) => current.pathname === `/app/leads/${leadA}/edit` && current.hash === "#lead-first_name", { timeout: 20000 });
  await settle(page);
  await page.locator("#lead-first_name").waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  const nameLanding = await landing(page, "lead-first_name");
  const nameSelected = await page.evaluate(() => {
    const input = document.getElementById("lead-first_name");
    return input ? input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0) : null;
  });
  check(
    "Name lands on the first name, focused, with Name to come selected so typing replaces it",
    nameLanding.inView && nameLanding.uncovered && nameLanding.focused === "lead-first_name" && nameSelected === NAME_TO_COME,
    `${JSON.stringify(nameLanding)}; selected "${nameSelected}"`,
  );
  await page.keyboard.type(TEST_LEAD);
  check("typing replaces Name to come", (await page.inputValue("#lead-first_name")) === TEST_LEAD, await page.inputValue("#lead-first_name"));
  await page.fill("#lead-last_name", "Address First");
  await saveEdit(page, leadA);
  const named = await leadRow(leadA);
  const afterName = await toBeCompleted(page);
  check(
    "the name saves, the flag clears itself, and the count drops to 7",
    named?.first_name === TEST_LEAD && named?.name_to_come === false && afterName?.summary === "To be completed (7)",
    `${JSON.stringify(named)}; ${afterName?.summary}`,
  );

  // Owns the home: the question group, in view and marked.
  await page.getByTestId("to-be-completed-summary").click();
  await page.locator('[data-testid="to-be-completed"] li[data-item="owns_home"] a').click();
  await page.waitForURL((current) => current.pathname === `/app/leads/${leadA}/edit` && current.hash === "#q-owns_home", { timeout: 20000 });
  await settle(page);
  await editQuestion(page, "q-owns_home").waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  const ownsLanding = await landing(page, "q-owns_home");
  check("Owns the home lands on its question, in view and clear of the header", ownsLanding.inView && ownsLanding.uncovered, JSON.stringify(ownsLanding));
  await page.screenshot({ path: `${out}/bn-landed-owns-home-430.png` });
  await editQuestion(page, "q-owns_home").getByText("Yes", { exact: true }).click();
  await saveEdit(page, leadA);
  const afterOwns = await toBeCompleted(page);
  check("owns the home saves on its own, and the count drops to 6", (await leadRow(leadA))?.owns_home === true && afterOwns?.summary === "To be completed (6)", afterOwns?.summary);

  // From the bar again: wants a price, and the other questions while there.
  await openPanel(page);
  const panelA = (await panelBookings(page)).find((row) => row.meeting === meetingA.id);
  check(
    "the panel follows along: A now misses wants a price, everyone who decides, the soffit and the photos",
    JSON.stringify(panelA?.items) === JSON.stringify(["wants_price", "both_decision_makers", "soffit_colour", "photos"]),
    panelA?.items?.join(","),
  );
  await panelItem(page, meetingA.id, "wants_price").click();
  await page.waitForURL((current) => current.pathname === `/app/leads/${leadA}/edit` && current.hash === "#q-wants_price", { timeout: 20000 });
  await settle(page);
  await editQuestion(page, "q-wants_price").waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  const wantsLanding = await landing(page, "q-wants_price");
  check("Wants a price, from the bar, lands on its question", wantsLanding.inView && wantsLanding.uncovered, JSON.stringify(wantsLanding));
  await editQuestion(page, "q-wants_price").getByText("Yes", { exact: true }).click();
  await editQuestion(page, "q-both_decision_makers").getByText("Yes", { exact: true }).click();
  await editQuestion(page, "q-christmas_lights_now").getByText("None", { exact: true }).click();
  await editQuestion(page, "q-looked_into_before").getByText("New to them", { exact: true }).click();
  await saveEdit(page, leadA);
  const afterQuestions = await toBeCompleted(page);
  check("four answers at once, and the count drops to 2", afterQuestions?.summary === "To be completed (2)", afterQuestions?.summary);

  await page.getByTestId("to-be-completed-summary").click();
  await page.locator('[data-testid="to-be-completed"] li[data-item="soffit_colour"] a').click();
  await page.waitForURL((current) => current.pathname === `/app/leads/${leadA}/edit` && current.hash === "#q-soffit_colour", { timeout: 20000 });
  await settle(page);
  await editQuestion(page, "q-soffit_colour").waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  const soffitLanding = await landing(page, "q-soffit_colour");
  check("Soffit colour lands on its question", soffitLanding.inView && soffitLanding.uncovered, JSON.stringify(soffitLanding));
  await editQuestion(page, "q-soffit_colour").getByText("Not sure", { exact: true }).click();
  await saveEdit(page, leadA);
  const afterSoffit = await toBeCompleted(page);
  check("the soffit saves, and only the photos are left: 1", afterSoffit?.summary === "To be completed (1)" && JSON.stringify(afterSoffit?.items) === JSON.stringify(["photos"]), JSON.stringify(afterSoffit));

  // Photos: the lead page's Photos card.
  await page.getByTestId("to-be-completed-summary").click();
  await page.locator('[data-testid="to-be-completed"] li[data-item="photos"] a').click();
  await page.waitForURL((current) => current.pathname === `/app/leads/${leadA}` && current.hash === "#photos", { timeout: 20000 });
  await page.waitForTimeout(600);
  const photosLanding = await landing(page, "photos");
  check("Photos lands on the lead page's Photos card", photosLanding.inView && photosLanding.top >= 0 && photosLanding.top < 400, JSON.stringify(photosLanding));
  const photosIn = await uploadGuidedPhotos(page, leadA);
  check("the three guided photos are taken on the lead page", photosIn);
  await page.reload();
  await settle(page);
  check("with everything in, To be completed is gone from the lead page", (await toBeCompleted(page)) === null);
  const afterA = await barOf(page);
  check("and the bar drops to 1 booking to finish", afterA?.count === "1" && afterA.text.startsWith("1 booking to finish"), JSON.stringify(afterA));

  // ---------------------------------------------------------------- finishing booking B
  await openPanel(page);
  const onlyB = await panelBookings(page);
  check("the panel lists only B now", onlyB.length === 1 && onlyB[0].meeting === meetingB.id, onlyB.map((row) => row.meeting).join(","));
  await panelItem(page, meetingB.id, "address").click();
  await page.waitForURL((current) => current.pathname === `/app/leads/${leadB}/edit` && current.hash === "#lead-address", { timeout: 20000 });
  await settle(page);
  await page.locator("#lead-address").waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  const addressLanding = await landing(page, "lead-address");
  const addressSelected = await page.evaluate(() => {
    const input = document.getElementById("lead-address");
    return input ? input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0) : null;
  });
  check(
    "Address lands on the address field, focused, with Address to come selected",
    addressLanding.inView && addressLanding.uncovered && addressLanding.focused === "lead-address" && addressSelected === ADDRESS_TO_COME,
    `${JSON.stringify(addressLanding)}; selected "${addressSelected}"`,
  );
  await page.keyboard.type(ADDRESS_B);
  await page.keyboard.press("Escape");
  check("typing replaces Address to come", (await page.inputValue("#lead-address")) === ADDRESS_B, await page.inputValue("#lead-address"));
  await page.getByRole("heading", { name: "Edit lead" }).click();
  await page.getByRole("button", { name: "Use where I'm standing" }).click();
  await page.getByText(/accurate to about 10 m/).first().waitFor({ timeout: 20000 });
  await saveEdit(page, leadB);
  const placedB = await leadRow(leadB);
  const afterAddress = await toBeCompleted(page);
  const topB = squash(await page.getByTestId("lead-address-top").innerText().catch(() => ""));
  check(
    "the address saves with its map position, the flag clears, the top of the page shows it, and the count drops from 7 to 6",
    placedB?.address_line === ADDRESS_B && placedB?.address_to_come === false && placedB?.lat !== null && topB.startsWith(ADDRESS_B) && afterAddress?.summary === "To be completed (6)",
    `${JSON.stringify(placedB)}; ${topB}; ${afterAddress?.summary}`,
  );
  await page.getByTestId("to-be-completed-summary").click();
  await page.locator('[data-testid="to-be-completed"] li[data-item="phone"] a').click();
  await page.waitForURL((current) => current.pathname === `/app/leads/${leadB}/edit` && current.hash === "#lead-phone", { timeout: 20000 });
  await settle(page);
  await page.locator("#lead-phone").waitFor({ timeout: 10000 });
  await page.fill("#lead-phone", "403 555 0151");
  await editQuestion(page, "q-owns_home").getByText("Yes", { exact: true }).click();
  await editQuestion(page, "q-christmas_lights_now").getByText("Hires someone", { exact: true }).click();
  await editQuestion(page, "q-looked_into_before").getByText("Got quotes", { exact: true }).click();
  await page
    .locator("main fieldset")
    .filter({ has: page.locator("legend", { hasText: new RegExp(`^${escape(SOFFIT_LEGEND)}$`) }) })
    .getByText("White", { exact: true })
    .click();
  await saveEdit(page, leadB);
  const afterRestB = await toBeCompleted(page);
  check("the rest in one save leaves only the photos: 1", afterRestB?.summary === "To be completed (1)", afterRestB?.summary);
  const stillB = await barOf(page);
  check("the bar still says 1 booking to finish", stillB?.count === "1", JSON.stringify(stillB));
  const photosInB = await uploadGuidedPhotos(page, leadB);
  check("B's three guided photos are taken", photosInB);
  await page.reload();
  await settle(page);
  check("B's To be completed is gone", (await toBeCompleted(page)) === null);
  check("and with nothing left to finish, the bar clears itself", (await barOf(page, false)) === null);
  for (const [name, path] of [["Home", "/app"], ["Schedule", "/app/schedule"], ["Leads", "/app/leads"], ["Session", "/app/session"]]) {
    await goTab(page, name, path);
    check(`no bar on ${name} once everything is in`, (await barOf(page, false)) === null);
  }
  await page.screenshot({ path: `${out}/bn-home-clear-430.png` });
  const doneA = await leadRow(leadA);
  const doneB = await leadRow(leadB);
  check(
    "both leads stay booked, with every item in",
    doneA?.status === "meeting_booked" && doneB?.status === "meeting_booked" && doneA?.phone_saved && doneB?.phone_saved && doneB?.owns_home === true && doneA?.soffit_colour === "not_sure" && doneB?.soffit_colour === "white",
    `${JSON.stringify(doneA)} | ${JSON.stringify(doneB)}`,
  );
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)} at ${page.url()}`);
  await page.screenshot({ path: `${out}/bn-failure.png`, fullPage: true }).catch(() => {});
} finally {
  if (narrowContext) await narrowContext.close().catch(() => {});
  await removeEverything();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const leftoverUsers = (list?.users ?? []).filter((u) => (u.email ?? "").startsWith("bn-live-"));
  const { count: namedLeft } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("first_name", TEST_LEAD);
  const { count: placedLeft } = await admin.from("leads").select("id", { count: "exact", head: true }).ilike("address_line", "%Finish Later Way%");
  const leftoverLeads = (namedLeft ?? 0) + (placedLeft ?? 0);
  const { count: leftoverHolds } = setter.id
    ? await admin.from("slot_holds").select("id", { count: "exact", head: true }).eq("holder_id", setter.id)
    : { count: 0 };
  check(
    "the throwaway setter, their leads, holds, meetings and photos are gone",
    leftoverUsers.length === 0 && leftoverLeads === 0 && (leftoverHolds ?? 0) === 0,
    `${leftoverUsers.length} accounts, ${leftoverLeads} test leads, ${leftoverHolds} holds`,
  );
  results.push(`accounts remaining: ${JSON.stringify((list?.users ?? []).map((u) => u.email))}`);
  await browser.close();
}

console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
