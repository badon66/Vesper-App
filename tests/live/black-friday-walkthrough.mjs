// Live end-to-end script for Black Friday pricing (round 10 catch-up, Keenan,
// 2026-11-11), against a running build. Unlike every other walk-through,
// this one WRITES with the owner's one-time session (owner-session.mjs), on
// test records only, because Keenan asked for the real path: Settings, Your
// price's yes, the customer's link and the Accepted sheet. Since round 12
// (Keenan, 2026-11-11: "remove every test record afterwards and say so") it
// removes everything it made at the end (the setters, the leads, their
// quotes, links, mockups, the uploaded mockup and the commission) and says
// so in a REMOVED block. KEEP=1 leaves them in place instead, named in a
// KEPT block, as the first run did at Keenan's request.
//
// Keenan's words: "Use a test lead and quote, clearly marked as test. Set a
// 15% deal, go through Your price with it on, say yes, switch options on
// the customer's link, and check: the Accepted sheet; the discount line on
// the quote; the commission row: 5% of lights and box after the discount.
// Then try a dollars-off deal. Set the deal back to None when you're done.
// Leave the test records in place and tell Keenan which ones they are. No
// deletes."
//
// It refuses to start while a deal is already set in Settings (a NOTE, exit
// 0, nothing changed), and sets the deal back to None at the end, in a
// finally, through the Settings form, or through the service role if the
// form fails.
//
// Staged by the service role, one of each per lead: a test setter, a lead
// made by that setter, a draft quote by Keenan (three runs, two options, a
// $2,500 minimum), White track, a live link issued by issue_quote_link and
// handed to the setter (so a Book my install notice never reaches Keenan),
// and three mockups (a Main, one for Front lower, a Phone scene). On the
// first lead Keenan also uploads one mockup through the lead page: a JPEG
// of 8000 x 6000 over 10 MB, which must land at 3200 px on the long edge
// and under 2.5 MB, then a file named IMG_0001.HEIC, which must show the
// card's "couldn't be read" line and break nothing.
//
// The numbers, at $24 a foot with a $500 box, $200 upper access and a
// $2,500 minimum:
//   Full wrap    144 ft  3456 + 500 + 200 = 4156
//                15% off: 623.40 off, 3532.60
//                $300 off: 3856
//   Front lower   92 ft  2208 + 500 = 2708, under the minimum either way,
//                lifted back to the $2,500 minimum, so $2,708 struck beside $2,500
//   Commission on Full wrap at 15% off: 5% of (3456 + 500 - 623.40) =
//                5% of 3332.60 = 166.63
//
// With SHOTS set to a folder, screenshots are saved there in order. BASE
// and OUT as in the other walk-throughs.
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";
import { deckLine, fillLine } from "./deck-order.mjs";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const shots = process.env.SHOTS ?? null;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The Black Friday walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const BUCKET = "lead-photos";
const DEAL = "Black Friday";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
// One test setter per lead, so the KEPT block can name both.
const setters = {
  percent: { email: `bf-live-${stamp}@example.com`, password: `cedar-lantern-orbit-${digits}`, name: "TEST Black Friday Setter", id: null },
  dollars: { email: `bf-live-${stamp}-dollars@example.com`, password: `maple-harbor-stone-${digits}`, name: "TEST Black Friday Setter (dollars)", id: null },
};

const IPAD = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

// Keenan's numbers (the header).
const FULL_REGULAR = 4156;
// Front lower before any deal: 92 ft x $24 + the $500 box.
const FRONT_REGULAR = 2708;
const MINIMUM = 2500;
const PERCENT = 15;
const FULL_PERCENT_OFF = 623.4;
const FULL_AT_PERCENT = 3532.6;
const DOLLARS = 300;
const FULL_AT_DOLLARS = 3856;
const COMMISSION_BASE = 3456 + 500 - FULL_PERCENT_OFF;

// ---------------------------------------------------------------- words and dates

