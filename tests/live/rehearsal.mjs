// One full rehearsal of a meeting (round 12 part 3, Keenan, 2026-11-11),
// done twice, against a running build: the prep list, mockups uploaded,
// the quote measured on the drawings with three offers, the deck from the
// cover to a yes with initials, then the customer's link and the Accepted
// sheet. Once with no Black Friday deal, once with a dollars-off deal, and
// the deal set back to None at the end.
//
// Keenan's words: "Walk a whole meeting on a marked test lead, the way
// Keenan would: prep list, mockups uploaded, quote measured on the drawing
// with three offers, the deck from Cover to a yes with initials, then the
// customer's link and the Accepted sheet. Do it once with no Black Friday
// and once with a dollars-off deal, then set the deal back to None. Report
// anything that felt slow, awkward or confusing in plain words, even if it
// isn't a bug. Remove every test record afterwards and say so."
//
// Like black-friday-walkthrough.mjs, this one WRITES with the owner's
// one-time session (owner-session.mjs), on marked test records only, with
// Keenan's leave. Everything it makes is marked: a test setter and a test
// host named "TEST Rehearsal ...", leads named "TEST LEAD (rehearsal)" with
// "(TEST)" in the address. The meetings are booked by the test setter on the
// test host through book_meeting, so no real evening is touched. The
// customer's link is issued by the service role and handed to the setter,
// so a Book my install notice never reaches Keenan's phone. Nothing in
// Settings changes but the Black Friday deal, and that goes back to None in
// a finally, through the Settings form, else through the service role.
//
// It is not a -walkthrough.mjs on purpose: it writes Settings, so the daily
// suite never runs it. It refuses to start while a deal is already set (a
// NOTE, exit 0, nothing changed).
//
// Every page load and every step is timed, and the NOTES block at the end
// says in plain words what was slow (over about 3 seconds), what needed
// scrolling or many taps, and anything that failed, with the screenshot
// name. The REMOVED block names everything removed, and the last line says
// the Settings deal, which must be None.
//
// With SHOTS set to a folder, screenshots are saved there in order. BASE
// and OUT as in the other walk-throughs.
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";
import { deckLine, deckOrder, fillLine } from "./deck-order.mjs";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const shots = process.env.SHOTS ?? null;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The rehearsal needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const BUCKET = "lead-photos";
const DEAL = "Black Friday";
const DOLLARS = 300;
const INITIALS = "TB";
const SLOW_MS = 3000;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const setter = { email: `rehearsal-${stamp}@example.com`, password: `cedar-lantern-orbit-${digits}`, name: "TEST Rehearsal Setter", id: null, client: null };
const host = { email: `rehearsal-${stamp}-host@example.com`, password: `maple-harbor-stone-${digits}`, name: "TEST Rehearsal Host", id: null };
const LEAD_NAME = "TEST LEAD (rehearsal)";

const IPAD = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };

// The house as measured on the drawings: four areas, 214 ft in all.
const FEET = { front_lower: 64, front_upper: 40, back_lower: 50, sides_lower: 60 };
const TOTAL_FEET = Object.values(FEET).reduce((sum, feet) => sum + feet, 0);
// The third offer's long name (the editor allows 20 characters).
const LONG_NAME = "Front, garage, porch";

// ---------------------------------------------------------------- words and dates

