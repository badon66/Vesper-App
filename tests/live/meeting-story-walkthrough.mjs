// Live walk-through of round 9, the meeting as one story (Keenan,
// 2026-11-10; the five seats' spec), against a running build. It stages a
// throwaway setter and a TEST LEAD with house photos, a roofline traced on
// the Front photo, a mockup, a quote of six measured runs (four lower, two
// upper with an upper gable) and three options (Full wrap, Main floor and
// Front only, the last under the minimum), a meeting at 11 pm on the
// booking window's last evening hosted by the throwaway setter (so no real
// evening is touched) and a live quote link the setter made (so no notice
// reaches Keenan).
//
// Keenan's side is the one-time owner session (owner-session.mjs), which
// only looks: in meeting mode it pages through, taps the options on the
// price page to put each on screen, opens the Edit layer, What we measured
// and Pick a day, and never taps Choose, a day, Save, Confirm or the
// colour's timing (each of those saves). The service role stands in for
// the writes the review needs to see: the option and day chosen at the
// table, and a made-to-order colour. On the lead page it opens the Quote
// card's Edit the quote sheet and never saves; on the outcome card it opens
// the Accepted sheet and never marks it. The customer, with no session,
// opens the link at 390 and 430, picks options and books one.
//
// With SHOTS set to a folder, the review's screenshots are saved there in
// order, each named with a two-digit prefix. HOUSE_PHOTO may name a JPEG of
// a house (2400 x 1800) to stage instead of the drawn one. Everything
// staged is removed at the end, and nothing of Keenan's changes.
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
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
  console.error("The meeting story walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const BUCKET = "lead-photos";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const setter = { email: `story-live-a-${stamp}@example.com`, password: `cedar-lantern-orbit-${digits}`, name: "Story Test Setter", id: null };
const street = `${stamp} Storytest Crescent SW`;

const IPAD = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const PHONE_MAX = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

// ---------------------------------------------------------------- words and dates

const calgaryZone = (moment) => (moment.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton");
const calgaryDay = (moment = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(moment), year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const longDay = (day) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
const fullDate = (day) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${day}T12:00:00Z`));
// lib/pricing.ts formatMoney: whole dollars when there are no cents.
const money = (amount) => {
  const cents = Math.round(Math.abs(amount) * 100);
  const text = (cents / 100).toLocaleString("en-CA", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}$${text}`;
};
// Text as the checks compare it: spaces collapsed, curly apostrophes straight.
const flat = (text) => (text ?? "").replace(/\s+/g, " ").replace(/[‘’]/g, "'").trim();
const tight = (text) => flat(text).replace(/\s+/g, "");

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
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

// Brings an element to the top of the phone's screen for a screenshot.
async function scrollTo(page, testId) {
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 12, behavior: "instant" });
  }, testId);
  await page.waitForTimeout(350);
}

// ---------------------------------------------------------------- data helpers

async function ownerFootprint(ownerId) {
  const [profile, leads, events, settings, colours, quotes, links] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).single(),
    admin.from("leads").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("lead_events").select("id").eq("actor_id", ownerId).order("id"),
    admin.from("settings").select("*").eq("id", 1).single(),
    admin.from("track_colours").select("*").order("id"),
    admin.from("quotes").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("quote_links").select("id, updated_at").eq("created_by", ownerId).order("id"),
  ]);
  return JSON.stringify({ profile: profile.data, leads: leads.data, events: events.data, settings: settings.data, colours: colours.data, quotes: quotes.data, links: links.data });
}

// The test lead's own rows, to prove a look writes nothing.
async function leadFootprint(leadId) {
  const [lead, quotes, events, earnings] = await Promise.all([
    admin.from("leads").select("status, install_on, track_colour_id, track_ral_code, track_colour_initials, updated_at").eq("id", leadId).single(),
    admin.from("quotes").select("id, status, updated_at, meeting_offer, meeting_install_on, accepted_offer").eq("lead_id", leadId).order("id"),
    admin.from("lead_events").select("id, type").eq("lead_id", leadId).order("id"),
    admin.from("earnings").select("id").eq("lead_id", leadId),
  ]);
  return JSON.stringify({ lead: lead.data, quotes: quotes.data, events: (events.data ?? []).filter((e) => e.type !== "quote_link_opened"), earnings: earnings.data });
}

async function accountEmails() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users ?? []).map((u) => u.email ?? "");
}