const calgaryZone = (moment) => (moment.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton");
const calgaryDay = (moment = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(moment), year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
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
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
// A page's address with the customer's token hidden: no token is ever printed.
const safeUrl = (page) => (page ? page.url().replace(/\/q\/[^/?#]+/, "/q/<token>") : "");

// ---------------------------------------------------------------- page helpers

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}

const dots = (page) => page.locator('ol[aria-label="Where you are"]');

async function goToScreen(page, label) {
  await dots(page).getByRole("button", { name: label, exact: true }).click();
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
  if (!shots) return;
  shotNumber += 1;
  const file = `${String(shotNumber).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: `${shots}/${file}`, ...options }).catch((error) => note(`screenshot ${file} failed: ${error.message.slice(0, 80)}`));
  shotNames.push(file);
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

// ---------------------------------------------------------------- data helpers

const dealInDb = async () => {
  const { data } = await admin.from("settings").select("black_friday_kind, black_friday_value").eq("id", 1).single();
  return data ?? {};
};

// The lead's newest quote, with what the checks read.
async function quoteFor(leadId) {
  const { data } = await admin
    .from("quotes")
    .select("id, status, discounts, meeting_offer, accepted_offer, subtotal, total, updated_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

const dealLines = (discounts) => (Array.isArray(discounts) ? discounts : []).filter((line) => line && line.label === DEAL);
// A discount line as the checks compare it: its keys, its amount and its percent.
const lineShape = (line) => ({
  keys: Object.keys(line).sort().join(","),
  amount: Number(line.amount),
  percent: line.percent === undefined || line.percent === null ? null : Number(line.percent),
});

async function mockupRows(leadId) {
  const { data } = await admin
    .from("lead_mockups")
    .select("id, storage_path, name, is_main, is_scene, offer_ids, created_by, removed_at")
    .eq("lead_id", leadId)
    .order("position");
  return data ?? [];
}

// The house drawing the staged mockups use (meeting-story's house, lit).
async function housePicture() {
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
  return sharp(house).modulate({ brightness: 0.35 }).tint("#1d3445").jpeg().toBuffer();
}

// A JPEG of 8000 x 6000 over 10 MB: gaussian noise, the quietest that
// still comes out that big, so the phone's shrink has a fair chance of
// getting it under 2.5 MB at 3200 px.
async function bigJpeg() {
  for (const [sigma, quality] of [[8, 85], [8, 92], [16, 92], [24, 95], [48, 95], [80, 95]]) {
    const buffer = await sharp({
      create: { width: 8000, height: 6000, channels: 3, background: { r: 128, g: 128, b: 128 }, noise: { type: "gaussian", mean: 128, sigma } },
    })
      .jpeg({ quality, chromaSubsampling: "4:4:4" })
      .toBuffer();
    if (buffer.length > 10 * 1024 * 1024) return { buffer, sigma, quality };
  }
  throw new Error("could not make a JPEG over 10 MB");
}

// ---------------------------------------------------------------- staging

async function makeSetter(person) {
  const { data, error } = await admin.auth.admin.createUser({
    email: person.email,
    password: person.password,
    email_confirm: true,
    user_metadata: { full_name: person.name },
    app_metadata: { role: "sales" },
  });
  if (error) throw new Error(`createUser ${person.email}: ${error.message}`);
  person.id = data.user.id;
}

// A lead by the setter, Keenan's draft quote, White track, a live link
// handed to the setter, and three mockups. Removed at the end unless KEEP=1.
async function stageLead({ setter, firstName, address, ownerId, white, gstRate, picture }) {
  const lead = await admin
    .from("leads")
    .insert({
      first_name: firstName,
      last_name: stamp,
      address_line: address,
      neighbourhood: "TEST (automated)",
      created_by: setter.id,
      soffit_colour: "off_white",
      phone: "+14035550100",
      owns_home: true,
      wants_price: true,
      both_decision_makers: true,
    })
    .select("id")
    .single();
  if (lead.error) throw new Error(`lead ${firstName}: ${lead.error.message}`);
  const leadId = lead.data.id;
  const coloured = await admin.from("leads").update({ track_colour_id: white.id }).eq("id", leadId);
  if (coloured.error) throw new Error(`track colour: ${coloured.error.message}`);

  const runs = [
    { name: "Front", feet: 64, level: "lower", part: "eave" },
    { name: "Garage", feet: 28, level: "lower", part: "garage" },
    { name: "Front upper", feet: 52, level: "upper", part: "eave" },
  ];
  const quote = await admin
    .from("quotes")
    .insert({
      lead_id: leadId,
      created_by: ownerId,
      price_per_ft: 24,
      box_price: 500,
      box_count: 1,
      runs,
      total_feet: 144,
      adders: [],
      discounts: [],
      gst_rate: gstRate,
      gst_enabled: false,
      min_job_total: MINIMUM,
      subtotal: FULL_REGULAR,
      total: FULL_REGULAR,
      colour_timing: "stock",
      upper_access_fee: 200,
      upper_gable_access_fee: 400,
      track_colour_name: white.name,
      valid_until: addDays(calgaryDay(), 14),
      offers: [
        { id: "full", name: "Full wrap", runs: [0, 1, 2] },
        { id: "front_lower", name: "Front lower", runs: [0, 1] },
      ],
    })
    .select("id")
    .single();
  if (quote.error) throw new Error(`quote ${firstName}: ${quote.error.message}`);

  // The link, issued the way Keenan's Send quote link does, then handed to
  // the setter so its notices go to that account and never to Keenan.
  const issued = await admin.rpc("issue_quote_link", { p_lead_id: leadId });
  if (issued.error || typeof issued.data !== "string" || issued.data === "") throw new Error(`issue_quote_link: ${issued.error?.message ?? "no token"}`);
  const handed = await admin.from("quote_links").update({ created_by: setter.id }).eq("lead_id", leadId).is("revoked_at", null).select("id").single();
  if (handed.error) throw new Error(`link to the setter: ${handed.error.message}`);

  // Three mockups: a Main, one marked for Front lower, and a Phone scene.
  const mockupIds = [];
  const rows = [
    { name: "Warm white", is_main: true },
    { name: "Front lower", offer_ids: ["front_lower"] },
    { name: "Christmas", is_scene: true },
  ];
  for (const [at, row] of rows.entries()) {
    const path = `${setter.id}/${randomUUID()}.jpg`;
    const uploaded = await admin.storage.from(BUCKET).upload(path, picture, { contentType: "image/jpeg" });
    if (uploaded.error) throw new Error(`mockup ${row.name}: ${uploaded.error.message}`);
    const inserted = await admin
      .from("lead_mockups")
      .insert({
        lead_id: leadId,
        storage_path: path,
        name: row.name,
        is_main: row.is_main === true,
        is_scene: row.is_scene === true,
        offer_ids: row.offer_ids ?? [],
        position: at,
        created_by: ownerId,
      })
      .select("id")
      .single();
    if (inserted.error) throw new Error(`mockup row ${row.name}: ${inserted.error.message}`);
    mockupIds.push(inserted.data.id);
  }

  return { leadId, quoteId: quote.data.id, linkId: handed.data.id, quoteUrl: `${base}/q/${issued.data}`, mockupIds, firstName, address, setter };
}

// ---------------------------------------------------------------- the owner's side

let session = null;
let page = null;
// Launched only once the guard below has passed.
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
  await where.goto(`${base}/app/admin/settings`);
  await settle(where);
  const kindField = where.locator("#settings-black_friday_kind");
  await kindField.waitFor({ timeout: 20000 });
  await kindField.selectOption(kind);
  if (kind !== "none") await where.locator("#settings-black_friday_value").fill(String(value));
  await where.getByRole("button", { name: "Save settings", exact: true }).click();
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
      total: button.querySelector('[data-testid="price-option-total"]')?.textContent ?? "",
    })),
  );

// Meeting mode on Your price, with the Black Friday button, off.
async function openYourPrice(leadId, priceLabel) {
  const owner = await ownerPage();
  page = owner.page;
  await page.goto(`${base}/meeting/${leadId}#quote`);
  await dots(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await goToScreen(page, priceLabel);
  const region = page.getByRole("region", { name: priceLabel, exact: true });
  const button = region.getByTestId("price-black-friday");
  return { owner, region, button };
}

// A yes on an option: it goes on screen, Choose is tapped, the initials
// layer (if it opens) takes "TB" and Confirm, and the quiet save follows.
async function sayYes(region, offerId, offerName, deck) {
  await region.locator(`[data-testid="price-option"][data-option="${offerId}"]`).click();
  await page.waitForTimeout(600);
  const choose = region.getByTestId("price-choose");
  check(`Choose reads "Choose ${offerName}" with it on screen`, flat(await choose.innerText().catch(() => "")) === fillLine(deckLine(deck, "choose"), { name: offerName }), flat(await choose.innerText().catch(() => "")));
  await choose.click();
  const initials = page.getByTestId("price-initials");
  const opened = await initials
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (opened) {
    await page.locator("#price-initials-field").fill("TB");
    await page.waitForTimeout(200);
    await initials.getByRole("button", { name: "Confirm" }).click();
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
      total: row.querySelector('[data-testid="option-total"]')?.textContent ?? "",
    })),
  );
const heroTotal = async (where) => dollarsIn(await where.getByTestId("hero-total").innerText().catch(() => ""));
const dealLineOnLink = (where) => where.locator(`[data-testid="quote-lines"] .quote-row[data-line="${DEAL}"][data-shown="true"]`);

// ---------------------------------------------------------------- the run

// Refuse to start while a deal is already set: nothing is changed.
{
  const current = await dealInDb();
  if (current.black_friday_kind !== null && current.black_friday_kind !== undefined) {
    console.log(`NOTE Settings already has a Black Friday deal (${current.black_friday_kind} ${current.black_friday_value}), so this script did not start and changed nothing. Set the deal to None in Settings and run it again.`);
    process.exit(0);
  }
}

await mkdir(out, { recursive: true });
if (shots) await mkdir(shots, { recursive: true });
browser = await chromium.launch();
let dealTouched = false;
const staged = { percent: null, dollars: null };
const kept = { earningsId: null, uiMockupId: null };
const keep = process.env.KEEP === "1";

// Everything the run made, gone: each staged lead with what hangs off it
// (the commission, the links, the quote, the mockup rows and their files,
// the uploaded mockup included, photos and events), then the setters.
async function removeEverything() {
  const lines = [];
  const leadIds = Object.values(staged)
    .filter(Boolean)
    .map((lead) => lead.leadId);
  const del = async (table, column, values) => {
    if (values.length === 0) return;
    const { error } = await admin.from(table).delete().in(column, values);
    if (error) lines.push(`SCRIPT ERROR removing ${table}: ${error.message}`);
  };
  if (leadIds.length > 0) {
    const { data: mockups } = await admin.from("lead_mockups").select("storage_path").in("lead_id", leadIds);
    const { data: photos } = await admin.from("lead_photos").select("storage_path").in("lead_id", leadIds);
    const paths = [...(mockups ?? []), ...(photos ?? [])].map((row) => row.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { error } = await admin.storage.from(BUCKET).remove(paths);
      if (error) lines.push(`SCRIPT ERROR removing ${paths.length} files: ${error.message}`);
    }
    await del("earnings", "lead_id", leadIds);
    await del("slot_holds", "lead_id", leadIds);
    await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
    await del("meetings", "lead_id", leadIds);
    await del("quote_links", "lead_id", leadIds);
    await del("quotes", "lead_id", leadIds);
    await del("lead_mockups", "lead_id", leadIds);
    await del("roofline_traces", "lead_id", leadIds);
    await del("lead_photos", "lead_id", leadIds);
    await del("lead_events", "lead_id", leadIds);
    await del("leads", "id", leadIds);
    lines.push(`REMOVED ${leadIds.length} test ${leadIds.length === 1 ? "lead" : "leads"} with their quotes, links, mockups (${paths.length} files), photos, events and the commission`);
  }
  for (const person of Object.values(setters)) {
    if (!person.id) continue;
    await admin.from("slot_holds").delete().eq("holder_id", person.id);
    await admin.from("knock_sessions").delete().eq("user_id", person.id);
    await admin.from("leads").delete().eq("created_by", person.id);
    const { error } = await admin.auth.admin.deleteUser(person.id);
    lines.push(error ? `SCRIPT ERROR removing setter ${person.email}: ${error.message}` : `REMOVED setter ${person.email}`);
  }
  const { count: leadsLeft } = leadIds.length > 0 ? await admin.from("leads").select("id", { count: "exact", head: true }).in("id", leadIds) : { count: 0 };
  const { data: people } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const settersLeft = (people?.users ?? []).filter((u) => (u.email ?? "").startsWith(`bf-live-${stamp}`)).length;
  lines.push(`${(leadsLeft ?? 0) === 0 && settersLeft === 0 ? "PASS" : "FAIL"} every test record this run made is gone [${leadsLeft ?? 0} leads, ${settersLeft} setters left]`);
  return lines;
}
let ownerId = null;

try {
  note(
    keep
      ? "this walk-through writes with the owner's one-time session, on test records only; KEEP=1, so nothing is deleted and the records stay"
      : "this walk-through writes with the owner's one-time session, on test records only, and removes them at the end",
  );

  // ---------------------------------------------------------------- staging
  await makeSetter(setters.percent);
  await makeSetter(setters.dollars);
  const { data: ownerRow } = await admin.from("profiles").select("id").eq("role", "owner").single();
  ownerId = ownerRow.id;
  const { data: settings } = await admin.from("settings").select("deck, commission_rate, gst_rate, gst_enabled").eq("id", 1).single();
  const deck = settings.deck;
  const PRICE = deckLine(deck, "price_headline");
  const rate = Number(settings.commission_rate);
  const expectedCommission = Math.round(COMMISSION_BASE * rate * 100) / 100;
  if (rate !== 0.05) note(`the commission rate in Settings is ${rate * 100}%, so the commission check uses that rate on the same base`);
  const { data: colours } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order");
  const white = (colours ?? []).find((colour) => /^white$/i.test(colour.name.trim()));
  if (!white) throw new Error("no active track colour named White");
  const picture = await housePicture();
  const common = { ownerId, white, gstRate: Number(settings.gst_rate ?? 0.05), picture };
  staged.percent = await stageLead({ ...common, setter: setters.percent, firstName: "TEST LEAD (Black Friday)", address: `1 Blackfriday Test Street NW ${stamp}` });
  staged.dollars = await stageLead({ ...common, setter: setters.dollars, firstName: "TEST LEAD (Black Friday, dollars)", address: `2 Blackfriday Test Street NW ${stamp}` });
  const A = staged.percent;
  const B = staged.dollars;

  // ---------------------------------------------------------------- one mockup through the lead page, as Keenan
  {
    const owner = await ownerPage();
    page = owner.page;
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 120)));
    await page.goto(`${base}/app/leads/${A.leadId}`);
    await settle(page);
    const card = page.getByTestId("mockup-card");
    await card.waitFor({ timeout: 20000 }).catch(() => {});
    check("the lead page's Mockups section shows the three staged mockups and Add mockups", (await page.getByTestId("mockup-tile").count()) === 3 && (await page.getByTestId("mockups-add").count()) === 1, `${await page.getByTestId("mockup-tile").count()} tiles`);
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, "lead-mockups-staged");

    const big = await bigJpeg();
    note(`the big JPEG: 8000 x 6000, ${mb(big.buffer.length)} (noise sigma ${big.sigma}, quality ${big.quality})`);
    const input = page.getByTestId("mockup-input");
    await input.setInputFiles([{ name: "big-house.jpg", mimeType: "image/jpeg", buffer: big.buffer }]);
    const uploaded = await until(async () => (await mockupRows(A.leadId)).find((row) => row.storage_path.startsWith(`${ownerId}/`)) ?? null, 180000, 2000);
    await page.getByTestId("mockup-uploading").first().waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1000);
    check("the JPEG lands as a new lead_mockups row of Keenan's, not the Main (the house has one)", Boolean(uploaded) && uploaded.is_main === false && uploaded.created_by === ownerId, uploaded ? uploaded.storage_path : "no row");
    if (uploaded) {
      kept.uiMockupId = uploaded.id;
      const { data: file, error: downloadError } = await admin.storage.from(BUCKET).download(uploaded.storage_path);
      if (downloadError || !file) {
        check("the uploaded mockup's file can be read back", false, downloadError?.message ?? "no file");
      } else {
        const bytes = Buffer.from(await file.arrayBuffer());
        const meta = await sharp(bytes).metadata();
        const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
        check(
          "the stored picture is 3200 px on the long edge and under 2.5 MB",
          longEdge === 3200 && bytes.length < 2.5 * 1024 * 1024,
          `${meta.width} x ${meta.height}, ${mb(bytes.length)}, ${meta.format}`,
        );
        note(`the mockup uploaded through the lead page is stored at ${meta.width} x ${meta.height}, ${mb(bytes.length)} (${meta.format})`);
      }
    }
    // The new tile arrives with the page's refresh, a moment after the row.
    for (let i = 0; i < 60 && (await page.getByTestId("mockup-tile").count()) < 4; i += 1) await page.waitForTimeout(500);
    check("the Mockups section shows four tiles and no error after the JPEG", (await page.getByTestId("mockup-tile").count()) === 4 && (await page.getByTestId("mockups-error").count()) === 0, `${await page.getByTestId("mockup-tile").count()} tiles`);
    await shot(page, "lead-mockups-big-jpeg");

    // A HEIC by name and type that this browser can't decode (Chromium reads
    // a file by its bytes, so the bytes must be no picture at all): the
    // point is the message, and that nothing is added.
    const notAPicture = randomBytes(4096);
    const rowsBefore = (await mockupRows(A.leadId)).length;
    await input.setInputFiles([{ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: notAPicture }]);
    const errorLine = page.getByTestId("mockups-error");
    await errorLine.waitFor({ timeout: 30000 }).catch(() => {});
    await page.getByTestId("mockup-uploading").first().waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const errorText = flat(await errorLine.innerText().catch(() => ""));
    const rowsAfter = (await mockupRows(A.leadId)).length;
    check(
      "the HEIC shows the card's \"couldn't be read\" line and adds no row",
      errorText !== "" && /read/i.test(errorText) && rowsAfter === rowsBefore,
      `"${errorText}", ${rowsAfter - rowsBefore} rows added`,
    );
    check("nothing else broke: the four tiles are still there, Add mockups is back, and the page threw nothing", (await page.getByTestId("mockup-tile").count()) === 4 && (await page.getByTestId("mockups-add").isEnabled().catch(() => false)) && pageErrors.length === 0, pageErrors.join(" | "));
    await shot(page, "lead-mockups-heic");
    await closeOwner(owner.context);
  }

  // ---------------------------------------------------------------- 1. Settings: Percent off, 15
  {
    const owner = await ownerPage();
    page = owner.page;
    dealTouched = true;
    const saved = await setDealInSettings(page, "percent", PERCENT);
    await shot(page, "settings-percent-saved");
    const deal = await dealInDb();
    check("Settings saves Percent off 15 and says so", saved && deal.black_friday_kind === "percent" && Number(deal.black_friday_value) === PERCENT, `${saved ? "Saved at shown" : "no Saved at"}; ${JSON.stringify(deal)}`);
    await closeOwner(owner.context);
  }

  // ---------------------------------------------------------------- 2. Your price at 15% off, a yes on Full wrap
  {
    const { owner, region, button } = await openYourPrice(A.leadId, PRICE);
    check("with the deal set, Your price shows the Black Friday button, off", (await button.count()) === 1 && (await button.getAttribute("aria-pressed")) === "false" && flat(await button.innerText()) === DEAL, flat(await button.innerText().catch(() => "")));
    await shot(page, "your-price-deal-off");
    await button.click();
    await page.waitForTimeout(700);
    const rows = await priceRows(region);
    const full = rows.find((row) => row.id === "full");
    const front = rows.find((row) => row.id === "front_lower");
    check(
      "on, the button names the deal and Full wrap shows $4,156 struck beside $3,532.60",
      (await button.getAttribute("aria-pressed")) === "true" &&
        flat(await button.innerText()).includes(`${PERCENT}% off`) &&
        full !== undefined &&
        full.regular !== null &&
        dollarsIn(full.regular) === FULL_REGULAR &&
        dollarsIn(full.total) === FULL_AT_PERCENT,
      JSON.stringify(rows),
    );
    // Front lower is $2,708 before the deal; 15% off takes it under the
    // $2,500 minimum, which lifts it back, so $2,708 is struck beside $2,500.
    check(
      "Front lower: $2,708 struck beside $2,500, the minimum lifting it",
      front !== undefined && front.regular !== null && dollarsIn(front.regular) === FRONT_REGULAR && dollarsIn(front.total) === MINIMUM,
      JSON.stringify(front ?? null),
    );
    await shot(page, "your-price-15-percent");
    const opened = await sayYes(region, "full", "Full wrap", deck);
    check("the yes opened the initials layer, took TB and Confirm, and moved on", opened && (await page.getByTestId("price-initials").isVisible().catch(() => false)) === false);
    await shot(page, "after-yes-full-wrap");
    const quote = await until(async () => {
      const row = await quoteFor(A.leadId);
      return row && dealLines(row.discounts).length === 1 ? row : null;
    }, 30000);
    const lines = dealLines(quote?.discounts);
    const shape = lines[0] ? lineShape(lines[0]) : null;
    check(
      "the quiet save puts exactly one line on the quote: Black Friday, 623.40, 15%, and the choice Full wrap",
      quote !== null &&
        quote.id === A.quoteId &&
        Array.isArray(quote.discounts) &&
        quote.discounts.length === 1 &&
        shape !== null &&
        shape.keys === "amount,label,percent" &&
        shape.amount === FULL_PERCENT_OFF &&
        shape.percent === PERCENT &&
        quote.meeting_offer === "full",
      `${JSON.stringify(quote?.discounts)} | meeting_offer ${quote?.meeting_offer} | quote ${quote?.id === A.quoteId ? "same" : "another"}`,
    );
    check(
      "the saved quote stores the chosen option's numbers: subtotal and total 3532.60",
      quote !== null && Number(quote.subtotal) === FULL_AT_PERCENT && Number(quote.total) === FULL_AT_PERCENT,
      `subtotal ${quote?.subtotal}, total ${quote?.total}`,
    );
    await closeOwner(owner.context);
  }

  // ---------------------------------------------------------------- 3. The customer's link at 390
  {
    const customer = await browser.newContext(PHONE);
    page = await customer.newPage();
    await page.goto(A.quoteUrl);
    await settle(page);
    await page.waitForTimeout(800);
    // Round 17: What's in sits behind See the breakdown on the picked card.
    await page.locator('[data-testid="option-row"][data-selected="true"] [data-testid="option-breakdown-toggle"]').click();
    await page.getByTestId("quote-lines").waitFor({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    let rows = await linkRows(page);
    check(
      "the link opens on Full wrap at $3,532.60, with the Black Friday line in its breakdown",
      rows.find((row) => row.selected)?.offer === "full" &&
        (await heroTotal(page)) === FULL_AT_PERCENT &&
        (await dealLineOnLink(page).count()) === 1 &&
        flat(await dealLineOnLink(page).innerText().catch(() => "")).includes("623.40"),
      `${JSON.stringify(rows)} | hero ${await heroTotal(page)} | deal line ${flat(await dealLineOnLink(page).innerText().catch(() => "none"))}`,
    );
    check("no sideways scroll at 390", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    await shot(page, "link-390-full-wrap");
    await page.locator('[data-testid="option-row"][data-offer="front_lower"] label').click();
    await page.waitForTimeout(800);
    rows = await linkRows(page);
    check("Front lower: $2,500, the minimum", rows.find((row) => row.selected)?.offer === "front_lower" && (await heroTotal(page)) === MINIMUM, `hero ${await heroTotal(page)}`);
    await shot(page, "link-390-front-lower");
    await page.locator('[data-testid="option-row"][data-offer="full"] label').click();
    await page.waitForTimeout(800);
    check("back to Full wrap: $3,532.60 again", (await linkRows(page)).find((row) => row.selected)?.offer === "full" && (await heroTotal(page)) === FULL_AT_PERCENT, `hero ${await heroTotal(page)}`);
    await customer.close();
  }

  // ---------------------------------------------------------------- 4. The lead page and the Accepted sheet
  {
    const owner = await ownerPage();
    page = owner.page;
    await page.goto(`${base}/app/leads/${A.leadId}`);
    await settle(page);
    const summary = flat(await page.getByTestId("quote-summary-line").innerText().catch(() => ""));
    check(
      "the lead page's Quote card prices the options with the deal: Full wrap $3,532.60, Front lower $2,500",
      summary.includes(`Full wrap ${money(FULL_AT_PERCENT)}`) && summary.includes(`Front lower ${money(MINIMUM)}`),
      summary,
    );
    await page.getByTestId("outcome-accept").click();
    const sheet = page.getByTestId("outcome-accept-sheet");
    await sheet.waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    const offered = await sheet.getByTestId("outcome-option").evaluateAll((rows) =>
      rows.map((row) => ({
        offer: row.getAttribute("data-offer"),
        meeting: row.getAttribute("data-meeting"),
        checked: Boolean(row.querySelector("input")?.checked),
        total: (row.querySelector('[data-testid="outcome-option-total"]')?.textContent ?? "").trim(),
        commission: (row.querySelector('[data-testid="outcome-option-commission"]')?.textContent ?? "").trim(),
      })),
    );
    const fullRow = offered.find((row) => row.offer === "full");
    check(
      "the Accepted sheet starts on Full wrap, the meeting's choice, at $3,532.60 with its commission",
      fullRow !== undefined && fullRow.meeting === "yes" && fullRow.checked && dollarsIn(fullRow.total) === FULL_AT_PERCENT && fullRow.commission === `${money(expectedCommission)} commission`,
      JSON.stringify(offered),
    );
    if (fullRow && !fullRow.checked) await sheet.locator('[data-testid="outcome-option"][data-offer="full"]').click();
    await shot(page, "accepted-sheet");
    const confirm = sheet.getByTestId("outcome-accept-confirm");
    check("Mark accepted is ready, the track colour being set", flat(await confirm.innerText().catch(() => "")) === "Mark accepted" && (await confirm.isEnabled().catch(() => false)));
    await confirm.click();
    await sheet.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
    await page
      .waitForFunction(() => document.querySelector('[data-testid="quote-outcome"]')?.getAttribute("data-state") === "accepted", null, { timeout: 30000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    const accepted = await quoteFor(A.leadId);
    const acceptedLines = dealLines(accepted?.discounts);
    const acceptedShape = acceptedLines[0] ? lineShape(acceptedLines[0]) : null;
    check(
      "the quote is accepted on Full wrap, its Black Friday line unchanged at 623.40, 15%, and its totals 3532.60",
      accepted?.status === "accepted" &&
        accepted?.accepted_offer === "full" &&
        accepted?.discounts?.length === 1 &&
        acceptedShape?.amount === FULL_PERCENT_OFF &&
        acceptedShape?.percent === PERCENT &&
        Number(accepted?.subtotal) === FULL_AT_PERCENT &&
        Number(accepted?.total) === FULL_AT_PERCENT,
      `${accepted?.status}, ${accepted?.accepted_offer}, ${JSON.stringify(accepted?.discounts)}, subtotal ${accepted?.subtotal}, total ${accepted?.total}`,
    );
    const { data: earnings } = await admin
      .from("earnings")
      .select("id, profile_id, type, rate, base_amount, amount, status")
      .eq("lead_id", A.leadId)
      .eq("type", "commission");
    const commissionRow = earnings?.[0] ?? null;
    kept.earningsId = commissionRow?.id ?? null;
    check(
      `one commission to the setter: ${rate * 100}% of lights and box after the discount (3456 + 500 - 623.40 = 3332.60), ${money(expectedCommission)}`,
      earnings?.length === 1 &&
        commissionRow.profile_id === setters.percent.id &&
        Number(commissionRow.base_amount) === COMMISSION_BASE &&
        Number(commissionRow.amount) === expectedCommission &&
        commissionRow.status === "pending",
      JSON.stringify(earnings),
    );
    const card = page.getByTestId("quote-outcome");
    check(
      "the outcome card reads Accepted, names Full wrap, and the commission to the setter",
      (await card.getAttribute("data-state").catch(() => null)) === "accepted" &&
        flat(await page.getByTestId("quote-outcome-option").innerText().catch(() => "")).startsWith("Full wrap") &&
        flat(await page.getByTestId("quote-outcome-commission").innerText().catch(() => "")).includes(money(expectedCommission)) &&
        flat(await page.getByTestId("quote-outcome-commission").innerText().catch(() => "")).includes(setters.percent.name),
      `${flat(await page.getByTestId("quote-outcome-option").innerText().catch(() => ""))} | ${flat(await page.getByTestId("quote-outcome-commission").innerText().catch(() => ""))}`,
    );
    const { data: leadA } = await admin.from("leads").select("status").eq("id", A.leadId).single();
    check("the lead is Sold", leadA?.status === "sold", leadA?.status ?? "");
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await shot(page, "outcome-card-accepted");
    await closeOwner(owner.context);
  }

  // ---------------------------------------------------------------- 5. Dollars off, 300, on the second lead
  {
    const owner = await ownerPage();
    page = owner.page;
    const saved = await setDealInSettings(page, "amount", DOLLARS);
    const deal = await dealInDb();
    check("Settings saves Dollars off 300", saved && deal.black_friday_kind === "amount" && Number(deal.black_friday_value) === DOLLARS, `${saved ? "Saved at shown" : "no Saved at"}; ${JSON.stringify(deal)}`);
    await shot(page, "settings-dollars-saved");
    await closeOwner(owner.context);
  }
  {
    const { owner, region, button } = await openYourPrice(B.leadId, PRICE);
    check("the second lead's Your price shows the button, off", (await button.count()) === 1 && (await button.getAttribute("aria-pressed")) === "false");
    await button.click();
    await page.waitForTimeout(700);
    const rows = await priceRows(region);
    const full = rows.find((row) => row.id === "full");
    const front = rows.find((row) => row.id === "front_lower");
    check(
      "$300 off: Full wrap $4,156 struck beside $3,856; Front lower $2,708 struck beside $2,500 (2708 - 300 = 2408, lifted to the minimum)",
      flat(await button.innerText()).includes(`$${DOLLARS} off`) &&
        full !== undefined &&
        dollarsIn(full.regular ?? "") === FULL_REGULAR &&
        dollarsIn(full.total) === FULL_AT_DOLLARS &&
        front !== undefined &&
        front.regular !== null &&
        dollarsIn(front.regular) === FRONT_REGULAR &&
        dollarsIn(front.total) === MINIMUM,
      JSON.stringify(rows),
    );
    await shot(page, "your-price-300-off");
    const opened = await sayYes(region, "front_lower", "Front lower", deck);
    check("the yes on Front lower took the initials and moved on", opened && (await page.getByTestId("price-initials").isVisible().catch(() => false)) === false);
    const quote = await until(async () => {
      const row = await quoteFor(B.leadId);
      return row && dealLines(row.discounts).length === 1 ? row : null;
    }, 30000);
    const lines = dealLines(quote?.discounts);
    const shape = lines[0] ? lineShape(lines[0]) : null;
    check(
      "the saved line is Black Friday, 300, with no percent, and the choice Front lower",
      quote !== null &&
        quote.id === B.quoteId &&
        quote.discounts?.length === 1 &&
        shape !== null &&
        shape.keys === "amount,label" &&
        shape.amount === DOLLARS &&
        quote.meeting_offer === "front_lower",
      `${JSON.stringify(quote?.discounts)} | meeting_offer ${quote?.meeting_offer} | quote ${quote?.id === B.quoteId ? "same" : "another"}`,
    );
    check(
      "the saved quote stores Front lower's numbers: subtotal and total 2500",
      quote !== null && Number(quote.subtotal) === MINIMUM && Number(quote.total) === MINIMUM,
      `subtotal ${quote?.subtotal}, total ${quote?.total}`,
    );
    await closeOwner(owner.context);
  }
  {
    const customer = await browser.newContext(PHONE);
    page = await customer.newPage();
    await page.goto(B.quoteUrl);
    await settle(page);
    await page.waitForTimeout(800);
    check("the second link opens on Front lower at $2,500", (await linkRows(page)).find((row) => row.selected)?.offer === "front_lower" && (await heroTotal(page)) === MINIMUM, `hero ${await heroTotal(page)}`);
    await shot(page, "link-390-dollars-front-lower");
    await page.locator('[data-testid="option-row"][data-offer="full"] label').click();
    await page.waitForTimeout(800);
    check("Full wrap on it: $3,856, the same $300 off", (await linkRows(page)).find((row) => row.selected)?.offer === "full" && (await heroTotal(page)) === FULL_AT_DOLLARS, `hero ${await heroTotal(page)}`);
    await shot(page, "link-390-dollars-full-wrap");
    await customer.close();
  }
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)}${page ? ` at ${safeUrl(page)}` : ""}`);
  if (page) await page.screenshot({ path: `${out}/black-friday-failure.png` }).catch(() => {});
} finally {
  // ---------------------------------------------------------------- 6. Settings back to None
  if (session) await session.close().catch(() => {});
  session = null;
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

  // ---------------------------------------------------------------- 7. the test records: removed, or kept for Keenan with KEEP=1
  if (keep) {
    results.push("KEPT the test records left in place (nothing was deleted):");
    for (const person of Object.values(setters)) {
      results.push(`KEPT setter ${person.email} (${person.name})${person.id ? `, id ${person.id}` : ", not made"}`);
    }
    for (const [key, lead] of Object.entries(staged)) {
      if (!lead) {
        results.push(`KEPT lead (${key}) was not staged`);
        continue;
      }
      results.push(`KEPT lead ${lead.leadId}: ${lead.firstName} ${stamp}, ${lead.address}, by ${lead.setter.email}`);
      results.push(`KEPT quote ${lead.quoteId} on lead ${lead.leadId}`);
      results.push(`KEPT quote link ${lead.linkId} on lead ${lead.leadId} (token not printed)`);
      results.push(`KEPT mockups ${lead.mockupIds.join(", ")} on lead ${lead.leadId}`);
    }
    if (kept.uiMockupId) results.push(`KEPT mockup ${kept.uiMockupId} uploaded through the lead page by Keenan, in the owner's folder of ${BUCKET}`);
    results.push(kept.earningsId ? `KEPT earnings ${kept.earningsId}: the commission on the first lead's quote` : "KEPT earnings: none made");
  } else {
    results.push(...(await removeEverything().catch((error) => [`SCRIPT ERROR removing the test records: ${error?.message ?? String(error)}`])));
  }
  if (browser) await browser.close().catch(() => {});
  if (shots) results.push(`NOTE screenshots in ${shots}: ${shotNames.join(", ")}`);
  console.log(results.join("\n"));
  process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
}