const calgaryZone = (moment) => (moment.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton");
const calgaryDay = (moment = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(moment), year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
const longDay = (day) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
// lib/pricing.ts formatMoney: whole dollars when there are no cents.
const money = (amount) => {
  const cents = Math.round(Math.abs(amount) * 100);
  const text = (cents / 100).toLocaleString("en-CA", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}$${text}`;
};
// Text as the checks compare it: spaces collapsed, curly apostrophes straight.
const flat = (text) => (text ?? "").replace(/\s+/g, " ").replace(/[‘’]/g, "'").trim();
// The first dollar figure in a piece of text, as a number (NaN with none).
const dollarsIn = (text) => {
  const found = (text ?? "").match(/\$[\d,]+(?:\.\d{2})?/);
  return found ? Number(found[0].replace(/[$,]/g, "")) : NaN;
};
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
// A page's address with the customer's token hidden: no token is ever printed.
const safeUrl = (page) => (page ? page.url().replace(/\/q\/[^/?#]+/, "/q/<token>") : "");

// ---------------------------------------------------------------- timing and notes

// Every page load and step, timed with Date.now(); the NOTES block reads
// these. A step counts its taps too.
const timings = [];
let currentPass = "";
let currentStep = null;
let taps = 0;
function startStep(label) {
  endStep();
  currentStep = { label, from: Date.now() };
  taps = 0;
}
function endStep() {
  if (!currentStep) return;
  timings.push({ kind: "step", pass: currentPass, label: currentStep.label, ms: Date.now() - currentStep.from, taps });
  currentStep = null;
}
// A page load: from the navigation to the key element visible.
async function loaded(label, go) {
  const from = Date.now();
  await go();
  const ms = Date.now() - from;
  timings.push({ kind: "page", pass: currentPass, label, ms });
  return ms;
}
// A tap as Keenan makes it, counted for the step.
async function tap(locator, options = {}) {
  taps += 1;
  await locator.click(options);
}
// A tap on a line of the drawn house, a given way along its stroke (the
// middle by default), where a finger would land, not the centre of its box
// (a bent line's box centre can be off the line).
async function tapLine(locator, along = 0.5) {
  const point = await locator.evaluate((g, fraction) => {
    const path = g.querySelector("path");
    const at = path.getPointAtLength(path.getTotalLength() * fraction);
    const m = path.getScreenCTM();
    return { x: at.x * m.a + at.y * m.c + m.e, y: at.x * m.b + at.y * m.d + m.f };
  }, along);
  taps += 1;
  await page.mouse.click(point.x, point.y);
}
// Where the focus landed, by its label.
const focusedLabel = (page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
// Plain-words observations gathered on the way, for the NOTES block.
const observations = [];
const observe = (text) => observations.push(`${currentPass ? `${currentPass}: ` : ""}${text}`);
const failures = [];

// ---------------------------------------------------------------- page helpers

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}

const dots = (page) => page.locator('ol[aria-label="Where you are"]');

async function goToScreen(page, label) {
  await tap(dots(page).getByRole("button", { name: label, exact: true }));
  await page
    .waitForFunction(
      (want) => document.querySelector('ol[aria-label="Where you are"] button[aria-current="true"]')?.getAttribute("aria-label") === want,
      label,
      { timeout: 10000 },
    )
    .catch(() => {});
  await page.waitForTimeout(700);
}

let shotNumber = 0;
const shotNames = [];
async function shot(page, name, options = {}) {
  if (!shots) return null;
  shotNumber += 1;
  const file = `${String(shotNumber).padStart(2, "0")}-${currentPass ? `${currentPass}-` : ""}${name}.png`;
  await page.screenshot({ path: `${shots}/${file}`, ...options }).catch((error) => note(`screenshot ${file} failed: ${error.message.slice(0, 80)}`));
  shotNames.push(file);
  return file;
}
// A check that names its screenshot when it fails.
async function checkShot(page, label, ok, detail = "", shotName = "failure") {
  if (ok) {
    check(label, true, detail);
    return;
  }
  const file = await shot(page, shotName);
  failures.push(`${label}${file ? ` (see ${file})` : ""}${detail ? `: ${detail}` : ""}`);
  check(label, false, `${detail}${file ? ` | ${file}` : ""}`);
}

// An element's text, or "" when it isn't there (no waiting for it).
async function textOf(locator) {
  if ((await locator.count()) === 0) return "";
  return flat(await locator.first().innerText().catch(() => ""));
}

// Polls fn every `every` ms until it returns something truthy, or the time
// runs out; then the last answer.
async function until(fn, timeoutMs, every = 1000) {
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, every));
  }
  return last;
}

// Where an element sits on the iPad: how far its top is below the fold (0
// when it is on screen), for the "needed scrolling" notes.
async function belowFold(page, locator) {
  const box = await locator.first().boundingBox().catch(() => null);
  if (!box) return null;
  const height = page.viewportSize()?.height ?? 820;
  return Math.max(0, Math.round(box.y - height));
}

// ---------------------------------------------------------------- data helpers

const dealInDb = async () => {
  const { data } = await admin.from("settings").select("black_friday_kind, black_friday_value").eq("id", 1).single();
  return data ?? {};
};

// The lead's newest quote, with what the checks read.
async function quoteFor(leadId) {
  const { data } = await admin
    .from("quotes")
    .select("id, status, runs, offers, discounts, meeting_offer, meeting_install_on, accepted_offer, subtotal, total, valid_until, updated_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function mockupRows(leadId) {
  const { data } = await admin
    .from("lead_mockups")
    .select("id, storage_path, name, is_main, offer_ids, position, created_by, removed_at")
    .eq("lead_id", leadId)
    .order("position");
  return data ?? [];
}

const dealLines = (discounts) => (Array.isArray(discounts) ? discounts : []).filter((line) => line && line.label === DEAL);

// A house drawing, lit, in a tint of its own per picture, as a JPEG.
async function housePicture(tint) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1800">
    <rect width="2400" height="1800" fill="#9fb4c4"/>
    <rect y="1300" width="2400" height="500" fill="#6f7f5a"/>
    <polygon points="840,560 1400,250 1960,560" fill="#4a4f55"/>
    <rect x="900" y="560" width="1000" height="760" fill="#d9d2c4"/>
    <rect x="200" y="950" width="740" height="370" fill="#cfc6b5"/>
    <rect x="300" y="1030" width="540" height="290" fill="#8d8a84"/>
    <rect x="1240" y="1050" width="160" height="270" fill="#5b4636"/>
    <rect x="1000" y="700" width="200" height="180" fill="#3c4a55"/>
    <rect x="1600" y="700" width="200" height="180" fill="#3c4a55"/>
  </svg>`;
  const house = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  return sharp(house).modulate({ brightness: 0.4 }).tint(tint).jpeg().toBuffer();
}

// ---------------------------------------------------------------- staging

async function makeUser(person, role = "sales") {
  const { data, error } = await admin.auth.admin.createUser({
    email: person.email,
    password: person.password,
    email_confirm: true,
    user_metadata: { full_name: person.name },
    app_metadata: { role },
  });
  if (error) throw new Error(`createUser ${person.email}: ${error.message}`);
  person.id = data.user.id;
}

async function signedIn(person) {
  const client = createClient(url, anonKey, noSession);
  const { error } = await client.auth.signInWithPassword({ email: person.email, password: person.password });
  if (error) throw new Error(`sign in ${person.email}: ${error.message}`);
  return client;
}

// A lead made by the setter with the six questions answered, no photos
// (the three are skipped with a reason at booking), and a map position.
async function stageLead({ number, everyone }) {
  const address = `${number} Rehearsal Street NW (TEST) ${stamp}`;
  const lead = await admin
    .from("leads")
    .insert({
      first_name: LEAD_NAME,
      last_name: stamp,
      address_line: address,
      neighbourhood: "TEST (automated)",
      created_by: setter.id,
      phone: "+14035550100",
      owns_home: true,
      wants_price: true,
      both_decision_makers: everyone,
      christmas_lights_now: "hires",
      looked_into_before: "new_to_them",
      soffit_colour: "off_white",
      lat: 51.0447,
      lng: -114.0719,
      position_source: "picked",
    })
    .select("id")
    .single();
  if (lead.error) throw new Error(`lead ${number}: ${lead.error.message}`);
  return { leadId: lead.data.id, address, everyone, meetingId: null, startsAt: null, quoteId: null, linkId: null, quoteUrl: null, offers: null };
}

// Open times on the test host, as the setter sees them: today's first, at
// least 45 minutes away (the setter cutoff is 30), else the next evening's.
async function openTimes() {
  const { data, error } = await setter.client.rpc("schedule_board", { p_host: host.id });
  if (error) throw new Error(`schedule_board: ${error.message}`);
  const soon = Date.now() + 45 * 60_000;
  return (data ?? [])
    .filter((row) => row.state === "open" && new Date(row.starts_at).getTime() > soon)
    .map((row) => row.starts_at)
    .sort();
}

// The setter books the lead on the test host, the three photos skipped
// because the homeowner said no.
async function bookAsSetter(lead, startsAt) {
  const { data, error } = await setter.client.rpc("book_meeting", {
    p_lead_id: lead.leadId,
    p_starts_at: startsAt,
    p_everyone_deciding_present: lead.everyone,
    p_photos_skipped: "homeowner_said_no",
    p_photos_skip_note: null,
    p_host: host.id,
  });
  if (error) throw new Error(`book_meeting: ${error.message}`);
  lead.meetingId = data;
  lead.startsAt = startsAt;
}

// ---------------------------------------------------------------- the owner's side

let session = null;
let page = null;
let browser = null;

// A fresh context on the owner's one-time session.
async function ownerPage(device = IPAD) {
  const context = await browser.newContext(device);
  session = await openOwnerSession({ url, anonKey, admin, base, context });
  const opened = await context.newPage();
  return { context, page: opened };
}
async function closeOwner(context) {
  if (session) await session.close().catch(() => {});
  session = null;
  await context.close().catch(() => {});
}

// Settings: the Black Friday deal set through the form. True when the form
// said "Saved at".
async function setDealInSettings(where, kind, value = "") {
  await loaded("Settings", async () => {
    await where.goto(`${base}/app/admin/settings`);
    await where.locator("#settings-black_friday_kind").waitFor({ timeout: 30000 });
  });
  await settle(where);
  await where.locator("#settings-black_friday_kind").selectOption(kind);
  if (kind !== "none") await where.locator("#settings-black_friday_value").fill(String(value));
  await tap(where.getByRole("button", { name: "Save settings", exact: true }));
  const saved = where.getByRole("status").filter({ hasText: "Saved at" });
  await saved.waitFor({ timeout: 30000 }).catch(() => {});
  return (await saved.count()) > 0;
}

// Your price's option rows: the id, what's on screen and chosen, the regular
// price struck through (null without one) and the price shown.
const priceRows = (region) =>
  region.getByTestId("price-option").evaluateAll((buttons) =>
    buttons.map((button) => ({
      id: button.getAttribute("data-option"),
      onScreen: button.getAttribute("data-on-screen"),
      chosen: button.getAttribute("data-chosen"),
      regular: button.querySelector('[data-testid="price-option-regular"]')?.textContent ?? null,
      // Round 13: "Already at our lowest price." under an option the deal can't lower.
      lowest: button.querySelector('[data-testid="price-option-lowest"]')?.textContent ?? null,
      total: button.querySelector('[data-testid="price-option-total"]')?.textContent ?? "",
      name: button.querySelector('[data-testid="price-option-name"]')?.textContent ?? button.textContent ?? "",
    })),
  );

// A yes on an option: it goes on screen, Choose is tapped, the initials
// layer takes the initials and Confirm, and the quiet save follows.
async function sayYes(region, offerId, offerName, deck) {
  await tap(region.locator(`[data-testid="price-option"][data-option="${offerId}"]`));
  await page.waitForTimeout(600);
  const choose = region.getByTestId("price-choose");
  const chooseText = flat(await choose.innerText().catch(() => ""));
  check(`Choose reads "Choose ${offerName}" with it on screen`, chooseText === fillLine(deckLine(deck, "choose"), { name: offerName }), chooseText);
  await tap(choose);
  const initials = page.getByTestId("price-initials");
  const opened = await initials
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (opened) {
    await page.locator("#price-initials-field").fill(INITIALS);
    await page.waitForTimeout(200);
    await tap(initials.getByRole("button", { name: "Confirm" }));
    await initials.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(600);
  return opened;
}

// The customer's link at 390, with no session: the rows and the hero total.
const linkRows = (where) =>
  where.getByTestId("option-row").evaluateAll((rows) =>
    rows.map((row) => ({
      offer: row.getAttribute("data-offer"),
      selected: row.getAttribute("data-selected") === "true",
      tagged: Boolean(row.querySelector('[data-testid="option-meeting-tag"]')),
      total: row.querySelector('[data-testid="option-total"]')?.textContent ?? "",
    })),
  );
const heroTotal = async (where) => dollarsIn(await where.getByTestId("hero-total").innerText().catch(() => ""));

// ---------------------------------------------------------------- the run

// Refuse to start while a deal is already set: nothing is changed.
{
  const current = await dealInDb();
  if (current.black_friday_kind !== null && current.black_friday_kind !== undefined) {
    console.log(`NOTE Settings already has a Black Friday deal (${current.black_friday_kind} ${current.black_friday_value}), so this rehearsal did not start and changed nothing. Set the deal to None in Settings and run it again.`);
    process.exit(0);
  }
}

await mkdir(out, { recursive: true });
if (shots) await mkdir(shots, { recursive: true });
browser = await chromium.launch();
let dealTouched = false;
const leads = { plain: null, deal: null };
let ownerId = null;
let settings = null;
let white = null;
// Pricing from Settings, for the expected totals.
let ppf = 0;
let boxPrice = 0;
let upperFee = 0;
let minimum = 0;
let rate = 0;

// An option's total as lib/pricing.ts prices it here: the lights at the
// quote's price a foot, the control box, upper access once an upper area is
// in, the deal off, then lifted to the minimum when it falls under.
function priced(feet, upperIn, deal) {
  const before = Math.max(0, feet * ppf + boxPrice + (upperIn ? upperFee : 0) - deal);
  return minimum > before ? minimum : before;
}

// ---------------------------------------------------------------- one pass

// A whole meeting on one lead, as Keenan would run it. deal is 0 or the
// dollars off already set in Settings.
async function rehearse(lead, { deal, tag, chooseName, bookName, pickDay }) {
  currentPass = tag;
  const everyoneLine = lead.everyone ? null : "Someone who decides won't be there.";
  const meetingDay = calgaryDay(new Date(lead.startsAt));
  const today = calgaryDay();
  const tonight = meetingDay === today;
  const owner = await ownerPage();
  page = owner.page;
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 120)));
  const deck = settings.deck;
  const order = deckOrder(settings, { lead: { main: true, day: false, night: false, scenes: 0 } });
  const PRICE = order.find((item) => item.key === "quote")?.label ?? "Your price";
  const NEXT = order.find((item) => item.key === "next_steps")?.label ?? "What happens next";
  const prepUrl = `${base}/app/meetings/prep/${lead.leadId}`;
  const leadUrl = `${base}/app/leads/${lead.leadId}`;

  // ---------------------------------------------------------------- 1. the prep list
  startStep("Prep list, read");
  await loaded("Prep page", async () => {
    await page.goto(prepUrl);
    await page.getByTestId("prep-list").waitFor({ timeout: 30000 });
  });
  await settle(page);
  const items = await page.getByTestId("prep-list").locator("> li").evaluateAll((rows) => rows.map((row) => `${row.getAttribute("data-testid")}:${row.getAttribute("data-done")}`));
  const status = flat(await page.getByTestId("prep-status").innerText().catch(() => ""));
  const when = flat(await page.getByTestId("prep-when").innerText().catch(() => ""));
  await checkShot(
    page,
    "the prep list opens with its five items, the first three to do, the time to confirm, and all six answers in",
    JSON.stringify(items) === JSON.stringify(["prep-item-quote:false", "prep-item-confirmed:false", "prep-item-mockup:false", "prep-item-track_colour:false", "prep-item-answers:true"]) &&
      status === "Prepare for the meeting: 4 left",
    `${items.join(", ")} | ${status}`,
    "prep-list-items",
  );
  check("the prep page says when the meeting is, on the test host", /\d{1,2}:\d{2} [ap]\.m\./.test(when), when);
  const everyoneOnPrep = await textOf(page.getByTestId("everyone-deciding"));
  await checkShot(
    page,
    everyoneLine
      ? 'everyone-deciding: the prep page says "Someone who decides won\'t be there." for the lead that answered No'
      : "everyone-deciding: the prep page shows no line for the lead that answered Yes",
    everyoneLine ? everyoneOnPrep === everyoneLine : (await page.getByTestId("everyone-deciding").count()) === 0,
    everyoneOnPrep || "no line",
    "prep-everyone-deciding",
  );
  for (const [what, id] of [["the track colour item", "prep-item-track_colour"], ["the quote item", "prep-item-quote"], ["the time to confirm", "prep-item-confirmed"]]) {
    const below = await belowFold(page, page.getByTestId(id));
    if (below !== null && below > 0) observe(`on the prep page at 1180 x 820, ${what} starts ${below} px below the fold, so Keenan scrolls to it`);
  }
  await shot(page, "prep-list");

  // ---------------------------------------------------------------- 2. the track colour, on the prep page
  startStep("Track colour on the prep page");
  const colourForm = page.getByTestId("prep-item-track_colour").getByTestId("track-colour-form");
  await colourForm.scrollIntoViewIfNeeded().catch(() => {});
  await tap(colourForm.locator("label").filter({ hasText: /^White$/ }));
  await tap(colourForm.getByRole("button", { name: "Save track colour" }));
  const savedColour = colourForm.getByRole("status").filter({ hasText: "Saved." });
  await savedColour.waitFor({ timeout: 20000 }).catch(() => {});
  const { data: coloured } = await admin.from("leads").select("track_colour_id").eq("id", lead.leadId).single();
  await checkShot(page, "White is set as the track colour from the prep page, and the form says Saved.", (await savedColour.count()) === 1 && coloured?.track_colour_id === white.id, `${coloured?.track_colour_id === white.id ? "White saved" : "not saved"}`, "track-colour");
  await shot(page, "prep-track-colour-saved");

  // ---------------------------------------------------------------- 3. the quote, measured on the drawings
  startStep("Draft the quote: measure and three offers");
  const prepQuote = page.getByTestId("prep-quote");
  check("prep's Draft the quote opens the lead page's editor", (await prepQuote.innerText()).trim() === "Draft the quote" && (await prepQuote.getAttribute("href")) === `/app/leads/${lead.leadId}#edit-quote`);
  const sheet = page.getByTestId("quote-sheet");
  await loaded("Lead page with the quote editor open (from prep)", async () => {
    await tap(prepQuote);
    await sheet.waitFor({ state: "visible", timeout: 30000 });
    await sheet.getByTestId("quote-editor").waitFor({ timeout: 30000 });
  });
  await page.waitForTimeout(500);
  // A finger near where the upper gable meets the upper line: a quarter of
  // the way along the Front upper line sits under the gable's foot.
  {
    const upper = sheet.locator('[data-testid="house-line"][data-area="front_upper"]').first();
    await upper.scrollIntoViewIfNeeded().catch(() => {});
    await tapLine(upper, 0.25);
    await page.waitForTimeout(200);
    const landed = await focusedLabel(page);
    if (landed !== "Front upper feet") observe(`in the quote editor, a tap a quarter of the way along the Front upper line (close to where the upper gable's foot meets it) landed in the "${landed || "no"}" box, not Front upper's; the gable's tap area wins where the two lines touch. A tap on the middle of the line lands right.`);
  }
  // Each area: a tap on the middle of its line on the drawing, the feet typed, Tab.
  const measuredBy = [];
  for (const [key, feet] of Object.entries(FEET)) {
    const line = sheet.locator(`[data-testid="house-line"][data-area="${key}"]`).first();
    await line.scrollIntoViewIfNeeded().catch(() => {});
    await tapLine(line);
    await page.waitForTimeout(200);
    const focused = await focusedLabel(page);
    measuredBy.push(`${key}: ${focused || "nothing focused"}`);
    const box = sheet.getByLabel(`${areaLabel(key)} feet`, { exact: true });
    await box.fill(String(feet));
    await box.press("Tab");
    await page.waitForTimeout(250);
  }
  const feetLine = flat(await sheet.getByTestId("editor-feet").innerText().catch(() => ""));
  await checkShot(
    page,
    "tapping each line on the drawings lands in that area's feet box; four areas typed, 214 ft measured",
    measuredBy.every((entry, at) => entry.endsWith(`${areaLabel(Object.keys(FEET)[at])} feet`)) && feetLine === `${TOTAL_FEET} ft measured`,
    `${measuredBy.join("; ")} | ${feetLine}`,
    "editor-measured",
  );
  const offersBelow = await belowFold(page, sheet.locator("#editor-offers"));
  if (offersBelow !== null && offersBelow > 0) observe(`in the quote editor at 1180 x 820, the Offers section starts ${offersBelow} px below the fold once the four views are drawn, so Keenan scrolls to add offers`);
  await shot(page, "editor-measured");
  // Three offers: the full wrap the editor starts with, then two quick starts.
  check("with areas measured the editor shows one Full wrap offer", (await sheet.getByTestId("offer-card").count()) === 1 && flat(await sheet.getByTestId("offer-name").first().inputValue()) === "Full wrap");
  await sheet.locator("#editor-offers").scrollIntoViewIfNeeded().catch(() => {});
  for (const kind of ["front_lower", "full_front"]) {
    await tap(sheet.getByTestId("add-offer"));
    await sheet.getByTestId("quick-starts").waitFor({ timeout: 5000 });
    await tap(sheet.getByTestId(`quick-start-${kind}`));
    await page.waitForTimeout(300);
  }
  const names = async () => sheet.getByTestId("offer-name").evaluateAll((inputs) => inputs.map((input) => input.value));
  check("two quick starts make three offers: Full wrap, Front lower only, Full front", JSON.stringify((await names()).sort()) === JSON.stringify(["Front lower only", "Full front", "Full wrap"]), (await names()).join(" | "));
  // One renamed to a long name, as Keenan would name a real offer.
  const nameInputs = sheet.getByTestId("offer-name");
  let frontName = null;
  for (let at = 0; at < (await nameInputs.count()); at += 1) {
    if ((await nameInputs.nth(at).inputValue()) === "Front lower only") frontName = nameInputs.nth(at);
  }
  if (!frontName) throw new Error("no offer named Front lower only to rename");
  await frontName.fill(LONG_NAME);
  await frontName.press("Tab");
  await page.waitForTimeout(400);
  check(`the offer renamed to "${LONG_NAME}" keeps the whole name (the editor allows 20 characters)`, (await names()).includes(LONG_NAME), (await names()).join(" | "));
  const cardTotals = await sheet.getByTestId("offer-card").evaluateAll((cards) =>
    cards.map((card) => ({ name: card.querySelector('[data-testid="offer-name"]')?.value ?? "", total: card.querySelector('[data-testid="offer-total"]')?.textContent ?? "" })),
  );
  const expected = { "Full wrap": priced(TOTAL_FEET, true, 0), "Full front": priced(FEET.front_lower + FEET.front_upper, true, 0), [LONG_NAME]: priced(FEET.front_lower, false, 0) };
  const totalsRight = Object.entries(expected).every(([name, total]) => dollarsIn(cardTotals.find((card) => card.name === name)?.total ?? "") === total);
  await checkShot(page, "each offer's total prices from Settings: the lights, the control box, upper access on the two with the upper front", totalsRight, `${JSON.stringify(cardTotals)} expected ${JSON.stringify(expected)}`, "editor-offers");
  await shot(page, "editor-offers");
  const saveButton = sheet.getByTestId("quote-sheet-save");
  check("Save is ready once there are feet to price", await saveButton.isEnabled());
  await loaded("Quote save (the sheet's Save)", async () => {
    await tap(saveButton);
    await page.waitForFunction(() => /Saved \d/.test(document.querySelector('[data-testid="quote-sheet-status"]')?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
  });
  const sheetStatus = flat(await sheet.getByTestId("quote-sheet-status").innerText().catch(() => ""));
  const sheetMessage = flat(await sheet.getByTestId("quote-sheet-message").innerText().catch(() => ""));
  const quote = await until(async () => {
    const row = await quoteFor(lead.leadId);
    return row && Array.isArray(row.offers) && row.offers.length === 3 ? row : null;
  }, 20000);
  lead.quoteId = quote?.id ?? null;
  lead.offers = quote?.offers ?? null;
  await checkShot(
    page,
    "Save writes the quote: three offers, four runs, the sheet says Saved at the time",
    quote !== null && Array.isArray(quote.runs) && quote.runs.length === 4 && /^Saved \d/.test(sheetStatus),
    `${sheetStatus}${sheetMessage ? ` | ${sheetMessage}` : ""} | ${quote ? `${quote.runs?.length} runs, ${quote.offers?.length} offers` : "no quote"}`,
    "editor-saved",
  );
  await tap(sheet.getByTestId("quote-sheet-close"));
  await sheet.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  check("Close after saving closes the sheet at once", !(await sheet.isVisible().catch(() => false)));
  const offerId = (name) => lead.offers?.find((offer) => offer.name === name)?.id ?? null;

  // ---------------------------------------------------------------- 4. the mockups, through the lead page's card
  startStep("Mockups uploaded and marked");
  // The page read again, so the card knows the saved offers.
  await loaded("Lead page", async () => {
    await page.goto(leadUrl);
    await page.getByTestId("mockup-card").waitFor({ timeout: 30000 });
  });
  await settle(page);
  for (const [what, id] of [["the Mockups card", "mockup-card"], ["the Quote card", "quote-summary"], ["the Customer's link card", "quote-card"], ["the outcome card", "quote-outcome"]]) {
    const below = await belowFold(page, page.getByTestId(id));
    if (below !== null && below > 0) observe(`on the lead page at 1180 x 820, ${what} starts ${below} px below the fold`);
  }
  const card = page.getByTestId("mockup-card");
  await card.scrollIntoViewIfNeeded().catch(() => {});
  const pictures = [
    { name: "Warm white", tint: "#1d3445", offer: null },
    { name: "Full wrap", tint: "#2a3f52", offer: "Full wrap" },
    { name: "Full front", tint: "#3b4a2f", offer: "Full front" },
    { name: LONG_NAME, tint: "#4a3a2f", offer: LONG_NAME },
  ];
  const files = [];
  for (const [at, picture] of pictures.entries()) files.push({ name: `house-${at + 1}.jpg`, mimeType: "image/jpeg", buffer: await housePicture(picture.tint) });
  const uploadMs = await loaded("Four mockups uploaded through the card", async () => {
    taps += 1;
    await page.getByTestId("mockup-input").setInputFiles(files);
    await until(async () => ((await mockupRows(lead.leadId)).filter((row) => !row.removed_at).length === 4 ? true : null), 120000, 1500);
    await page.getByTestId("mockup-uploading").first().waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
    for (let i = 0; i < 60 && (await page.getByTestId("mockup-tile").count()) < 4; i += 1) await page.waitForTimeout(500);
  });
  const tiles = page.getByTestId("mockup-tile");
  await checkShot(page, "four pictures upload as four tiles, the first one the Main", (await tiles.count()) === 4 && (await tiles.first().getByTestId("mockup-role-main").getAttribute("aria-pressed")) === "true", `${await tiles.count()} tiles in ${seconds(uploadMs)}`, "mockups-uploaded");
  // Each named in the Mockups card.
  for (const [at, picture] of pictures.entries()) {
    const tile = tiles.nth(at);
    const nameBox = tile.getByTestId("mockup-name");
    await nameBox.fill(picture.name);
    await nameBox.press("Enter");
    taps += 1;
    await until(async () => ((await mockupRows(lead.leadId)).filter((row) => !row.removed_at)[at]?.name === picture.name ? true : null), 15000, 500);
  }
  // Round 13: an offer's picture is set in one place, the photo spot on its
  // card in the quote editor. The Mockups card marks Main, Day, Night or a
  // phone scene only, and says which offers use each picture.
  check("the Mockups card has no offer chips any more", (await page.getByTestId("mockup-offer").count()) === 0);
  await page.reload();
  await page.getByTestId("edit-quote").waitFor({ timeout: 30000 });
  await settle(page);
  await tap(page.getByTestId("edit-quote"));
  await page.getByTestId("quote-sheet").waitFor({ timeout: 15000 });
  const named = (await mockupRows(lead.leadId)).filter((row) => !row.removed_at);
  for (const [at, picture] of pictures.entries()) {
    if (!picture.offer) continue;
    const offerCard = page.locator(`[data-testid="offer-card"][aria-label="${picture.offer}"]`);
    await offerCard.scrollIntoViewIfNeeded().catch(() => {});
    await tap(offerCard.getByTestId("offer-photo-pick"));
    await tap(offerCard.locator(`[data-testid="offer-photo-choice"][data-mockup="${named[at]?.id}"]`));
    const wanted = offerId(picture.offer);
    await until(async () => ((await mockupRows(lead.leadId)).filter((row) => !row.removed_at)[at]?.offer_ids ?? []).includes(wanted) ? true : null, 15000, 500);
  }
  await shot(page, "offer-pictures-picked");
  await tap(page.getByTestId("quote-sheet-close"));
  await page.getByTestId("quote-sheet").waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  await page.reload();
  await page.getByTestId("mockup-card").waitFor({ timeout: 30000 });
  await settle(page);
  const usedBy = await page.getByTestId("mockup-used-by").allInnerTexts();
  check(
    "each mockup says which offers use it: the Main none (every offer has its own), each of the others its offer",
    usedBy.length === 4 && usedBy[0] === "No offer uses it." && pictures.slice(1).every((picture, at) => usedBy[at + 1] === `Used by ${picture.offer}.`),
    JSON.stringify(usedBy),
  );
  const rows = (await mockupRows(lead.leadId)).filter((row) => !row.removed_at);
  await checkShot(
    page,
    "each mockup is named and the three offers each have their picture, saved on the tap",
    rows.length === 4 &&
      rows[0].is_main === true &&
      rows[0].name === "Warm white" &&
      pictures.slice(1).every((picture, at) => rows[at + 1]?.name === picture.name && (rows[at + 1]?.offer_ids ?? []).includes(offerId(picture.offer))),
    JSON.stringify(rows.map((row) => [row.name, row.is_main, row.offer_ids])),
    "mockups-marked",
  );
  check("the mockups land in Keenan's own folder of lead-photos", rows.every((row) => row.storage_path.startsWith(`${ownerId}/`)));
  await shot(page, "mockups-marked");

  // ---------------------------------------------------------------- 5. the time confirmed, and Ready
  startStep("Confirm the time, and Ready");
  await loaded("Prep page again", async () => {
    await page.goto(prepUrl);
    await page.getByTestId("prep-list").waitFor({ timeout: 30000 });
  });
  await settle(page);
  const smsHref = (await page.getByTestId("prep-text").getAttribute("href").catch(() => null)) ?? "";
  check("Text is there to open Messages with the ready-made text, Call beside it (neither opened here)", smsHref.startsWith("sms:+") && smsHref.includes("body=") && ((await page.getByTestId("prep-call").getAttribute("href").catch(() => "")) ?? "").startsWith("tel:+"), smsHref.slice(0, 12));
  const confirmButton = page.getByTestId("prep-confirm-button");
  await confirmButton.scrollIntoViewIfNeeded().catch(() => {});
  await tap(confirmButton);
  await page.getByTestId("prep-confirmed").waitFor({ timeout: 20000 }).catch(() => {});
  const { data: confirmedRow } = await admin.from("meetings").select("confirmed_at").eq("id", lead.meetingId).single();
  check("Confirmed records the time on the meeting and says so", confirmedRow?.confirmed_at !== null && flat(await page.getByTestId("prep-confirmed").innerText().catch(() => "")).startsWith("Confirmed"));
  await loaded("Prep page, all done", async () => {
    await page.goto(prepUrl);
    await page.getByTestId("prep-list").waitFor({ timeout: 30000 });
  });
  await settle(page);
  const after = await page.getByTestId("prep-list").locator("> li").evaluateAll((items) => items.map((item) => item.getAttribute("data-done")));
  const ready = await page.getByTestId("prep-status").getAttribute("data-ready");
  await checkShot(page, "with the mockup, the colour, the quote, the time and the answers done, the prep page says Ready", after.every((done) => done === "true") && ready === "true" && flat(await page.getByTestId("prep-status").innerText()) === "Ready", `${after.join(", ")} | ${flat(await page.getByTestId("prep-status").innerText())}`, "prep-ready");
  await shot(page, "prep-ready");

  // ---------------------------------------------------------------- 6. the Meetings page and Home (everyone who decides)
  startStep("Meetings page and Home");
  await loaded("Meetings page", async () => {
    await page.goto(`${base}/app/meetings`);
    await page.getByTestId("meetings-tonight").waitFor({ timeout: 30000 });
  });
  await settle(page);
  const item = page.locator(`[data-testid="meeting-item"][data-lead="${lead.leadId}"]`);
  const pick = page.locator(`[data-testid="quick-pick"][data-lead="${lead.leadId}"]`);
  if ((await item.count()) > 0) {
    const line = await textOf(item.first().getByTestId("everyone-deciding"));
    await checkShot(
      page,
      everyoneLine ? `everyone-deciding: the Meetings page's card${tonight ? " tonight" : ""} carries "Someone who decides won't be there."` : "everyone-deciding: the Meetings page's card carries no line for the Yes lead",
      everyoneLine ? line === everyoneLine : (await item.first().getByTestId("everyone-deciding").count()) === 0,
      line || "no line",
      "meetings-everyone-deciding",
    );
    check("the Meetings page's card says the lead is ready and its time confirmed", /Ready/.test(await textOf(item.first().getByTestId("prep-line"))) && (await item.first().getByTestId("confirmed-tick").count()) === 1);
  } else {
    check("the meeting is on the Meetings page, in Next few days", (await pick.count()) === 1);
    note(`everyone-deciding on the Meetings page was not reached for the ${tag} lead: its meeting is ${longDay(meetingDay)}, in Next few days, whose cards carry no everyone line by design (the line is on tonight's and later evenings' cards)`);
  }
  await shot(page, "meetings-page");
  await loaded("Home", async () => {
    await page.goto(`${base}/app`);
    await page.locator(`[data-testid="meeting-card"][data-meeting="${lead.meetingId}"]`).waitFor({ timeout: 30000 }).catch(() => {});
  });
  await settle(page);
  const homeCard = page.locator(`[data-testid="meeting-card"][data-meeting="${lead.meetingId}"]`);
  if ((await homeCard.count()) === 0 && !tonight) {
    // Home shows today and tomorrow; a meeting further out is on Schedule.
    note(`everyone-deciding on Home was not reached for the ${tag} lead: its meeting is ${longDay(meetingDay)}, beyond Home's today and tomorrow`);
  } else {
    const homeLine = await textOf(homeCard.getByTestId("everyone-deciding"));
    await checkShot(
      page,
      everyoneLine ? 'everyone-deciding: Home\'s meeting card carries "Someone who decides won\'t be there."' : "everyone-deciding: Home's meeting card carries no line for the Yes lead",
      (await homeCard.count()) === 1 && (everyoneLine ? homeLine === everyoneLine : (await homeCard.getByTestId("everyone-deciding").count()) === 0),
      homeLine || "no line",
      "home-everyone-deciding",
    );
  }
  await shot(page, "home");

  // ---------------------------------------------------------------- 7. the meeting: cover to a yes
  startStep("Meeting mode, cover to the price");
  await loaded("Meeting mode (#start)", async () => {
    await page.goto(`${base}/meeting/${lead.leadId}#start`);
    await dots(page).waitFor({ timeout: 30000 });
  });
  await page.waitForTimeout(800);
  const labels = await dots(page).getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  const expectedLabels = order.map((item) => item.label);
  check("the deck's pages, in order: the cover, the Main mockup's page, the warranty, Your price, What happens next", JSON.stringify(labels) === JSON.stringify(expectedLabels), `${labels.join(" | ")}${JSON.stringify(labels) === JSON.stringify(expectedLabels) ? "" : ` (expected ${expectedLabels.join(" | ")})`}`);
  check("meeting mode opens on the cover with the address and nothing internal", labels[0] === "Vesper" && (await page.getByRole("region", { name: "Vesper" }).innerText()).includes(lead.address) && !(await page.locator("body").innerText()).includes(setter.name));
  const empty = [];
  for (const label of labels) {
    if (label === "Vesper") continue;
    await goToScreen(page, label);
    const region = page.getByRole("region", { name: label, exact: true });
    const hasSomething = await region.evaluate((section) => section.innerText.trim() !== "" || section.querySelectorAll("img, canvas, svg").length > 0).catch(() => false);
    if (!hasSomething) empty.push(label);
    if ((await region.getAttribute("data-page")) === "what_vesper_is") {
      const picture = region.locator("img").first();
      await picture.waitFor({ timeout: 10000 }).catch(() => {});
      check("the Main mockup shows on its page, full screen", (await picture.count()) === 1 && (await picture.evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)));
    }
    if (label !== PRICE && label !== NEXT) await shot(page, `deck-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`);
  }
  check("every page has something on it", empty.length === 0, empty.join(", "));

  // Your price: three options, biggest first; the deal button only with a deal.
  startStep("Your price: the deal, the yes and the initials");
  await goToScreen(page, PRICE);
  const region = page.getByRole("region", { name: PRICE, exact: true });
  let priceOptions = await priceRows(region);
  const fullId = offerId("Full wrap");
  const frontId = offerId("Full front");
  const lowerId = offerId(LONG_NAME);
  check(
    "Your price lists the three options biggest first, Full wrap on screen, nothing chosen",
    JSON.stringify(priceOptions.map((row) => row.id)) === JSON.stringify([fullId, frontId, lowerId]) && priceOptions[0]?.onScreen === "yes" && priceOptions.every((row) => row.chosen === "no"),
    JSON.stringify(priceOptions.map((row) => [row.id, row.onScreen, row.chosen])),
  );
  const expectedPlain = { [fullId]: priced(TOTAL_FEET, true, 0), [frontId]: priced(FEET.front_lower + FEET.front_upper, true, 0), [lowerId]: priced(FEET.front_lower, false, 0) };
  check("each option's total is what the editor showed", priceOptions.every((row) => dollarsIn(row.total) === expectedPlain[row.id]), JSON.stringify(priceOptions.map((row) => [row.id, row.total])));
  const dealButton = region.getByTestId("price-black-friday");
  if (deal > 0) {
    check("with the deal set, Your price shows the Black Friday button, off", (await dealButton.count()) === 1 && (await dealButton.getAttribute("aria-pressed")) === "false");
    await tap(dealButton);
    await page.waitForTimeout(700);
    priceOptions = await priceRows(region);
    const expectedDeal = { [fullId]: priced(TOTAL_FEET, true, deal), [frontId]: priced(FEET.front_lower + FEET.front_upper, true, deal), [lowerId]: priced(FEET.front_lower, false, deal) };
    // An option already at the minimum keeps one price, nothing struck.
    await checkShot(
      page,
      `on, every option the deal lowers shows its regular price struck through beside $${deal} off, and one at the minimum keeps its price and says "Already at our lowest price." under it (round 13)`,
      flat(await dealButton.innerText()).includes(`$${deal} off`) &&
        priceOptions.every((row) =>
          expectedDeal[row.id] < expectedPlain[row.id]
            ? row.regular !== null && dollarsIn(row.regular) === expectedPlain[row.id] && dollarsIn(row.total) === expectedDeal[row.id] && row.lowest === null
            : row.regular === null && dollarsIn(row.total) === expectedDeal[row.id] && flat(row.lowest ?? "") === "Already at our lowest price.",
        ),
      JSON.stringify(priceOptions.map((row) => [row.id, row.regular, row.total, row.lowest])),
      "your-price-deal",
    );
  } else {
    check("with no deal in Settings, Your price has no Black Friday button", (await dealButton.count()) === 0);
  }
  await shot(page, "your-price");
  const chosenId = offerId(chooseName);
  const chosenTotal = priced(chooseName === "Full wrap" ? TOTAL_FEET : chooseName === "Full front" ? FEET.front_lower + FEET.front_upper : FEET.front_lower, chooseName !== LONG_NAME, deal);
  const opened = await sayYes(region, chosenId, chooseName, deck);
  await checkShot(page, `the yes on ${chooseName} opens the initials layer, takes ${INITIALS} and Confirm, and moves on`, opened && (await page.getByTestId("price-initials").isVisible().catch(() => false)) === false, "", "after-yes");
  const chosenRow = region.locator(`[data-testid="price-option"][data-option="${chosenId}"]`);
  check("the chosen option turns to Your choice", (await chosenRow.getAttribute("data-chosen")) === "yes" && flat(await region.getByTestId("price-choose").innerText().catch(() => "")) === deckLine(deck, "your_choice"));
  await shot(page, "your-price-chosen");
  const savedQuote = await until(async () => {
    const row = await quoteFor(lead.leadId);
    return row && row.meeting_offer === chosenId && (deal === 0 || dealLines(row.discounts).length === 1) ? row : null;
  }, 30000);
  const { data: initialled } = await admin.from("leads").select("track_colour_initials").eq("id", lead.leadId).single();
  check(
    `the quiet save records the choice${deal > 0 ? ", the Black Friday line of $300" : ""}, and the initials ${INITIALS} on the lead`,
    savedQuote !== null && Number(savedQuote.subtotal) === chosenTotal && initialled?.track_colour_initials === INITIALS && (deal === 0 ? dealLines(savedQuote.discounts).length === 0 : Number(dealLines(savedQuote.discounts)[0]?.amount) === deal),
    `meeting_offer ${savedQuote?.meeting_offer}, subtotal ${savedQuote?.subtotal}, initials ${initialled?.track_colour_initials}, discounts ${JSON.stringify(savedQuote?.discounts)}`,
  );

  // What happens next: the recap, and (once) a day picked at the table.
  startStep("What happens next");
  await goToScreen(page, NEXT);
  const next = page.getByRole("region", { name: NEXT, exact: true });
  const recap = flat(await next.getByTestId("next-steps-recap").innerText().catch(() => ""));
  const screenTotal = settings.gst_enabled ? `${money(chosenTotal)} + GST` : money(chosenTotal);
  const regularTotal = priced(chooseName === "Full wrap" ? TOTAL_FEET : chooseName === "Full front" ? FEET.front_lower + FEET.front_upper : FEET.front_lower, chooseName !== LONG_NAME, 0);
  const wantedRecap = fillLine(deckLine(deck, "recap"), { name: chooseName, total: screenTotal });
  check(
    deal > 0 ? "What happens next reads the choice back with its regular price struck beside the deal price" : "What happens next reads the choice back with its price",
    deal > 0 ? recap.startsWith(`Your choice: ${chooseName}`) && recap.includes(money(regularTotal)) && recap.includes(money(chosenTotal)) && (await next.getByTestId("next-steps-regular").count()) === 1 : recap === wantedRecap,
    `${recap}${deal > 0 ? "" : ` (expected ${wantedRecap})`}`,
  );
  let installDay = null;
  if (pickDay) {
    await tap(next.getByTestId("next-step-pick-day"));
    const picker = page.getByTestId("install-day-picker");
    await picker.waitFor({ timeout: 5000 }).catch(() => {});
    const dayButton = picker.locator("button[data-day]").nth(6);
    installDay = await dayButton.getAttribute("data-day").catch(() => null);
    await tap(dayButton);
    await picker.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    const dayShown = flat(await next.getByTestId("next-step-day").innerText().catch(() => ""));
    const withDay = await until(async () => {
      const row = await quoteFor(lead.leadId);
      return row && row.meeting_install_on === installDay ? row : null;
    }, 20000);
    await checkShot(page, "Pick a day at the table: the day shows on the page and saves on the quote", installDay !== null && dayShown === longDay(installDay) && withDay !== null, `${dayShown} | saved ${withDay?.meeting_install_on ?? "nothing"}`, "pick-a-day");
  }
  await shot(page, "what-happens-next");
  check("meeting mode threw no page errors", pageErrors.length === 0, pageErrors.join(" | "));

  // ---------------------------------------------------------------- 8. the customer's link
  startStep("The customer's link");
  // Issued by the service role as issue_quote_link would for Keenan, then
  // handed to the setter: a Book my install notice goes to that account,
  // never to Keenan's phone. Keenan's Send quote link below reuses the
  // same live link.
  const issued = await admin.rpc("issue_quote_link", { p_lead_id: lead.leadId });
  if (issued.error || typeof issued.data !== "string" || issued.data === "") throw new Error(`issue_quote_link: ${issued.error?.message ?? "no token"}`);
  const handed = await admin.from("quote_links").update({ created_by: setter.id }).eq("lead_id", lead.leadId).is("revoked_at", null).select("id").single();
  if (handed.error) throw new Error(`link to the setter: ${handed.error.message}`);
  lead.linkId = handed.data.id;
  lead.quoteUrl = `${base}/q/${issued.data}`;
  await loaded("Lead page (after the meeting)", async () => {
    await page.goto(leadUrl);
    await page.getByTestId("quote-card").waitFor({ timeout: 30000 });
  });
  await settle(page);
  const linkCard = page.getByTestId("quote-card");
  await linkCard.scrollIntoViewIfNeeded().catch(() => {});
  await tap(linkCard.getByRole("button", { name: "Send quote link" }));
  const sendSheet = page.getByTestId("send-quote-link");
  await sendSheet.waitFor({ timeout: 20000 }).catch(() => {});
  const sendText = await sendSheet.locator("#quote-link-text").inputValue().catch(() => "");
  const { data: linksNow } = await admin.from("quote_links").select("id, created_by").eq("lead_id", lead.leadId).is("revoked_at", null);
  await checkShot(
    page,
    "Send quote link opens the sheet with the ready-made text and the link in it, reusing the one live link (text never printed)",
    sendText.includes("/q/") && linksNow?.length === 1 && linksNow[0].id === lead.linkId && linksNow[0].created_by === setter.id,
    `${sendText.length} characters, ${linksNow?.length} live link`,
    "send-quote-link",
  );
  // The sheet's text holds the link itself, so it is masked in the picture.
  await shot(page, "send-quote-link", { mask: [sendSheet.locator("#quote-link-text")] });
  await tap(sendSheet.getByRole("button", { name: "Done" }));
  await sendSheet.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  check("the Customer's link card says when the link was made and that it's not opened yet", /^Made /.test(flat(await linkCard.getByTestId("quote-link-status").innerText().catch(() => ""))) && flat(await linkCard.getByTestId("quote-link-views").innerText().catch(() => "")) === "Not opened yet.");
  await closeOwner(owner.context);

  // The customer, on their phone, with no session.
  const customer = await browser.newContext(PHONE);
  page = await customer.newPage();
  await loaded("Customer's quote page at 390", async () => {
    await page.goto(lead.quoteUrl);
    await page.getByTestId("option-row").first().waitFor({ timeout: 30000 });
  });
  await settle(page);
  await page.waitForTimeout(500);
  let linkOptions = await linkRows(page);
  const expectedLink = { [fullId]: priced(TOTAL_FEET, true, deal), [frontId]: priced(FEET.front_lower + FEET.front_upper, true, deal), [lowerId]: priced(FEET.front_lower, false, deal) };
  await checkShot(
    page,
    `the link opens on ${chooseName}, tagged as the meeting's choice, every option priced as at the table${deal > 0 ? " with the deal" : ""}`,
    linkOptions.find((row) => row.selected)?.offer === chosenId &&
      linkOptions.find((row) => row.tagged)?.offer === chosenId &&
      (await heroTotal(page)) === expectedLink[chosenId] &&
      linkOptions.every((row) => dollarsIn(row.total) === expectedLink[row.offer]),
    `${JSON.stringify(linkOptions)} | hero ${await heroTotal(page)}`,
    "link-open",
  );
  check("no sideways scroll at 390", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  if (deal > 0) {
    const dealLine = page.locator(`[data-testid="quote-lines"] .quote-row[data-line="${DEAL}"][data-shown="true"]`);
    check("the Black Friday line is in What's in, $300", (await dealLine.count()) === 1 && dollarsIn(await dealLine.innerText().catch(() => "")) === deal, flat(await dealLine.innerText().catch(() => "none")));
  }
  await shot(page, "link-top");
  for (const id of [lowerId, frontId, fullId]) {
    await tap(page.locator(`[data-testid="option-row"][data-offer="${id}"]`));
    await page.waitForTimeout(700);
    const hero = await heroTotal(page);
    check(`switching to ${lead.offers.find((offer) => offer.id === id)?.name}: the hero follows, ${money(expectedLink[id])}`, (await linkRows(page)).find((row) => row.selected)?.offer === id && hero === expectedLink[id], `hero ${hero}`);
  }
  const nextSteps = flat(await page.getByTestId("quote-next-steps").innerText().catch(() => ""));
  if (installDay) check("the link's What happens next shows the day picked at the table", nextSteps.includes(longDay(installDay)), nextSteps.slice(0, 160));
  check("the page never offers the customer a day to pick (Keenan sets it)", (await page.getByTestId("install-day-picker").count()) === 0);
  await page.getByTestId("quote-next-steps").scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "link-what-happens-next");
  // Book my install on bookName.
  const bookId = offerId(bookName);
  await tap(page.locator(`[data-testid="option-row"][data-offer="${bookId}"]`));
  await page.waitForTimeout(700);
  await tap(page.getByTestId("bar-book"));
  const confirm = page.getByTestId("book-confirm");
  await confirm.waitFor({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  check(`Book my install asks first, with ${bookName} and its total`, flat(await page.getByTestId("confirm-option").innerText().catch(() => "")) === bookName && dollarsIn(await page.getByTestId("confirm-total").innerText().catch(() => "")) === expectedLink[bookId]);
  await shot(page, "link-book-confirm");
  await loaded("Book my install (the yes to the thanks)", async () => {
    await tap(confirm.getByRole("button", { name: "Yes, book my install" }));
    await page.getByTestId("quote-thanks").waitFor({ timeout: 30000 }).catch(() => {});
  });
  const { data: bookedRow } = await admin.from("quote_links").select("booked_offer, booked_option").eq("id", lead.linkId).single();
  await checkShot(page, `Book my install records ${bookName} on the link and thanks them`, bookedRow?.booked_offer === bookId && bookedRow?.booked_option === bookName && (await page.getByTestId("quote-thanks").count()) === 1, JSON.stringify(bookedRow), "link-thanks");
  await shot(page, "link-thanks", { fullPage: true });
  await customer.close();

  // ---------------------------------------------------------------- 9. the Accepted sheet
  startStep("The Accepted sheet");
  const again = await ownerPage();
  page = again.page;
  await loaded("Lead page (the customer's choice)", async () => {
    await page.goto(leadUrl);
    await page.getByTestId("quote-card").waitFor({ timeout: 30000 });
  });
  await settle(page);
  const bookedText = flat(await page.getByTestId("quote-card-booked").innerText().catch(() => ""));
  await checkShot(page, `Keenan's lead page says they asked to book ${bookName}`, bookedText.toLowerCase().includes(`asked to book ${bookName.toLowerCase()}`), bookedText, "lead-booked");
  await page.getByTestId("quote-card").scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "lead-page-booked");
  const outcome = page.getByTestId("quote-outcome");
  await outcome.scrollIntoViewIfNeeded().catch(() => {});
  await tap(page.getByTestId("outcome-accept"));
  const acceptSheet = page.getByTestId("outcome-accept-sheet");
  await acceptSheet.waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  const offered = await acceptSheet.getByTestId("outcome-option").evaluateAll((rows) =>
    rows.map((row) => ({
      offer: row.getAttribute("data-offer"),
      meeting: row.getAttribute("data-meeting"),
      booked: row.getAttribute("data-booked"),
      checked: Boolean(row.querySelector("input")?.checked),
      total: (row.querySelector('[data-testid="outcome-option-total"]')?.textContent ?? "").trim(),
      commission: (row.querySelector('[data-testid="outcome-option-commission"]')?.textContent ?? "").trim(),
    })),
  );
  const sources = (await acceptSheet.getByTestId("outcome-choice-source").allInnerTexts()).map(flat);
  const acceptId = bookId;
  const acceptFeet = bookName === "Full wrap" ? TOTAL_FEET : bookName === "Full front" ? FEET.front_lower + FEET.front_upper : FEET.front_lower;
  const commissionBase = Math.round((acceptFeet * ppf + boxPrice - deal) * 100) / 100;
  const expectedCommission = Math.round(commissionBase * rate * 100) / 100;
  const acceptRow = offered.find((row) => row.offer === acceptId);
  await checkShot(
    page,
    "the Accepted sheet lists the three options, says where each choice came from, opens on the option the customer booked on their link (round 13), and prices each with its commission",
    offered.length === 3 &&
      offered.find((row) => row.checked)?.offer === bookId &&
      sources.includes(`Chosen at the meeting: ${chooseName}`) &&
      sources.includes(`Booked on their link: ${bookName}`) &&
      acceptRow !== undefined &&
      dollarsIn(acceptRow.total) === expectedLink[acceptId] &&
      acceptRow.commission === `${money(expectedCommission)} commission`,
    `${JSON.stringify(offered)} | ${sources.join(" | ")}`,
    "accepted-sheet",
  );
  if (bookName !== chooseName) {
    // Round 13: it opens on what they booked, with the table's choice
    // marked on its own row; nothing to pick.
    check(
      "with a different choice at the table, the sheet still opens on what they booked, and the table's choice is marked on its own row",
      offered.find((row) => row.checked)?.offer === bookId &&
        acceptId === bookId &&
        flat(await acceptSheet.locator(`[data-testid="outcome-option"][data-offer="${chosenId}"]`).getByTestId("outcome-option-meeting").innerText().catch(() => "")) === "Chosen at the meeting",
      JSON.stringify(offered.map((row) => [row.offer, row.checked, row.meeting, row.booked])),
    );
  }
  const plannedOn = await page.getByTestId("outcome-planned-on").inputValue().catch(() => "");
  if (installDay) check("the sheet starts on the install day picked at the table", plannedOn === installDay, plannedOn);
  const sheetText = flat(await acceptSheet.innerText().catch(() => ""));
  check("the sheet says what happens next: Sold, the numbers lock, undo to change them", sheetText.includes("The lead moves to Sold and this quote's numbers lock. To change them later, undo the acceptance."));
  {
    // Does the sheet fit the iPad, or does its tail hide under the buttons?
    const soldLine = await acceptSheet.getByText("The lead moves to Sold", { exact: false }).boundingBox().catch(() => null);
    const confirmBox = await acceptSheet.getByTestId("outcome-accept-confirm").boundingBox().catch(() => null);
    if (soldLine && confirmBox && soldLine.y + soldLine.height > confirmBox.y - 16) {
      observe(`the Accepted sheet at 1180 x 820 is taller than the screen: the sentence under the commission line ("The lead moves to Sold and this quote's numbers lock...") sits ${Math.round(soldLine.y + soldLine.height - (confirmBox.y - 16))} px into the Back and Mark accepted bar until the sheet is scrolled`);
    }
  }
  check("the track colour is already on the sheet, so Mark accepted is ready", flat(await acceptSheet.getByTestId("outcome-accept-track").innerText().catch(() => "")).includes(white.name) && flat(await acceptSheet.getByTestId("outcome-accept-confirm").innerText().catch(() => "")) === "Mark accepted");
  await shot(page, "accepted-sheet");
  await loaded("Mark accepted (the tap to the card)", async () => {
    await tap(acceptSheet.getByTestId("outcome-accept-confirm"));
    await acceptSheet.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelector('[data-testid="quote-outcome"]')?.getAttribute("data-state") === "accepted", null, { timeout: 30000 }).catch(() => {});
  });
  await page.waitForTimeout(600);
  const accepted = await quoteFor(lead.leadId);
  const { data: earnings } = await admin.from("earnings").select("id, profile_id, type, rate, base_amount, amount, status").eq("lead_id", lead.leadId).eq("type", "commission");
  const commissionRow = earnings?.[0] ?? null;
  const { data: leadAfter } = await admin.from("leads").select("status").eq("id", lead.leadId).single();
  await checkShot(
    page,
    `the quote is accepted on ${bookName}, the lead is Sold, and one commission goes to the setter: ${rate * 100}% of lights and box${deal > 0 ? ` after $${deal} off` : ""} (${money(commissionBase)}), ${money(expectedCommission)}`,
    accepted?.status === "accepted" &&
      accepted?.accepted_offer === acceptId &&
      leadAfter?.status === "sold" &&
      earnings?.length === 1 &&
      commissionRow.profile_id === setter.id &&
      Number(commissionRow.base_amount) === commissionBase &&
      Number(commissionRow.amount) === expectedCommission &&
      commissionRow.status === "pending",
    `${accepted?.status}, ${accepted?.accepted_offer}, lead ${leadAfter?.status}, ${JSON.stringify(earnings)}`,
    "accepted",
  );
  if (deal > 0) check("the accepted quote keeps its Black Friday line of $300", dealLines(accepted?.discounts).length === 1 && Number(dealLines(accepted?.discounts)[0].amount) === deal, JSON.stringify(accepted?.discounts));
  const cardOption = flat(await page.getByTestId("quote-outcome-option").innerText().catch(() => ""));
  const cardCommission = flat(await page.getByTestId("quote-outcome-commission").innerText().catch(() => ""));
  check("the outcome card reads Accepted, names the option, and the commission to the setter", (await outcome.getAttribute("data-state").catch(() => null)) === "accepted" && cardOption.startsWith(bookName) && cardCommission.includes(money(expectedCommission)) && cardCommission.includes(setter.name), `${cardOption} | ${cardCommission}`);
  await outcome.scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "outcome-accepted");

  // ---------------------------------------------------------------- 10. the commission on Admin > Pay
  startStep("Admin > Pay");
  await loaded("Pay page", async () => {
    await page.goto(`${base}/app/admin/pay`);
    await page.locator('[data-testid="pay-setter"]').filter({ hasText: setter.name }).waitFor({ timeout: 30000 }).catch(() => {});
  });
  await settle(page);
  const payCard = page.locator('[data-testid="pay-setter"]').filter({ hasText: setter.name });
  const coming = flat(await payCard.getByTestId("pay-commission-coming").innerText().catch(() => ""));
  await checkShot(
    page,
    `Admin > Pay shows the commission coming for the setter: ${money(expectedCommission)}, ${rate * 100}% of ${money(commissionBase)}, owed once installed`,
    (await payCard.count()) === 1 && coming.includes(money(expectedCommission)) && coming.includes(`of ${money(commissionBase)}`) && coming.includes(lead.address),
    coming.slice(0, 240),
    "pay",
  );
  const baseWithCents = coming.match(/\d+% of \$[\d,]+\.00\b/);
  if (baseWithCents) observe(`Admin > Pay writes the commission's base with cents ("${baseWithCents[0]}") while the amount beside it and every other price drop the .00`);
  await payCard.scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "pay");
  await closeOwner(again.context);
  endStep();
  currentPass = "";
}