// A house at 2400 x 1800 drawn to sit under the staged trace: a two-storey
// gable over the main roof's eave, and a garage line on the left.
async function housePhoto() {
  if (process.env.HOUSE_PHOTO) return readFile(process.env.HOUSE_PHOTO);
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
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

await mkdir(out, { recursive: true });
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch();
let session = null;
let page = null;
let leadId = null;
const paths = [];

// Opens a fresh iPad-sized context on the owner's one-time session.
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
  await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", setter.id);
  const { data: ownerRow } = await admin.from("profiles").select("id").eq("role", "owner").single();
  const ownerId = ownerRow.id;
  const { data: settings } = await admin
    .from("settings")
    .select("deck, light_looks, warranty_text, price_per_ft, box_price, gst_enabled, gst_rate")
    .eq("id", 1)
    .single();
  const gst = Boolean(settings.gst_enabled);
  const screen = (amount) => (gst ? `${money(amount)} + GST` : money(amount));
  const { data: colours } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order");
  const white = (colours ?? []).find((c) => /^white$/i.test(c.name.trim())) ?? colours?.[0];
  const madeToOrder = (colours ?? []).find((c) => !/^white\b/i.test(c.name.trim())) ?? null;
  if (!white) throw new Error("no active track colour");

  const lead = await admin
    .from("leads")
    .insert({
      first_name: TEST_LEAD,
      last_name: "Story",
      address_line: street,
      created_by: setter.id,
      soffit_colour: "off_white",
      phone: "+14035550100",
      owns_home: true,
      wants_price: true,
      both_decision_makers: true,
    })
    .select("id")
    .single();
  if (lead.error) throw new Error(`lead: ${lead.error.message}`);
  leadId = lead.data.id;
  await admin.from("leads").update({ track_colour_id: white.id }).eq("id", leadId);

  // The house: Front, both corners and a mockup; the roofline traced on the Front photo.
  const house = await housePhoto();
  const mockup = await sharp(house).modulate({ brightness: 0.35 }).tint("#1d3445").jpeg().toBuffer();
  const photoIds = {};
  for (const [slot, buffer] of [["front", house], ["left_corner", house], ["right_corner", house], ["mockup", mockup]]) {
    const path = `${setter.id}/${crypto.randomUUID()}.jpg`;
    const uploaded = await admin.storage.from(BUCKET).upload(path, buffer, { contentType: "image/jpeg" });
    if (uploaded.error) throw new Error(`photo ${slot}: ${uploaded.error.message}`);
    paths.push(path);
    const row = await admin.from("lead_photos").insert({ lead_id: leadId, storage_path: path, slot }).select("id").single();
    if (row.error) throw new Error(`photo row ${slot}: ${row.error.message}`);
    photoIds[slot] = row.data.id;
  }
  const n = (x, y) => [Math.round((x / 2400) * 1e5) / 1e5, Math.round((y / 1800) * 1e5) / 1e5];
  const trace = await admin.from("roofline_traces").insert({
    lead_id: leadId,
    photo_id: photoIds.front,
    photo_slot: "front",
    lines: [[n(840, 560), n(1400, 250), n(1960, 560)], [n(840, 562), n(1960, 562)], [n(200, 950), n(940, 950)]],
    line_feet: [],
    scale: { a: n(330, 1450), b: n(820, 1450), feet: 16, kind: "double" },
    dusk_brightness: 0.62,
    luminance: 0.55,
    light_count: 157,
  });
  if (trace.error) throw new Error(`trace: ${trace.error.message}`);

  // Round 10: the house's mockups, inserted straight into lead_mockups by
  // the service role (the lead page's Mockups section is looked at, not
  // used): a Main, a Day, a Night, two scenes, and one for Front only.
  const mockupRows = [
    { name: "Warm white", is_main: true },
    { name: "By day", is_day: true },
    { name: "At night", is_night: true },
    { name: "Christmas", is_scene: true },
    { name: "Halloween", is_scene: true },
    { name: "Front only", offer_ids: ["front"] },
  ];
  for (const [at, row] of mockupRows.entries()) {
    const path = `${setter.id}/${crypto.randomUUID()}.jpg`;
    const uploaded = await admin.storage.from(BUCKET).upload(path, at === 1 ? house : mockup, { contentType: "image/jpeg" });
    if (uploaded.error) throw new Error(`mockup ${row.name}: ${uploaded.error.message}`);
    paths.push(path);
    const inserted = await admin.from("lead_mockups").insert({
      lead_id: leadId,
      storage_path: path,
      name: row.name,
      is_main: row.is_main === true,
      is_day: row.is_day === true,
      is_night: row.is_night === true,
      is_scene: row.is_scene === true,
      offer_ids: row.offer_ids ?? [],
      position: at,
      created_by: ownerId,
    });
    if (inserted.error) throw new Error(`mockup row ${row.name}: ${inserted.error.message}`);
  }

  // The quote: six runs, three options. At $23 a foot with a $500 box and a
  // $150 neighbour discount: Full wrap 226 ft, $5,198 + $500 + $400 (an
  // upper gable) + $150 (extra work only with upper runs) - $150 = $6,098;
  // Main floor (the four lower runs, 152 ft) $3,846; Front only (Front and
  // Garage, 92 ft) $2,466, so it comes to the $2,500 minimum.
  const runs = [
    { name: "Front", feet: 64, level: "lower", part: "eave" },
    { name: "Garage", feet: 28, level: "lower", part: "garage" },
    { name: "Left side", feet: 30, level: "lower", part: "sides" },
    { name: "Right side", feet: 30, level: "lower", part: "sides" },
    { name: "Front upper", feet: 52, level: "upper", part: "eave" },
    { name: "Upper gable", feet: 22, level: "upper", part: "gable" },
  ];
  const FULL = 6098;
  const MAIN = 3846;
  const FRONT = 2500;
  const validUntil = addDays(calgaryDay(), 120);
  const quote = await admin
    .from("quotes")
    .insert({
      lead_id: leadId,
      created_by: setter.id,
      price_per_ft: 23,
      box_price: 500,
      box_count: 1,
      runs,
      total_feet: 226,
      adders: [{ label: "Extra height", amount: 150, upper_only: true }],
      discounts: [{ label: "Neighbour discount", amount: 150 }],
      gst_rate: settings.gst_rate ?? 0.05,
      gst_enabled: gst,
      min_job_total: 2500,
      subtotal: FULL,
      total: FULL,
      colour_timing: "stock",
      rush_fee: 350,
      upper_access_fee: 200,
      upper_gable_access_fee: 400,
      financing_offered: true,
      track_colour_name: white.name,
      valid_until: validUntil,
      offers: [
        { id: "full", name: "Full wrap", runs: [0, 1, 2, 3, 4, 5] },
        { id: "main", name: "Main floor", runs: [0, 1, 2, 3] },
        { id: "front", name: "Front only", runs: [0, 1] },
      ],
    })
    .select("id")
    .single();
  if (quote.error) throw new Error(`quote: ${quote.error.message}`);
  const quoteId = quote.data.id;

  // The meeting: 11 pm on the booking window's last evening, hosted by the
  // throwaway setter, so it never sits on Keenan's evenings.
  const today = calgaryDay();
  const lastEvening = addDays(today, 14);
  const startsAt = new Date(`${lastEvening}T23:00:00-06:00`);
  const meeting = await admin
    .from("meetings")
    .insert({
      lead_id: leadId,
      host_id: setter.id,
      setter_id: setter.id,
      booked_by: setter.id,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 45 * 60_000).toISOString(),
      everyone_deciding_present: true,
    })
    .select("id")
    .single();
  if (meeting.error) note(`the test meeting could not be staged (${meeting.error.message})`);

  // The link, made by the throwaway setter: its notices go nowhere near Keenan.
  const token = randomBytes(18).toString("base64url");
  const link = await admin.from("quote_links").insert({ lead_id: leadId, token, created_by: setter.id }).select("id").single();
  if (link.error) throw new Error(`link: ${link.error.message}`);
  const quoteUrl = `${base}/q/${token}`;

  const before = await ownerFootprint(ownerId);
  const order = deckOrder(settings, { lead: { traced: true, main: true, day: true, night: true, scenes: 2 } });
  const expected = order.map((p) => p.label);
  const label = (key) => order.find((p) => p.key === key)?.label ?? null;
  const PICKER = label("light_picker");
  const PRICE = label("quote");
  const NEXT = label("next_steps");

  // ---------------------------------------------------------------- meeting mode, every page in order (looks only)
  let owner = await ownerPage();
  page = owner.page;
  let looked = await leadFootprint(leadId);
  await page.goto(`${base}/meeting/${leadId}#start`);
  await dots(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  const labels = await dots(page).getByRole("button").evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
  check(
    "round 10's order: the cover, the Main, day and night, the phone, the warranty, Try it on your house, the price and What happens next",
    JSON.stringify(labels) === JSON.stringify(expected) && expected.length === 8 && Boolean(PICKER),
    `${labels.join(" | ")}${JSON.stringify(labels) === JSON.stringify(expected) ? "" : ` (expected ${expected.join(" | ")})`}`,
  );
  for (const [at, pageLabel] of labels.entries()) {
    await goToScreen(page, pageLabel);
    const region = page.getByRole("region", { name: pageLabel, exact: true });
    const key = await region.getAttribute("data-page");
    if (key === "light_picker") await page.waitForTimeout(4200);
    else await page.waitForTimeout(700);
    await shot(page, `meeting-${slug(pageLabel)}`);

    if (key === "what_vesper_is") {
      check("Up once, there all year shows their Main mockup", (await region.locator("img").count()) > 0);
    }
    if (key === "hidden_by_day") {
      check("Hidden by day: their Day and Night mockups with the slider", (await region.locator("img").count()) === 2);
    }
    if (key === "phone_control") {
      const scenes = await region.getByTestId("phone-scene").evaluateAll((buttons) => buttons.map((b) => b.textContent.trim()));
      check("Run it from your phone: the Main first, then the two scenes, as buttons on a drawn phone", JSON.stringify(scenes) === JSON.stringify(["Warm white", "Christmas", "Halloween"]), scenes.join(", "));
      await region.getByTestId("phone-scene").nth(1).click();
      await page.waitForTimeout(500);
      check("tapping a scene swaps the house picture to it", (await region.getByTestId("phone-scene").nth(1).getAttribute("aria-pressed")) === "true");
      await shot(page, "meeting-phone-christmas");
    }

    if (key === "quote") {
      const rows = await region.getByTestId("price-option").evaluateAll((buttons) =>
        buttons.map((b) => ({ id: b.getAttribute("data-option"), onScreen: b.getAttribute("data-on-screen"), chosen: b.getAttribute("data-chosen"), text: b.textContent.replace(/\s+/g, "") })),
      );
      check(
        "Your price: every option at once, biggest first, every total visible, the full wrap on screen and nothing chosen",
        JSON.stringify(rows.map((r) => r.id)) === JSON.stringify(["full", "main", "front"]) &&
          rows[0].onScreen === "yes" &&
          rows.every((r) => r.chosen === "no") &&
          rows[0].text.includes(tight(screen(FULL))) &&
          rows[1].text.includes(tight(screen(MAIN))) &&
          rows[2].text.includes(tight(screen(FRONT))),
        JSON.stringify(rows),
      );
      check(
        "the sub-line counts the options as a word and names the track colour",
        flat(await region.getByTestId("price-sub").innerText().catch(() => "")) === fillLine(deckLine(settings.deck, "price_sub_many"), { Count: "Three", count: "three", colour: white.name }),
        flat(await region.getByTestId("price-sub").innerText().catch(() => "")),
      );
      check(
        "each option shows what it covers in words, and the full wrap's picture is the Main",
        flat(await region.locator('[data-testid="price-option"][data-option="full"] [data-testid="price-option-coverage"]').innerText()) ===
          "Front, garage, left side, right side and gable, upper and lower: 226 ft" &&
          (await region.getByTestId("price-mockup").count()) === 1,
        flat(await region.locator('[data-testid="price-option-coverage"]').first().innerText().catch(() => "")),
      );
      check(
        "White track: one colour line, in stock",
        flat(await region.getByTestId("price-colour-line").innerText().catch(() => "")) === flat(deckLine(settings.deck, "colour_stock")),
      );
      await region.getByTestId("price-breakdown-open").click();
      await page.getByTestId("price-breakdown").waitFor({ timeout: 5000 }).catch(() => {});
      const fullBreakdown = flat(await page.getByTestId("price-breakdown").innerText().catch(() => ""));
      check(
        "the full wrap's breakdown, one tap away: lights at \"$23 a foot\", upper access with an upper gable, and its coverage line",
        fullBreakdown.includes("226 ft at $23 a foot") &&
          fullBreakdown.includes("Upper roof access") &&
          flat(await page.getByTestId("price-coverage").innerText().catch(() => "")) === "Front, garage, left side, right side and gable, upper and lower: 226 ft",
        fullBreakdown.slice(0, 200),
      );
      await shot(page, "meeting-price-breakdown");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      for (const [id, name] of [["main", "Main floor"], ["front", "Front only"]]) {
        await region.locator(`[data-testid="price-option"][data-option="${id}"]`).click();
        await page.waitForTimeout(700);
        await shot(page, `meeting-${slug(pageLabel)}-${slug(name)}-on-screen`);
      }
      check("Front only shows its own mockup", (await region.getByTestId("price-mockup").getAttribute("data-mockup")) !== null);
      await region.getByTestId("price-breakdown-open").click();
      await page.getByTestId("price-breakdown").waitFor({ timeout: 5000 }).catch(() => {});
      const frontBreakdown = flat(await page.getByTestId("price-breakdown").innerText().catch(() => ""));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      check(
        "tapping an option puts it on screen without choosing it: Front only shows the minimum, \"Before the minimum\" and Keenan's sentence",
        (await region.locator('[data-testid="price-option"][data-option="front"]').getAttribute("data-on-screen")) === "yes" &&
          (await region.locator('[data-testid="price-option"][data-chosen="yes"]').count()) === 0 &&
          frontBreakdown.includes("Before the minimum") &&
          frontBreakdown.includes("To reach our $2,500 minimum") &&
          frontBreakdown.includes("That's under our $2,500 minimum, so this option comes to $2,500.") &&
          flat(await region.getByTestId("price-choose").innerText()) === fillLine(deckLine(settings.deck, "choose"), { name: "Front only" }),
        frontBreakdown.slice(0, 240),
      );
      note("Choose is never tapped in the owner's session: it saves the quote quietly when there's signal, so the chosen state is staged by the service role below");
      await region.locator('[data-testid="price-option"][data-option="full"]').click();
      await page.waitForTimeout(500);
      // The Edit layer, looked at only.
      await region.getByTestId("price-edit").click();
      const editLayer = page.getByTestId("quote-edit-layer");
      await editLayer.waitFor({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
      check(
        "Edit opens the quote editor over the deck: the six measured runs, the three offers, Save (never tapped) and the signal note",
        (await editLayer.getByTestId("editor-run").count()) === 6 &&
          (await editLayer.getByTestId("offer-card").count()) === 3 &&
          (await editLayer.getByTestId("quote-edit-save").count()) === 1 &&
          (await editLayer.getByTestId("quote-edit-status").innerText()).includes("Saving needs signal."),
      );
      await shot(page, "meeting-edit-layer");
      await editLayer.locator("#editor-offers").scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, "meeting-edit-layer-offers");
      await editLayer.getByTestId("quote-edit-done").click();
      await editLayer.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    }

    if (key === "next_steps") {
      const nextText = flat(await region.innerText());
      check(
        "What happens next: a wrap-up with no recap while nothing is chosen, the install day with Pick a day, no payment until it's done, and thanks; no colour book line",
        (await region.getByTestId("next-steps-recap").count()) === 0 &&
          (await region.locator('[data-testid="next-step-install"], [data-testid="next-step-pay"]').count()) === 2 &&
          nextText.includes("No payment until your install is complete.") &&
          (await region.getByTestId("next-steps-thanks").count()) === 1 &&
          !nextText.includes("colour book") &&
          (await region.getByTestId("next-step-pick-day").count()) === 1,
        nextText.slice(0, 200),
      );
      await region.getByTestId("next-step-pick-day").click();
      await page.getByTestId("install-day-picker").waitFor({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      check("Pick a day opens three weeks of days (no day tapped here)", (await page.locator("[data-testid=install-day-picker] button[data-day]").count()) === 21);
      await shot(page, "meeting-pick-a-day");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    }
    if (at === 0) {
      check("the cover's line says what's coming", flat(await page.getByTestId("deck-cover-line").innerText().catch(() => "")) === flat(deckLine(settings.deck, "cover_line")));
    }
  }
  check("paging through meeting mode, the Edit layer and Pick a day wrote nothing", (await leadFootprint(leadId)) === looked);
  await closeOwner(owner.context);

  // ---------------------------------------------------------------- the choice at the table (staged by the service role)
  const tableDay = addDays(today, 10);
  const staged = await admin.from("quotes").update({ meeting_offer: "main", meeting_install_on: tableDay }).eq("id", quoteId);
  if (staged.error) throw new Error(`meeting choice: ${staged.error.message}`);
  owner = await ownerPage();
  page = owner.page;
  looked = await leadFootprint(leadId);
  await page.goto(`${base}/meeting/${leadId}#quote`);
  await dots(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  {
    const region = page.getByRole("region", { name: PRICE, exact: true });
    const chosen = region.locator('[data-testid="price-option"][data-chosen="yes"]');
    check(
      "with Main floor chosen at the table: its button turns light with a tick and \"Your choice\", it opens on screen, and Choose reads Your choice",
      (await chosen.count()) === 1 &&
        (await chosen.getAttribute("data-option")) === "main" &&
        (await chosen.getAttribute("data-on-screen")) === "yes" &&
        flat(await region.getByTestId("price-your-choice").innerText().catch(() => "")) === deckLine(settings.deck, "your_choice") &&
        flat(await region.getByTestId("price-choose").innerText()) === deckLine(settings.deck, "your_choice") &&
        (await region.getByTestId("price-choose").getAttribute("aria-pressed")) === "true",
    );
    const order = await region.getByTestId("price-option").evaluateAll((b) => b.map((x) => x.getAttribute("data-option")));
    check("picking never reorders anything", JSON.stringify(order) === JSON.stringify(["full", "main", "front"]), order.join(", "));
    await shot(page, `meeting-${slug(PRICE)}-main-floor-chosen`);
    await region.locator('[data-testid="price-option"][data-option="full"]').click();
    await page.waitForTimeout(600);
    check(
      "on screen and chosen never look alike: the full wrap on screen, Main floor still the choice",
      (await region.locator('[data-testid="price-option"][data-option="full"]').getAttribute("data-on-screen")) === "yes" &&
        (await region.locator('[data-testid="price-option"][data-option="main"]').getAttribute("data-chosen")) === "yes" &&
        flat(await region.getByTestId("price-choose").innerText()) === fillLine(deckLine(settings.deck, "choose"), { name: "Full wrap" }),
    );
    await shot(page, `meeting-${slug(PRICE)}-full-wrap-on-screen-main-floor-chosen`);
  }
  await goToScreen(page, NEXT);
  {
    const region = page.getByRole("region", { name: NEXT, exact: true });
    const recap = flat(await region.getByTestId("next-steps-recap").innerText().catch(() => ""));
    check(
      "What happens next reads the choice back, priced as the price page prices it, with the day picked at the table",
      recap === fillLine(deckLine(settings.deck, "recap"), { name: "Main floor", total: screen(MAIN) }) &&
        flat(await region.getByTestId("next-step-day").innerText()) === longDay(tableDay),
      `${recap} | ${flat(await region.getByTestId("next-step-day").innerText().catch(() => ""))}`,
    );
    await shot(page, "meeting-what-happens-next-chosen");
  }
  check("looking at the chosen state wrote nothing", (await leadFootprint(leadId)) === looked);
  await closeOwner(owner.context);

  // ---------------------------------------------------------------- Black Friday (round 10), looked at only
  // The walk-through never changes Settings. With no deal set, Your price has
  // no button. Then it shows a 15% deal to its own browser only, by rewriting
  // the page it was served, with the service worker off and every save
  // stopped before it leaves the browser, so nothing is written.
  {
    const { data: dealRow } = await admin.from("settings").select("black_friday_kind").eq("id", 1).single();
    const context = await browser.newContext({ ...IPAD, serviceWorkers: "block" });
    session = await openOwnerSession({ url, anonKey, admin, base, context });
    page = await context.newPage();
    looked = await leadFootprint(leadId);
    if (!dealRow?.black_friday_kind) {
      await page.goto(`${base}/meeting/${leadId}#quote`);
      await dots(page).waitFor({ timeout: 30000 });
      await goToScreen(page, PRICE);
      check("with no deal in Settings, Your price shows no Black Friday button", (await page.getByTestId("price-black-friday").count()) === 0);
    }
    let rewritten = 0;
    let stopped = 0;
    const meetingPath = `/meeting/${leadId}`;
    await context.route(
      (target) => target.pathname === meetingPath,
      async (route) => {
        if (route.request().method() !== "GET") {
          stopped += 1;
          return route.abort();
        }
        const response = await route.fetch();
        const html = await response.text();
        const body = html.replaceAll('\\"blackFriday\\":null', '\\"blackFriday\\":{\\"kind\\":\\"percent\\",\\"value\\":15}');
        if (body !== html) rewritten += 1;
        return route.fulfill({ response, body });
      },
    );
    // A fresh tab, so the page is fetched again through the rewrite.
    await page.close().catch(() => {});
    page = await context.newPage();
    await page.goto(`${base}/meeting/${leadId}#quote`);
    await dots(page).waitFor({ timeout: 30000 });
    await goToScreen(page, PRICE);
    const region = page.getByRole("region", { name: PRICE, exact: true });
    const button = region.getByTestId("price-black-friday");
    check("with a deal set, Your price shows the Black Friday button, off", rewritten > 0 && (await button.count()) === 1, `rewritten ${rewritten}`);
    if ((await button.count()) === 1) {
      await button.click();
      await page.waitForTimeout(600);
      const regulars = await region.getByTestId("price-option-regular").allInnerTexts();
      const deals = await region.getByTestId("price-option-total").allInnerTexts();
      const dollars = (text) => Number(text.replace(/[^0-9.]/g, ""));
      // Full wrap and Main floor drop by 15%; Front only is already at the
      // $2,500 minimum, so it keeps one price and nothing is struck.
      check(
        "turned on, it names the deal; the options above the minimum show their regular price struck through beside 15% less, and one at the minimum keeps its price",
        flat(await button.innerText()).includes("15% off") &&
          regulars.length === 2 &&
          deals.length === 3 &&
          regulars.every((text, at) => Math.abs(dollars(deals[at]) - Math.round(dollars(text) * 85) / 100) < 0.01) &&
          dollars(deals[2]) === 2500,
        `${regulars.join(", ")} / ${deals.join(", ")}`,
      );
      await shot(page, "meeting-your-price-black-friday");
      await goToScreen(page, NEXT);
      const next = page.getByRole("region", { name: NEXT, exact: true });
      check("What happens next shows the chosen option's regular price struck through", (await next.getByTestId("next-steps-regular").count()) === 1);
      await shot(page, "meeting-what-happens-next-black-friday");
    }
    await page.waitForTimeout(1500);
    check("the Black Friday look saved nothing (its saves were stopped in the browser)", (await leadFootprint(leadId)) === looked, `${stopped} stopped`);
    await session.close().catch(() => {});
    session = null;
    await context.close().catch(() => {});
  }

  // ---------------------------------------------------------------- a made-to-order colour on Your price (staged)
  if (madeToOrder) {
    await admin.from("leads").update({ track_colour_id: madeToOrder.id }).eq("id", leadId);
    owner = await ownerPage();
    page = owner.page;
    looked = await leadFootprint(leadId);
    await page.goto(`${base}/meeting/${leadId}#quote`);
    await dots(page).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    const region = page.getByRole("region", { name: PRICE, exact: true });
    const timing = flat(await region.getByTestId("price-colour").innerText().catch(() => ""));
    check(
      `${madeToOrder.name} track: one line on Your price, made to order, with Install in spring (Included, chosen) and Install this season with the quote's rush fee, never tapped here`,
      timing.startsWith(fillLine(deckLine(settings.deck, "colour_made"), { colour: madeToOrder.name })) &&
        (await region.getByTestId("price-timing-spring").getAttribute("aria-pressed")) === "true" &&
        flat(await region.getByTestId("price-timing-season").innerText().catch(() => "")).includes("$350"),
      timing,
    );
    await shot(page, `meeting-${slug(PRICE)}-${slug(madeToOrder.name)}-made-to-order`);
    check("looking at the made-to-order colour wrote nothing", (await leadFootprint(leadId)) === looked);
    await closeOwner(owner.context);
    await admin.from("leads").update({ track_colour_id: white.id }).eq("id", leadId);
  } else {
    note("no active track colour other than White, so the made-to-order colour line was not reached");
  }

  // ---------------------------------------------------------------- the lead page: the Quote card and Edit the quote (looks only)
  for (const [device, width] of [
    [IPAD, 1180],
    [PHONE, 390],
  ]) {
    owner = await ownerPage(device);
    page = owner.page;
    looked = await leadFootprint(leadId);
    await page.goto(`${base}/app/leads/${leadId}`);
    await settle(page);
    const card = page.getByTestId("quote-summary");
    const summary = flat(await page.getByTestId("quote-summary-line").innerText().catch(() => ""));
    check(
      `${width}: the lead page's Quote card sums up every option, biggest first, and the price-held date`,
      summary === `Full wrap ${screen(FULL)}, Main floor ${screen(MAIN)}, Front only ${screen(FRONT)}. Price held until ${fullDate(validUntil)}.` &&
        flat(await card.innerText()).includes("Meeting mode opens with this quote."),
      summary,
    );
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, `lead-quote-card-${width}`);
    await page.getByTestId("edit-quote").click();
    const sheet = page.getByTestId("quote-sheet");
    await sheet.waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    check(
      `${width}: Edit the quote opens the editor full screen: the runs with the house drawing, the offers, and Save (never tapped)`,
      (await sheet.isVisible()) &&
        (await sheet.getByTestId("editor-run").count()) === 6 &&
        (await sheet.getByTestId("offer-card").count()) === 3 &&
        (await sheet.getByTestId("quote-sheet-save").count()) === 1 &&
        flat(await sheet.getByTestId("quote-sheet-status").innerText().catch(() => "")).includes("Saving needs signal."),
    );
    await shot(page, `lead-editor-sheet-${width}`);
    await sheet.locator("#editor-offers").scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, `lead-editor-sheet-offers-${width}`);
    if (width === 1180) {
      await sheet.getByTestId("editor-prices-toggle").click();
      await sheet.locator("#editor-prices-body").scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, `lead-editor-sheet-prices-${width}`);
    }
    await sheet.getByTestId("quote-sheet-close").click();
    await page.waitForTimeout(400);
    check(`${width}: Close with nothing changed closes the sheet at once`, !(await sheet.isVisible().catch(() => false)));
    if (width === 1180) {
      await page.goto(`${base}/app/leads/${leadId}#edit-quote`);
      await settle(page);
      await page.getByTestId("quote-sheet").waitFor({ timeout: 10000 }).catch(() => {});
      check("prep's #edit-quote opens the sheet at once", await page.getByTestId("quote-sheet").isVisible().catch(() => false));
      await page.getByTestId("quote-sheet-close").click().catch(() => {});
    }
    check(`${width}: looking at the Quote card and the editor wrote nothing`, (await leadFootprint(leadId)) === looked);
    await closeOwner(owner.context);
  }

  // ---------------------------------------------------------------- the customer's link at 390 and 430
  for (const [device, width] of [
    [PHONE, 390],
    [PHONE_MAX, 430],
  ]) {
    const customer = await browser.newContext(device);
    page = await customer.newPage();
    await page.goto(quoteUrl);
    await settle(page);
    await page.waitForTimeout(800);
    const rowsAt = () =>
      page.getByTestId("option-row").evaluateAll((rows) =>
        rows.map((row) => ({ offer: row.getAttribute("data-offer"), selected: row.getAttribute("data-selected") === "true", tagged: Boolean(row.querySelector('[data-testid="option-meeting-tag"]')) })),
      );
    let rows = await rowsAt();
    const booked = width === 430;
    check(
      `${width}: the link opens on the meeting's choice, tagged, with the options biggest first and no sideways scroll`,
      JSON.stringify(rows.map((r) => r.offer)) === JSON.stringify(["full", "main", "front"]) &&
        rows.find((r) => r.selected)?.offer === "main" &&
        rows.find((r) => r.tagged)?.offer === "main" &&
        (await page.evaluate(() => document.documentElement.scrollWidth)) <= width,
      JSON.stringify(rows),
    );
    await shot(page, `link-${width}-top`);
    await scrollTo(page, "quote-options");
    await shot(page, `link-${width}-options`);
    await page.locator('[data-testid="option-row"][data-offer="full"]').click();
    await page.waitForTimeout(700);
    rows = await rowsAt();
    check(
      `${width}: tapping Full wrap selects it and the house and hero follow`,
      rows.find((r) => r.selected)?.offer === "full" && flat(await page.getByTestId("hero-total").innerText()) === screen(FULL),
    );
    await scrollTo(page, "quote-options");
    await shot(page, `link-${width}-full-wrap-selected`);
    await scrollTo(page, "whats-in");
    await shot(page, `link-${width}-whats-in`);
    await scrollTo(page, "quote-next-steps");
    const steps = flat(await page.getByTestId("quote-next-steps").innerText());
    check(
      `${width}: What happens next shows the day picked at the table and no payment until the install`,
      steps.includes(longDay(tableDay)) && steps.includes("No payment until your install is complete."),
      steps.slice(0, 200),
    );
    await shot(page, `link-${width}-what-happens-next`);
    await page.locator('[data-testid="option-row"][data-offer="front"]').click();
    await page.waitForTimeout(700);
    await page.getByTestId("bar-book").click();
    const confirm = page.getByTestId("book-confirm");
    await confirm.waitFor({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    check(
      `${width}: Book my install asks first, with Your choice and its total`,
      (await page.getByTestId("confirm-option").innerText()).trim() === "Front only" && (await page.getByTestId("confirm-total").innerText()).trim() === screen(FRONT),
    );
    await shot(page, `link-${width}-book-confirm`);
    if (booked) {
      await confirm.getByRole("button", { name: "Yes, book my install" }).click();
      await page.getByTestId("quote-thanks").waitFor({ timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(500);
      await shot(page, `link-${width}-thanks`, { fullPage: true });
      const { data: bookedRow } = await admin.from("quote_links").select("booked_offer, booked_option").eq("id", link.data.id).single();
      check("Book my install records the option by its id", bookedRow?.booked_offer === "front" && bookedRow?.booked_option === "Front only", JSON.stringify(bookedRow));
    } else {
      await confirm.getByRole("button", { name: "Back" }).click();
      await page.waitForTimeout(400);
    }
    await customer.close();
  }

  // ---------------------------------------------------------------- the Accepted sheet (looks only)
  owner = await ownerPage();
  page = owner.page;
  looked = await leadFootprint(leadId);
  await page.goto(`${base}/app/leads/${leadId}`);
  await settle(page);
  await page.getByTestId("outcome-accept").click();
  const acceptSheet = page.getByTestId("outcome-accept-sheet");
  await acceptSheet.waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  const offered = await acceptSheet.getByTestId("outcome-option").evaluateAll((rows) =>
    rows.map((row) => ({ offer: row.getAttribute("data-offer"), meeting: row.getAttribute("data-meeting"), booked: row.getAttribute("data-booked"), checked: Boolean(row.querySelector("input")?.checked) })),
  );
  const sources = (await acceptSheet.getByTestId("outcome-choice-source").allInnerTexts()).map(flat);
  check(
    "the Accepted sheet lists the three options biggest first, says where each choice came from, and starts on the meeting's choice and day",
    JSON.stringify(offered.map((o) => o.offer)) === JSON.stringify(["full", "main", "front"]) &&
      offered.find((o) => o.checked)?.offer === "main" &&
      JSON.stringify(sources) === JSON.stringify(["Chosen at the meeting: Main floor", "Booked on their link: Front only"]) &&
      (await page.getByTestId("outcome-planned-on").inputValue()) === tableDay,
    `${JSON.stringify(offered)} | ${sources.join(" | ")}`,
  );
  await shot(page, "accepted-sheet-1180");
  await acceptSheet.getByRole("button", { name: "Back" }).click();
  await page.waitForTimeout(400);
  check("looking at the Accepted sheet wrote nothing", (await leadFootprint(leadId)) === looked);
  await closeOwner(owner.context);

  check("nothing of the owner's changed", (await ownerFootprint(ownerId)) === before);
  const { data: leadAfter } = await admin.from("leads").select("track_colour_initials").eq("id", leadId).single();
  const { count: confirmations } = await admin.from("lead_events").select("id", { count: "exact", head: true }).eq("lead_id", leadId).eq("type", "colour_confirmed");
  check("the owner's session saved no initials", leadAfter?.track_colour_initials === null && confirmations === 0);
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)}${page ? ` at ${page.url()}` : ""}`);
  if (page) await page.screenshot({ path: `${out}/story-failure.png` }).catch(() => {});
} finally {
  if (session) await session.close().catch(() => {});
  if (setter.id) {
    const { data: owned } = await admin.from("leads").select("id").eq("created_by", setter.id);
    const ids = (owned ?? []).map((row) => row.id);
    if (ids.length > 0) {
      await admin.from("earnings").delete().in("lead_id", ids);
      await admin.from("slot_holds").delete().in("lead_id", ids);
      await admin.from("meetings").delete().in("lead_id", ids);
      await admin.from("quote_links").delete().in("lead_id", ids);
      await admin.from("quotes").delete().in("lead_id", ids);
      await admin.from("roofline_traces").delete().in("lead_id", ids);
      await admin.from("lead_photos").delete().in("lead_id", ids);
      await admin.from("lead_mockups").delete().in("lead_id", ids);
      await admin.from("lead_events").delete().in("lead_id", ids);
    }
    await admin.from("meetings").delete().eq("host_id", setter.id);
    await admin.from("push_subscriptions").delete().eq("profile_id", setter.id);
    await admin.from("leads").delete().eq("created_by", setter.id);
    const { data: files } = await admin.storage.from(BUCKET).list(setter.id, { limit: 1000 });
    const stored = [...new Set([...paths, ...(files ?? []).map((file) => `${setter.id}/${file.name}`)])];
    if (stored.length > 0) await admin.storage.from(BUCKET).remove(stored);
    await admin.auth.admin.deleteUser(setter.id);
    const accounts = (await accountEmails()).filter((email) => email.startsWith("story-live-"));
    const { count: strays } = await admin.from("leads").select("id", { count: "exact", head: true }).like("address_line", `%Storytest%`);
    const { data: left } = await admin.storage.from(BUCKET).list(setter.id, { limit: 10 });
    check(
      "the throwaway setter, the test lead, its photos and files, trace, quote, link and meeting are gone",
      accounts.length === 0 && strays === 0 && (left ?? []).length === 0,
      `${accounts.length} accounts, ${strays} leads, ${(left ?? []).length} files left`,
    );
  }
  await browser.close();
  if (shots) results.push(`NOTE screenshots in ${shots}: ${shotNames.join(", ")}`);
  console.log(results.join("\n"));
  process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
}