function areaLabel(key) {
  return { front_lower: "Front lower", front_upper: "Front upper", back_lower: "Back lower", sides_lower: "Sides lower" }[key];
}

// ---------------------------------------------------------------- cleanup

const removed = [];
async function removeEverything() {
  const ids = [setter.id, host.id].filter(Boolean);
  if (ids.length === 0) return;
  const { data: owned } = await admin.from("leads").select("id").eq("created_by", setter.id);
  const leadIds = [...new Set([...(owned ?? []).map((row) => row.id), ...Object.values(leads).flatMap((lead) => (lead?.leadId ? [lead.leadId] : []))])];
  const count = async (table, filter) => {
    const { count: n } = await filter(admin.from(table).select("id", { count: "exact", head: true }));
    return n ?? 0;
  };
  const tally = (what, n) => removed.push(`REMOVED ${what}: ${n}`);

  if (leadIds.length > 0) {
    tally("earnings (the commissions)", await count("earnings", (q) => q.in("lead_id", leadIds)));
    await admin.from("earnings").delete().in("lead_id", leadIds);
    await admin.from("earnings").delete().in("profile_id", ids);
    tally("slot_holds", (await count("slot_holds", (q) => q.in("lead_id", leadIds))) + (await count("slot_holds", (q) => q.in("holder_id", ids))));
    await admin.from("slot_holds").delete().in("lead_id", leadIds);
    await admin.from("slot_holds").delete().in("holder_id", ids);
    await admin.from("slot_holds").delete().eq("host_id", host.id);
    await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
    await admin.from("meetings").update({ rebooked_as: null }).eq("host_id", host.id);
    tally("meetings", await count("meetings", (q) => q.in("lead_id", leadIds)));
    await admin.from("meetings").delete().in("lead_id", leadIds);
    await admin.from("meetings").delete().eq("host_id", host.id);
    tally("quote_links (tokens never printed)", await count("quote_links", (q) => q.in("lead_id", leadIds)));
    await admin.from("quote_links").delete().in("lead_id", leadIds);
    tally("quotes", await count("quotes", (q) => q.in("lead_id", leadIds)));
    await admin.from("quotes").delete().in("lead_id", leadIds);
    await admin.from("roofline_traces").delete().in("lead_id", leadIds);
    // The mockups' files: exactly the paths on these leads' rows, in
    // Keenan's folder (uploaded through his lead page), never anything else.
    const { data: mockups } = await admin.from("lead_mockups").select("id, storage_path").in("lead_id", leadIds);
    const paths = [...new Set((mockups ?? []).map((row) => row.storage_path).filter(Boolean))];
    const { data: photos } = await admin.from("lead_photos").select("storage_path").in("lead_id", leadIds);
    for (const row of photos ?? []) if (row.storage_path) paths.push(row.storage_path);
    let filesGone = 0;
    if (paths.length > 0) {
      const gone = await admin.storage.from(BUCKET).remove(paths);
      filesGone = gone.error ? 0 : (gone.data ?? []).length;
      if (gone.error) note(`removing the mockup files failed: ${gone.error.message}`);
    }
    tally(`lead_mockups rows`, (mockups ?? []).length);
    tally(`files in ${BUCKET} (the mockups, by their exact paths)`, filesGone);
    await admin.from("lead_mockups").delete().in("lead_id", leadIds);
    tally("lead_photos", (photos ?? []).length);
    await admin.from("lead_photos").delete().in("lead_id", leadIds);
    tally("lead_events (the timelines)", await count("lead_events", (q) => q.in("lead_id", leadIds)));
    await admin.from("lead_events").delete().in("lead_id", leadIds);
    tally("leads", await count("leads", (q) => q.in("id", leadIds)));
    await admin.from("leads").delete().in("id", leadIds);
    // Any file left in the setter's own folder (none expected).
    const { data: files } = await admin.storage.from(BUCKET).list(setter.id, { limit: 1000 });
    if (files && files.length > 0) await admin.storage.from(BUCKET).remove(files.map((file) => `${setter.id}/${file.name}`));
    // Verify by the paths themselves: each one's folder listed for its name.
    let left = 0;
    for (const path of paths) {
      const [folder, name] = [path.slice(0, path.lastIndexOf("/")), path.slice(path.lastIndexOf("/") + 1)];
      const { data: found } = await admin.storage.from(BUCKET).list(folder, { search: name, limit: 5 });
      if ((found ?? []).some((file) => file.name === name)) left += 1;
    }
    check("every mockup file is gone from lead-photos", left === 0, `${left} of ${paths.length} left`);
  }
  await admin.from("leads").delete().eq("created_by", setter.id);
  tally("knock_sessions", await count("knock_sessions", (q) => q.in("user_id", ids)));
  await admin.from("knock_sessions").delete().in("user_id", ids);
  await admin.from("push_subscriptions").delete().in("profile_id", ids);
  for (const person of [setter, host]) {
    if (!person.id) continue;
    const { error } = await admin.auth.admin.deleteUser(person.id);
    removed.push(`REMOVED ${person === setter ? "setter" : "host"} ${person.email} (${person.name}, ${person.id})${error ? `: ${error.message}` : ""}`);
  }
  for (const lead of Object.values(leads)) {
    if (!lead?.leadId) continue;
    removed.push(`REMOVED lead ${lead.leadId}: ${LEAD_NAME} ${stamp}, ${lead.address}${lead.quoteId ? `, quote ${lead.quoteId}` : ""}${lead.meetingId ? `, meeting ${lead.meetingId}` : ""}${lead.linkId ? `, link ${lead.linkId}` : ""}`);
  }

  // Verified: nothing with this run's stamp is left anywhere.
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const accounts = (users?.users ?? []).filter((user) => (user.email ?? "").startsWith(`rehearsal-${stamp}`)).length;
  const { count: profiles } = await admin.from("profiles").select("id", { count: "exact", head: true }).in("id", ids);
  const { count: strayLeads } = await admin.from("leads").select("id", { count: "exact", head: true }).like("address_line", `%(TEST) ${stamp}`);
  const strays = {};
  if (leadIds.length > 0) {
    for (const table of ["meetings", "quotes", "quote_links", "earnings", "lead_mockups", "lead_photos", "lead_events", "slot_holds"]) {
      strays[table] = await count(table, (q) => q.in("lead_id", leadIds));
    }
  }
  strays.earnings_by_setter = await count("earnings", (q) => q.in("profile_id", ids));
  const leftovers = Object.values(strays).reduce((sum, n) => sum + n, 0);
  check(
    "verified afterwards: no account, profile, lead, meeting, quote, link, earning, mockup, photo, event or hold with this run's stamp is left",
    accounts === 0 && (profiles ?? 0) === 0 && (strayLeads ?? 0) === 0 && leftovers === 0,
    `${accounts} accounts, ${profiles ?? 0} profiles, ${strayLeads ?? 0} leads, ${JSON.stringify(strays)}`,
  );
}

// ---------------------------------------------------------------- main

try {
  note("this rehearsal writes with the owner's one-time session, on marked test records only, and removes them at the end");
  // ---------------------------------------------------------------- staging
  startStep("Staging (service role)");
  await makeUser(setter);
  await makeUser(host);
  await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).in("id", [setter.id, host.id]);
  const hosting = await admin.from("profiles").update({ hosts_meetings: true }).eq("id", host.id);
  if (hosting.error) throw new Error(`host: ${hosting.error.message}`);
  setter.client = await signedIn(setter);
  const { data: ownerRow } = await admin.from("profiles").select("id").eq("role", "owner").single();
  ownerId = ownerRow.id;
  ({ data: settings } = await admin
    .from("settings")
    .select("deck, commission_rate, gst_rate, gst_enabled, price_per_ft, box_price, upper_access_fee, min_job_total, quote_valid_days")
    .eq("id", 1)
    .single());
  ppf = Number(settings.price_per_ft);
  boxPrice = Number(settings.box_price);
  upperFee = Number(settings.upper_access_fee ?? 0) || 0;
  minimum = Number(settings.min_job_total ?? 0) || 0;
  rate = Number(settings.commission_rate);
  note(`Settings used: $${ppf} a foot, $${boxPrice} box, upper access ${upperFee > 0 ? `$${upperFee}` : "not set"}, minimum ${minimum > 0 ? `$${minimum}` : "none"}, commission ${rate * 100}%, GST ${settings.gst_enabled ? "on" : "off"}`);
  const { data: colours } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order");
  white = (colours ?? []).find((colour) => /^white$/i.test(colour.name.trim()));
  if (!white) throw new Error("no active track colour named White");

  leads.plain = await stageLead({ number: 1, everyone: false });
  leads.deal = await stageLead({ number: 2, everyone: true });
  const times = await openTimes();
  if (times.length < 2) throw new Error(`only ${times.length} open times on the test host`);
  const today = calgaryDay();
  const todays = times.filter((time) => calgaryDay(new Date(time)) === today);
  const picked = todays.length >= 2 ? todays.slice(0, 2) : times.slice(0, 2);
  await bookAsSetter(leads.plain, picked[0]);
  await bookAsSetter(leads.deal, picked[1]);
  const { data: booked } = await admin.from("meetings").select("id, everyone_deciding, status, photos_skipped").in("id", [leads.plain.meetingId, leads.deal.meetingId]);
  const meetingOf = (lead) => (booked ?? []).find((row) => row.id === lead.meetingId);
  check(
    "staged: two leads booked by the setter on the test host, the photos skipped (homeowner said no), the meetings carrying the leads' answers to everyone who decides (no, then yes)",
    meetingOf(leads.plain)?.everyone_deciding === "no" && meetingOf(leads.deal)?.everyone_deciding === "yes" && (booked ?? []).every((row) => row.status === "booked" && row.photos_skipped === "homeowner_said_no"),
    JSON.stringify(booked),
  );
  note(`the meetings: ${longDay(calgaryDay(new Date(picked[0])))} and ${longDay(calgaryDay(new Date(picked[1])))} on the test host${todays.length >= 2 ? " (tonight)" : " (no two open times tonight, so the next evening with room)"}`);
  endStep();

  // ---------------------------------------------------------------- pass 1: no deal
  await rehearse(leads.plain, { deal: 0, tag: "pass1", chooseName: "Full wrap", bookName: "Full wrap", pickDay: true });

  // ---------------------------------------------------------------- pass 2: dollars off 300
  {
    currentPass = "pass2";
    startStep("Settings: Dollars off 300");
    const owner = await ownerPage();
    page = owner.page;
    dealTouched = true;
    const saved = await setDealInSettings(page, "amount", DOLLARS);
    const deal = await dealInDb();
    await checkShot(page, "Settings saves Dollars off 300 through the form and says so", saved && deal.black_friday_kind === "amount" && Number(deal.black_friday_value) === DOLLARS, `${saved ? "Saved at shown" : "no Saved at"}; ${JSON.stringify(deal)}`, "settings-deal");
    await shot(page, "settings-dollars-off");
    await closeOwner(owner.context);
    endStep();
  }
  await rehearse(leads.deal, { deal: DOLLARS, tag: "pass2", chooseName: "Full front", bookName: LONG_NAME, pickDay: false });
} catch (error) {
  endStep();
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)}${page ? ` at ${safeUrl(page)}` : ""}`);
  failures.push(`the script stopped: ${error?.message ?? String(error)}`);
  if (page) {
    const file = shots ? await shot(page, "script-error") : null;
    await page.screenshot({ path: `${out}/rehearsal-failure.png` }).catch(() => {});
    if (file) failures[failures.length - 1] += ` (see ${file})`;
  }
} finally {
  currentPass = "";
  if (session) await session.close().catch(() => {});
  session = null;

  // ---------------------------------------------------------------- the deal back to None
  if (dealTouched) {
    let byForm = false;
    try {
      const restore = await browser.newContext(IPAD);
      session = await openOwnerSession({ url, anonKey, admin, base, context: restore });
      const restorePage = await restore.newPage();
      byForm = await setDealInSettings(restorePage, "none");
      await closeOwner(restore);
    } catch (error) {
      note(`the Settings form could not set the deal back to None (${(error?.message ?? String(error)).slice(0, 120)}), so the service role does it`);
    }
    let after = await dealInDb();
    if (after.black_friday_kind !== null || after.black_friday_value !== null) {
      const fixed = await admin.from("settings").update({ black_friday_kind: null, black_friday_value: null }).eq("id", 1);
      if (fixed.error) results.push(`SCRIPT ERROR setting the deal back to None: ${fixed.error.message}`);
      else note(`the deal was set back to None by the service role${byForm ? ", after the form said Saved at but left it set" : ""}`);
      after = await dealInDb();
    } else if (byForm) {
      note("the deal was set back to None through the Settings form");
    }
    check("Settings' Black Friday deal is None again: both columns null", after.black_friday_kind === null && after.black_friday_value === null, JSON.stringify(after));
  } else {
    const after = await dealInDb();
    check("Settings' Black Friday deal was never changed: both columns null", (after.black_friday_kind ?? null) === null && (after.black_friday_value ?? null) === null, JSON.stringify(after));
  }

  // ---------------------------------------------------------------- everything removed
  try {
    await removeEverything();
  } catch (error) {
    results.push(`SCRIPT ERROR cleanup: ${error?.message ?? String(error)}`);
  }
  if (browser) await browser.close().catch(() => {});

  // ---------------------------------------------------------------- the report
  if (shots) results.push(`NOTE screenshots in ${shots}: ${shotNames.join(", ")}`);
  results.push("NOTES what felt slow, awkward or confusing, from the timings and the walk:");
  const slowPages = timings.filter((entry) => entry.kind === "page" && entry.ms > SLOW_MS);
  for (const entry of slowPages) results.push(`NOTES slow: ${entry.pass ? `${entry.pass}, ` : ""}${entry.label} took ${seconds(entry.ms)} to be usable`);
  if (slowPages.length === 0) results.push(`NOTES no page took more than ${seconds(SLOW_MS)} to be usable`);
  for (const entry of timings.filter((item) => item.kind === "page" && item.ms <= SLOW_MS)) results.push(`NOTES page: ${entry.pass ? `${entry.pass}, ` : ""}${entry.label} in ${seconds(entry.ms)}`);
  for (const entry of timings.filter((item) => item.kind === "step")) results.push(`NOTES step: ${entry.pass ? `${entry.pass}, ` : ""}${entry.label}: ${seconds(entry.ms)}, ${entry.taps} tap${entry.taps === 1 ? "" : "s"}`);
  for (const text of observations) results.push(`NOTES ${text}`);
  for (const text of failures) results.push(`NOTES failed: ${text}`);
  if (failures.length === 0) results.push("NOTES nothing failed");
  results.push("REMOVED everything this run made, with the counts as they stood before the delete:");
  results.push(...removed);
  const finalDeal = await dealInDb();
  results.push(`SETTINGS Black Friday deal: ${finalDeal.black_friday_kind === null || finalDeal.black_friday_kind === undefined ? "None" : `${finalDeal.black_friday_kind} ${finalDeal.black_friday_value}`}`);
  console.log(results.join("\n"));
  process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
}
