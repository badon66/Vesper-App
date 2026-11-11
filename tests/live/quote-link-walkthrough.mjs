// Live walk-through of the customer quote link (Keenan, 2026-11-02; the
// rework, 2026-11-04; round 9, 2026-11-10: Keenan's options replace Start
// smaller and Your lights), against the real database, phone size first.
//
// It stages a throwaway setter, a TEST LEAD with a quote (four runs, two of
// them upper, one an upper gable; extra work marked only with upper runs; a
// neighbour discount; the two upper access amounts; a rush colour fee; a
// minimum job total) and three options (Full wrap, Main floor and Front
// only, the last under the minimum), a mockup and a live link made by the
// throwaway setter, so any notice goes to that account and never to
// Keenan's phone. Then, as a customer with no session, at phone size (390
// and 430): the page's headers and look, the sections in order, Your
// options (one house diagram and a radio row per option, biggest first,
// fitting one screen with the diagram), What's in the option on screen,
// line by line, with "$X a foot", the one colour rule ("made to order this
// season"), What happens next's four steps, a row tapped and the house and
// total following, down to the minimum and Keenan's two lines, the page
// opening on the biggest, then on the meeting's choice once there is one
// (tagged "Your choice at the meeting"), then on what they booked; reduce
// motion, Tap to open, the mockup viewer, Book my install (booked_offer
// recorded, the total recomputed on the server) and the thank-you, the
// visit and the choice in the database, and nothing internal on the page.
// As Keenan, through his one-time view-only session (owner-session.mjs):
// the lead's Quote card, the Send quote link sheet (the link already
// exists, so nothing is written), the timeline, and his Preview, which
// counts nothing and books nothing. As the setter: no Quote card. Then the
// price hold passes and the page still works, Book my install included;
// then the service role marks the quote accepted (standing in for Keenan)
// and the page shows only what was agreed; then the link is turned off and
// closes; and on the quote domain only quote pages answer. Everything
// staged is removed at the end, and nothing of Keenan's changes. Round 11: a
// second lead quoted by area (a custom rate, a flat shed, upper access typed
// over, a gable in or out) on its own link, at 390; the first quote stays
// as the old-quote case and prices exactly as before.
import http from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";
import { deckLine, fillLine } from "./deck-order.mjs";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The quote link walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const INTERNAL = "INTERNAL NOTE (automated) never on the customer's page";
const BUCKET = "lead-photos";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const setter = { email: `ql-live-a-${stamp}@example.com`, password: `harbor-cedar-lantern-${digits}`, name: "QL Test Setter", id: null };
const street = `${stamp} Quotewalk Street SW`;
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const ipad = { viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1, hasTouch: true };

const calgaryToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Etc/GMT+6", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const longDay = (day) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
const fullDate = (day) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${day}T12:00:00Z`));
// Page text as the checks compare it: spaces collapsed, and the page's curly
// apostrophes (2026-11-04) read as straight ones.
const flat = (t) => (t ?? "").replace(/\s+/g, " ").replace(/[\u2018\u2019]/g, "'");
// A total as the page shows it (round 9: it changes at once, it never counts).
const totalOf = async (page, testId) => flat(await page.getByTestId(testId).first().innerText().catch(() => "")).trim();
const lineShown = async (page, label) =>
  (await page.locator(`[data-testid="quote-lines"] [data-line="${label}"]`).getAttribute("data-shown").catch(() => null)) === "true";
// Round 10: the option's picture (its own mockup, else the Main): "true" when its own.
const pictureOwn = async (page) => page.getByTestId("option-picture").getAttribute("data-own").catch(() => null);
const pictureSrc = async (page) => page.getByTestId("option-mockup").getAttribute("src").catch(() => null);
// The option rows, top to bottom: id, whether selected, the total and the coverage line.
const optionRows = (page) =>
  page.getByTestId("option-row").evaluateAll((rows) =>
    rows.map((row) => ({
      offer: row.getAttribute("data-offer"),
      selected: row.getAttribute("data-selected") === "true",
      total: (row.querySelector('[data-testid="option-total"]')?.textContent ?? "").replace(/\s+/g, " ").trim(),
      coverage: (row.querySelector('[data-testid="option-coverage"]')?.textContent ?? "").replace(/\s+/g, " ").trim(),
      tagged: Boolean(row.querySelector('[data-testid="option-meeting-tag"]')),
    })),
  );
const pickOption = async (page, offer) => {
  await page.locator(`[data-testid="option-row"][data-offer="${offer}"]`).click();
  await page.waitForTimeout(500);
};

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

async function ownerFootprint(ownerId) {
  const [profile, leads, events, settings, quotes, devices, links] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).single(),
    admin.from("leads").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("lead_events").select("id").eq("actor_id", ownerId).order("id"),
    admin.from("settings").select("*").eq("id", 1).single(),
    admin.from("quotes").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("push_subscriptions").select("id, removed_at").eq("profile_id", ownerId).order("id"),
    admin.from("quote_links").select("id, updated_at").eq("created_by", ownerId).order("id"),
  ]);
  return JSON.stringify({ profile: profile.data, leads: leads.data, events: events.data, settings: settings.data, quotes: quotes.data, devices: devices.data, links: links.data });
}

async function accountEmails() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users ?? []).map((u) => u.email ?? "");
}

// A request to the local server as if it came to another host name.
function getAs(host, path) {
  const target = new URL(base);
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: target.hostname, port: target.port, path, method: "GET", headers: { Host: host } },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode, robots: res.headers["x-robots-tag"] ?? "" });
      },
    );
    req.on("error", () => resolve({ status: 0, robots: "" }));
    req.end();
  });
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
let ownerSession = null;
let page = null;
let leadId = null;
let mockupPath = null;
let frontMockupPath = null;
// Round 13: a phone scene (a look on the link) and the hidden offer's picture.
let sceneMockupPath = null;
let pocketMockupPath = null;

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
  const { data: ownerRow } = await admin.from("profiles").select("id").eq("role", "owner").single();
  const ownerId = ownerRow.id;
  const { data: settingsRow } = await admin
    .from("settings")
    .select("warranty_text, company, service_call_fee, christmas_banner_on, christmas_banner_title, christmas_banner_text, product_points, presentation, deck")
    .eq("id", 1)
    .single();

  const lead = await admin
    .from("leads")
    .insert({ first_name: TEST_LEAD, last_name: "Quote link", address_line: street, created_by: setter.id })
    .select("id")
    .single();
  if (lead.error) throw new Error(`lead: ${lead.error.message}`);
  leadId = lead.data.id;

  // Prices are held 120 days (2026-11-04).
  const validUntil = addDays(calgaryToday(), 120);
  const runs = [
    { name: "Front", feet: 64, level: "lower", part: "eave" },
    { name: "Front upper", feet: 52, level: "upper", part: "eave" },
    { name: "Garage", feet: 28, level: "lower", part: "garage" },
    { name: "Left gable", feet: 22, level: "upper", part: "gable" },
  ];
  const quote = await admin
    .from("quotes")
    .insert({
      lead_id: leadId,
      created_by: setter.id,
      price_per_ft: 24,
      box_price: 500,
      box_count: 1,
      runs,
      total_feet: 166,
      adders: [{ label: "Extra height", amount: 150, upper_only: true }, { label: "Garage corner", amount: 75 }],
      discounts: [{ label: "Neighbour discount", amount: 150 }],
      gst_rate: 0.05,
      gst_enabled: false,
      min_job_total: 2500,
      // 166 ft x $24 + $500 + $400 upper access (an upper gable is in) +
      // $150 + $75 - $150.
      subtotal: 4959,
      total: 4959,
      colour_timing: "stock",
      rush_fee: 350,
      upper_access_fee: 200,
      upper_gable_access_fee: 400,
      track_colour_name: "White",
      financing_offered: true,
      // Keenan's three options (round 9), in the order he made them; the
      // page shows them biggest first. Full wrap $4,959; Main floor (Front
      // and Garage, no upper run, so no upper access or Extra height)
      // $2,633; Front only $1,961 before the $2,500 minimum.
      offers: [
        { id: "front", name: "Front only", runs: [0] },
        { id: "full", name: "Full wrap", runs: [0, 1, 2, 3] },
        { id: "main", name: "Main floor", runs: [0, 2] },
        // Round 13: an offer Keenan hides. It must show nowhere on the page.
        { id: "pocket", name: "Pocket offer", runs: [2], hidden: true },
      ],
      notes: INTERNAL,
      valid_until: validUntil,
    })
    .select("id")
    .single();
  if (quote.error) throw new Error(`quote: ${quote.error.message}`);

  // A house at dusk with its roofline lit: navy sky, dark house, a row of
  // warm lights along the eaves.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
    <rect width="1600" height="1000" fill="#132e3f"/>
    <polygon points="300,520 800,260 1300,520" fill="#0b1720"/>
    <rect x="360" y="520" width="880" height="380" fill="#0f1e29"/>
    ${Array.from({ length: 40 }, (_, i) => `<circle cx="${300 + i * 12.5}" cy="${520 - i * 6.5}" r="5" fill="#f4e3b5"/>`).join("")}
    ${Array.from({ length: 40 }, (_, i) => `<circle cx="${800 + i * 12.5}" cy="${260 + i * 6.5}" r="5" fill="#f4e3b5"/>`).join("")}
  </svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  mockupPath = `${setter.id}/${crypto.randomUUID()}.jpg`;
  const uploaded = await admin.storage.from(BUCKET).upload(mockupPath, jpeg, { contentType: "image/jpeg" });
  if (uploaded.error) throw new Error(`mockup: ${uploaded.error.message}`);
  // Round 10: mockups per house. The Main, and a picture marked for the
  // Front only option (the same image at its own path, for the test).
  frontMockupPath = `${setter.id}/${crypto.randomUUID()}.jpg`;
  const uploadedFront = await admin.storage.from(BUCKET).upload(frontMockupPath, jpeg, { contentType: "image/jpeg" });
  if (uploadedFront.error) throw new Error(`front mockup: ${uploadedFront.error.message}`);
  // Round 13: a phone scene, which the link shows as a look by its name,
  // and a picture for the hidden offer, which the link never gets.
  sceneMockupPath = `${setter.id}/${crypto.randomUUID()}.jpg`;
  const scene = await sharp(Buffer.from(svg.replaceAll("#f4e3b5", "#d83a3a"))).jpeg({ quality: 82 }).toBuffer();
  const uploadedScene = await admin.storage.from(BUCKET).upload(sceneMockupPath, scene, { contentType: "image/jpeg" });
  if (uploadedScene.error) throw new Error(`scene mockup: ${uploadedScene.error.message}`);
  pocketMockupPath = `${setter.id}/${crypto.randomUUID()}.jpg`;
  const uploadedPocket = await admin.storage.from(BUCKET).upload(pocketMockupPath, jpeg, { contentType: "image/jpeg" });
  if (uploadedPocket.error) throw new Error(`pocket mockup: ${uploadedPocket.error.message}`);
  const mockupRows = await admin.from("lead_mockups").insert([
    { lead_id: leadId, storage_path: mockupPath, name: "Main", is_main: true, position: 0, created_by: setter.id },
    { lead_id: leadId, storage_path: frontMockupPath, name: "Front only", offer_ids: ["front"], position: 1, created_by: setter.id },
    { lead_id: leadId, storage_path: sceneMockupPath, name: "Christmas", is_scene: true, position: 2, created_by: setter.id },
    { lead_id: leadId, storage_path: pocketMockupPath, name: "Pocket picture", offer_ids: ["pocket"], position: 3, created_by: setter.id },
  ], { defaultToNull: false });
  if (mockupRows.error) throw new Error(`mockup rows: ${mockupRows.error.message}`);

  // The link, made by the throwaway setter: its notices go nowhere near Keenan.
  const token = randomBytes(18).toString("base64url");
  const link = await admin.from("quote_links").insert({ lead_id: leadId, token, created_by: setter.id }).select("id").single();
  if (link.error) throw new Error(`link: ${link.error.message}`);
  const quoteUrl = `${base}/q/${token}`;

  // ---------------------------------------------------------------- round 11: a second lead, quoted by area
  // The quote above is an old-style quote (no area keys on its runs) and
  // must price exactly as it always has. This one uses areas: the front
  // lower at the quote's $24, a front gable, the front upper at Keenan's own
  // $28 a foot, and a shed at a flat $600. Three options: Full wrap (upper
  // access $200, automatic: an upper run and no upper gable), Front lower
  // only (upper access typed 0, and under the $2,500 minimum) and Front, no
  // gable (upper access typed $150). Hand-worked:
  //   Full wrap         64 x 24 + 12 x 24 + 38 x 28 + 600 + 500 + 200 = 4,188
  //   Front, no gable   64 x 24 + 38 x 28 + 600 + 500 + 150 = 3,850
  //   Front lower only  64 x 24 + 12 x 24 + 500 = 2,324, lifted to 2,500
  const areaStreet = `${stamp} Quotewalk Areas Street SW`;
  const areaLead = await admin
    .from("leads")
    .insert({ first_name: TEST_LEAD, last_name: "Quote link areas", address_line: areaStreet, created_by: setter.id })
    .select("id")
    .single();
  if (areaLead.error) throw new Error(`areas lead: ${areaLead.error.message}`);
  const areaRuns = [
    { name: "Front", feet: 64, level: "lower", part: "eave", area: "front", gable: false },
    { name: "Front gable", feet: 12, level: "lower", part: "gable", area: "front", gable: true },
    { name: "Front", feet: 38, level: "upper", part: "eave", area: "front", gable: false, rate: 28 },
    { name: "Shed", feet: 20, level: "lower", part: "other", area: "other", gable: false, flat: 600 },
  ];
  const AREA_FULL = 4188;
  const areaQuote = await admin
    .from("quotes")
    .insert({
      lead_id: areaLead.data.id,
      created_by: setter.id,
      price_per_ft: 24,
      box_price: 500,
      box_count: 1,
      runs: areaRuns,
      total_feet: 134,
      adders: [],
      discounts: [],
      gst_rate: 0.05,
      gst_enabled: false,
      min_job_total: 2500,
      subtotal: AREA_FULL,
      total: AREA_FULL,
      colour_timing: "stock",
      rush_fee: 350,
      upper_access_fee: 200,
      upper_gable_access_fee: 400,
      track_colour_name: "White",
      financing_offered: true,
      offers: [
        { id: "full", name: "Full wrap", runs: [0, 1, 2, 3] },
        { id: "front_lower", name: "Front lower only", runs: [0, 1], upper_access: 0 },
        { id: "nogable", name: "Front, no gable", runs: [0, 2, 3], upper_access: 150 },
      ],
      notes: INTERNAL,
      valid_until: validUntil,
    })
    .select("id")
    .single();
  if (areaQuote.error) throw new Error(`areas quote: ${areaQuote.error.message}`);
  const areaToken = randomBytes(18).toString("base64url");
  const areaLink = await admin.from("quote_links").insert({ lead_id: areaLead.data.id, token: areaToken, created_by: setter.id }).select("id").single();
  if (areaLink.error) throw new Error(`areas link: ${areaLink.error.message}`);
  const areaUrl = `${base}/q/${areaToken}`;
  const before = await ownerFootprint(ownerId);

  // ---------------------------------------------------------------- the customer, at phone size
  const customer = await browser.newContext(phone);
  page = await customer.newPage();
  const response = await page.goto(quoteUrl);
  await settle(page);
  const headers = response?.headers() ?? {};
  check(
    "the quote page answers with no login, not indexed, no referrer and never cached",
    response?.status() === 200 &&
      /noindex/.test(headers["x-robots-tag"] ?? "") &&
      headers["referrer-policy"] === "no-referrer" &&
      /no-store/.test(headers["cache-control"] ?? ""),
    JSON.stringify({ status: response?.status(), robots: headers["x-robots-tag"], referrer: headers["referrer-policy"], cache: headers["cache-control"] }),
  );
  const meta = await page.evaluate(() => ({
    robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "",
    referrer: document.querySelector('meta[name="referrer"]')?.getAttribute("content") ?? "",
    title: document.title,
  }));
  check("the page itself says noindex and no-referrer", /noindex/.test(meta.robots) && meta.referrer === "no-referrer", JSON.stringify(meta));
  await page.waitForTimeout(1500);
  const worker = await page.evaluate(async () => Boolean(await navigator.serviceWorker?.getRegistration?.()));
  check("no app service worker on a customer's page", worker === false);
  const look = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    main: getComputedStyle(document.querySelector('[data-testid="quote-live"]')).color,
    width: document.documentElement.scrollWidth,
  }));
  check("white like a document, whatever the theme, and no sideways scroll", look.body === "rgb(255, 255, 255)" && look.width <= 390, JSON.stringify(look));

  const words = (key) => deckLine(settingsRow.deck, key);
  const text = flat(await page.locator("body").innerText());
  // 1. Their house and the price of the option on screen: the biggest first.
  check(
    "their greeting first, then the biggest option's name over its total, and price held until",
    text.includes(`${TEST_LEAD}, here's your quote`) &&
      (await totalOf(page, "hero-option")) === "Full wrap" &&
      (await totalOf(page, "hero-total")) === "$4,959" &&
      (await page.getByTestId("quote-price-hold").innerText()).trim() === `Price held until ${fullDate(validUntil)}.`,
    `${await totalOf(page, "hero-option")} ${await totalOf(page, "hero-total")} | ${(await page.getByTestId("quote-price-hold").innerText().catch(() => "")).trim()}`,
  );
  const mockup = await page.getByTestId("quote-mockup").evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false);
  check("their mockup, full width, loaded through a short-lived signed link", mockup);
  check("the full wrap covers every run, so the mockup needs no caption", (await page.getByTestId("mockup-caption").count()) === 0);
  const promises = flat(await page.getByTestId("quote-promises").innerText());
  const justAsk = await page.getByRole("link", { name: "Just ask." }).getAttribute("href").catch(() => "");
  check(
    "no payment until install, and financing with Just ask. opening a text",
    promises.includes("No payment until your install is complete.") && promises.includes("Financing is available. Just ask.") && (justAsk ?? "").startsWith("sms:+14038959915?&body=Hi%20Keenan"),
    `${promises} ${justAsk}`,
  );
  // 2. Christmas, while Keenan has it on, September 1 to November 30.
  const [, month] = calgaryToday().split("-").map(Number);
  const season = month >= 9 && month <= 11;
  const bannerDue = settingsRow?.christmas_banner_on && season;
  const banner = await page.getByTestId("quote-christmas").innerText().catch(() => "");
  check(
    bannerDue ? "the Christmas banner, in Keenan's words from Settings" : "no Christmas banner out of season or while it's off",
    bannerDue ? banner.includes(settingsRow.christmas_banner_title) && banner.replace(/\s+/g, " ").includes(settingsRow.christmas_banner_text) : banner === "",
    banner.replace(/\s+/g, " "),
  );
  // 3. What you're getting.
  const pointTexts = (Array.isArray(settingsRow?.product_points) ? settingsRow.product_points : []).map((p) => (p?.text ?? "").trim()).filter(Boolean);
  const pointItems = await page.getByTestId("quote-points").locator("li").allInnerTexts().catch(() => []);
  check(
    "the product points from Settings, one line each with a line icon",
    pointItems.length === pointTexts.length && pointTexts.every((t, at) => pointItems[at]?.trim() === t) && (await page.getByTestId("quote-points").locator("svg").count()) === pointTexts.length,
    `${pointItems.length} of ${pointTexts.length}`,
  );
  check(
    "round 9's track point: tucked under the roof edge, never \"colour matched to your soffit\"",
    !pointTexts.some((t) => /colour matched to your soffit/i.test(t)),
    pointTexts.find((t) => /track/i.test(t)) ?? "",
  );
  // 4. Your options: one house, a row per option, biggest first.
  check("Your options replaces Your lights and Start smaller", flat(await page.locator("#your-options").innerText()) === "Your options" && (await page.getByTestId("start-smaller").count()) === 0 && (await page.getByTestId("quote-runs").count()) === 0 && !/Start smaller|Switch all back on|At least one part stays in/.test(text));
  let rows = await optionRows(page);
  check(
    "the options as radio rows, biggest first, each with what it covers and its total; the biggest selected",
    JSON.stringify(rows.map((row) => [row.offer, row.total, row.coverage, row.selected])) ===
      JSON.stringify([
        ["full", "$4,959", "Front, garage and left gable, upper and lower: 166 ft", true],
        ["main", "$2,633", "Front and garage, lower: 92 ft", false],
        ["front", "$2,500", "Front, lower: 64 ft", false],
      ]) && rows.every((row) => !row.tagged),
    JSON.stringify(rows),
  );
  check(
    "round 10: no house drawing anywhere on the page, the explainer included",
    (await page.locator('[data-testid="quote-house"], [data-segment]').count()) === 0,
  );
  const mainSrc = await pictureSrc(page);
  check(
    "the Full wrap has no picture of its own, so the Main shows beside the options, loaded, with no caption (it covers every run)",
    (await pictureOwn(page)) === "false" &&
      (await page.getByTestId("option-mockup").evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)) &&
      (await page.getByTestId("option-mockup-caption").count()) === 0,
  );
  // Round 13: the picture sits in See it on your house, with its Looks and
  // Options right under it, so those are what must share a screen with it.
  const fit = await page.evaluate(() => {
    const figure = document.querySelector('[data-testid="option-picture"]').getBoundingClientRect();
    const section = document.querySelector('[data-testid="see-it"]').getBoundingClientRect();
    const rows = [...document.querySelectorAll('[data-testid="option-row"]')].map((row) => row.getBoundingClientRect());
    const chips = [...document.querySelectorAll('[data-testid="see-it-look"], [data-testid="see-it-option"]')].map((chip) => Math.round(chip.getBoundingClientRect().height));
    const bar = document.querySelector('[data-testid="quote-bar"]').getBoundingClientRect();
    return { span: Math.round(section.bottom - figure.top), room: Math.round(window.innerHeight - bar.height), heights: rows.map((r) => Math.round(r.height)), chips };
  });
  check(
    "the picture, its Looks and its Options fit on one screen at 390, above the bar, so a tap and the house changing are in view together; buttons 48 px; price rows 44 to 88 px",
    fit.span <= fit.room && fit.heights.every((h) => h >= 44 && h <= 88) && fit.chips.length === 4 && fit.chips.every((h) => h >= 48),
    JSON.stringify(fit),
  );
  const explainer = page.getByTestId("quote-explainer");
  const explainerClosed = (await explainer.getAttribute("open")) === null;
  await explainer.locator("summary").click();
  await page.waitForTimeout(400);
  const explained = flat(await page.getByTestId("parts-explained").innerText().catch(() => ""));
  check(
    "What do these mean? opens plain words for an eave, a gable, a garage line, the sides and a porch, with no drawings (round 10)",
    explainerClosed &&
      ["Eave:", "Gable:", "Garage line:", "Sides:", "Porch:", "Upper is the second storey. Lower is the main floor."].every((t) => explained.includes(t)) &&
      (await page.getByTestId("parts-explained").locator("svg").count()) === 0,
    explained.slice(0, 160),
  );
  await explainer.locator("summary").click();
  await page.waitForTimeout(300);
  // 5. What's in the option on screen, line by line, ending on one Total.
  const lines = flat(await page.getByTestId("quote-lines").innerText());
  check(
    "What's in Full wrap, line by line: the lights at \"$X a foot\", the box, upper access with its reason, extra work and the discount",
    flat(await page.getByTestId("whats-in").innerText()) === fillLine(words("whats_in"), { name: "Full wrap" }) &&
      lines.includes("Track and lights") &&
      lines.includes("166 ft at $24 a foot") &&
      lines.includes("$3,984") &&
      lines.includes("Control box Always included $500") &&
      lines.includes("Upper roof access For work up high: $200, or $400 with an upper gable $400") &&
      lines.includes("Extra height") &&
      lines.includes("Garage corner") &&
      lines.includes("−$150") &&
      !(await lineShown(page, "Rush colour fee")) &&
      (await totalOf(page, "line-total")) === "Total $4,959",
    lines,
  );
  check("one Total, with no mention of GST while GST is off", (await page.getByTestId("line-total").count()) === 1 && !/GST/.test(text));
  check(
    "under the rows: what every option includes, and something different is a call or a text",
    flat(await page.getByTestId("quote-includes").innerText()) === words("price_includes") &&
      flat(await page.getByTestId("quote-something-else").innerText()) === words("link_something_else"),
  );
  // 6. Track colour: one colour rule, the same as the iPad.
  const otherColours = season
    ? "Any other colour is made to order: nothing extra if it can wait for spring, or the $350 rush colour fee to have it this season."
    : "Any other colour is made to order for a spring install, at no extra cost.";
  check(
    "track colour: their colour, White in stock and included, every other colour made to order",
    (await totalOf(page, "quote-colour")) === "Your colour: White." &&
      (await totalOf(page, "quote-colour-stock")) === words("colour_stock") &&
      (await totalOf(page, "quote-colour-rush")) === otherColours &&
      !/powder|colour matching/i.test(text),
    `${await totalOf(page, "quote-colour-stock")} | ${await totalOf(page, "quote-colour-rush")}`,
  );
  // 7. What happens next: the meeting's four steps, in its words.
  const steps = [];
  for (const key of ["colour", "day", "on_day", "pay"]) steps.push(flat(await page.getByTestId(`next-step-${key}`).innerText().catch(() => "")));
  check(
    "What happens next replaces How install day works: the colour to confirm, the day to pick together, the day itself and no payment until the install",
    (await page.getByTestId("quote-install-day").count()) === 0 &&
      steps[0].includes(words("step_colour_label")) && steps[0].includes(words("step_colour_todo")) &&
      steps[1].includes(words("step_day_label")) && steps[1].includes(words("step_day_none")) &&
      steps[2].includes(words("step_on_day_label")) &&
      steps[3].includes(words("step_pay_label")) && steps[3].includes("No payment until your install is complete.") &&
      (await page.getByTestId("quote-what-we-need").count()) === 1,
    steps.join(" | "),
  );
  // 8. Tap to open, closed until tapped.
  const warrantyFirst = (settingsRow?.warranty_text ?? "").split(/\n+/)[0]?.trim() ?? "";
  const warranty = page.getByTestId("quote-warranty");
  const warrantyClosed = (await warranty.getAttribute("open")) === null && !(await warranty.getByText(warrantyFirst).isVisible().catch(() => false));
  await warranty.locator("summary").click();
  await page.waitForTimeout(400);
  const warrantyText = (await warranty.innerText()).replace(/\s+/g, " ");
  const fee = Number(settingsRow?.service_call_fee ?? 0);
  check(
    "Warranty opens on a tap, in Keenan's exact words, with the service call fee",
    warrantyClosed && warrantyFirst.length > 0 && warrantyText.includes(warrantyFirst) && (fee > 0 ? warrantyText.includes(`Service call fee for years 6 to 10: $${fee.toLocaleString("en-CA")}`) : true),
    warrantyText.slice(0, 200),
  );
  await warranty.locator("summary").click();
  const galleryCount = (Array.isArray(settingsRow?.presentation) ? settingsRow.presentation : []).find((p) => p?.kind === "gallery")?.image_paths?.filter(Boolean)?.length ?? 0;
  check(
    "See our work hidden until there are photos",
    galleryCount === 0 ? (await page.getByTestId("quote-gallery").count()) === 0 : true,
    `${galleryCount} gallery photos`,
  );
  const order = await page.evaluate(() =>
    ["hero-total", "quote-christmas", "quote-points", "see-it", "option-picture", "see-it-looks", "see-it-options", "quote-options", "option-rows", "whats-in", "quote-lines", "quote-includes", "quote-colour", "quote-next-steps", "quote-more", "quote-footer"]
      .map((id) => [id, document.querySelector(`[data-testid="${id}"]`)])
      .filter(([, el]) => el)
      .map(([id, el]) => [id, Math.round(el.getBoundingClientRect().top + window.scrollY)]),
  );
  check("the sections in order, top to bottom", order.every(([, top], at) => at === 0 || top > order[at - 1][1]), order.map(([id, top]) => `${id} ${top}`).join(", "));
  const hrefs = await page.locator("a").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  check(
    "call, text and email Vesper; Text opens with a line about their quote",
    hrefs.includes("tel:+14038959915") &&
      hrefs.some((h) => h.startsWith("sms:+14038959915?&body=Hi%20Keenan%2C%20a%20question%20about%20the%20quote%20for%20")) &&
      hrefs.some((h) => h.startsWith("mailto:info@vesperlighting.ca")),
    hrefs.filter((h) => /^(tel|sms|mailto):/.test(h)).join(" "),
  );
  check(
    "nothing internal: no note, setter, status or other customer",
    !text.includes("INTERNAL") && !text.includes(setter.name) && !text.includes(setter.email) && !/\bdraft\b/i.test(text),
  );
  check(
    "no badges or deals: no Recommended, Most popular, Best value, struck-through price or countdown",
    !/Recommended|Most popular|Best value|tonight only|ends in/i.test(text) && (await page.locator("s, del").count()) === 0,
  );
  const bar = (await page.getByTestId("quote-bar").innerText()).replace(/\s+/g, " ").trim();
  check(
    "a bar fixed to the bottom with Call, Text and Book my install, and no price in it",
    (await page.getByRole("button", { name: "Book my install" }).isVisible()) && bar === "Call Text Book my install" && (await page.getByTestId("quote-bar").evaluate((el) => getComputedStyle(el).position)) === "fixed",
    bar,
  );
  check(
    "gold is Book my install's alone: the selected row is navy",
    await page.evaluate(() => {
      const gold = (el) => {
        const style = getComputedStyle(el);
        return /185, 146, 87/.test(style.backgroundColor) || (parseFloat(style.borderTopWidth) > 0 && /185, 146, 87/.test(style.borderTopColor));
      };
      const golden = [...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().width > 0 && gold(el) && !el.closest("[data-testid=quote-christmas]"));
      return golden.length === 0;
    }),
  );
  const targets = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="quote-bar"] a, [data-testid="quote-bar"] button, [data-testid="option-row"], summary, [data-testid="quote-footer"] a')].map((el) => Math.round(el.getBoundingClientRect().height)),
  );
  check("every tap target is at least 44 px tall", targets.every((h) => h >= 44), targets.join(","));
  await page.screenshot({ path: `${out}/ql-phone-top.png` });
  await page.screenshot({ path: `${out}/ql-phone-full.png`, fullPage: true });

  await page.waitForTimeout(800);
  const { data: visited } = await admin.from("quote_links").select("view_count, first_viewed_at").eq("id", link.data.id).single();
  const { data: opened } = await admin.from("lead_events").select("actor_id").eq("lead_id", leadId).eq("type", "quote_link_opened");
  check("the visit is counted, nothing about the visitor stored, and goes on the timeline once", visited?.view_count === 1 && opened?.length === 1 && opened[0].actor_id === null, JSON.stringify(visited));

  // A row tapped: Main floor leaves both upper runs out, so the house darks
  // them, upper access and the extra work marked only with upper runs drop
  // off, and the mockup says it shows every run.
  await pickOption(page, "main");
  check(
    "tapping Main floor selects it, dashes the upper runs it leaves out, and the hero follows",
    (await totalOf(page, "hero-option")) === "Main floor" &&
      (await totalOf(page, "hero-total")) === "$2,633" &&
      (await pictureOwn(page)) === "false" &&
      (await optionRows(page)).find((row) => row.selected)?.offer === "main",
    `${await totalOf(page, "hero-option")} ${await totalOf(page, "hero-total")}`,
  );
  check(
    "with no upper run, no upper access and no extra work marked only with upper runs; the rest stays",
    !(await lineShown(page, "Upper roof access")) &&
      !(await lineShown(page, "Extra height")) &&
      (await lineShown(page, "Garage corner")) &&
      flat(await page.getByTestId("quote-lines").innerText()).includes("92 ft at $24 a foot") &&
      (await totalOf(page, "line-total")) === "Total $2,633" &&
      flat(await page.getByTestId("whats-in").innerText()) === fillLine(words("whats_in"), { name: "Main floor" }),
  );
  check(
    "an option that leaves runs out puts a caption under the mockup, and under the Main beside the options",
    flat(await page.getByTestId("mockup-caption").innerText().catch(() => "")) === words("link_mockup_caption") &&
      flat(await page.getByTestId("option-mockup-caption").innerText().catch(() => "")) === words("link_mockup_caption"),
  );
  await page.screenshot({ path: `${out}/ql-phone-main-floor.png`, fullPage: true });
  await pickOption(page, "front");
  const minLines = flat(await page.getByTestId("quote-lines").innerText());
  const note = flat(await page.getByTestId("minimum-note").innerText()).trim();
  check(
    "below the minimum, the total comes to it, with the lines' own sum, a line saying so and Keenan's two sentences",
    minLines.includes("Before the minimum $1,961 To reach our $2,500 minimum $539") &&
      (await totalOf(page, "line-total")) === "Total $2,500" &&
      (await totalOf(page, "hero-total")) === "$2,500" &&
      note === "That's under our $2,500 minimum, so this option comes to $2,500. Need a repair or something smaller? Call or text us and we'll see what we can do." &&
      true,
    `${minLines} | ${note}`,
  );
  check(
    "Front only shows its own mockup beside the options, with no caption",
    (await pictureOwn(page)) === "true" && (await pictureSrc(page)) !== mainSrc && (await page.getByTestId("option-mockup-caption").count()) === 0,
  );
  check("prices, footage and discounts can't be changed: the rows are the only choice", (await page.locator("input:not([type=radio]), textarea, select").count()) === 0);

  // Round 13: See it on your house, and the offer Keenan hides.
  {
    const seeIt = page.getByTestId("see-it");
    const looks = await seeIt.getByTestId("see-it-look").allInnerTexts();
    const chips = await seeIt.getByTestId("see-it-option").evaluateAll((els) => els.map((el) => [el.getAttribute("data-offer"), el.getAttribute("aria-pressed")]));
    check(
      "See it on your house: one picture, the house's scenes by name as Looks, and the shown offers as Options, biggest first, the one on screen pressed",
      flat(await seeIt.locator("h2").innerText()) === "See it on your house" &&
        looks.join() === "Christmas" &&
        chips.map(([id]) => id).join() === "full,main,front" &&
        chips.filter(([, on]) => on === "true").map(([id]) => id).join() === "front",
      JSON.stringify({ looks, chips }),
    );
    const html = await page.content();
    check(
      "the offer Keenan hides shows nowhere on the page: not in the rows, not under the picture, not by name, and neither does its picture",
      (await page.getByTestId("option-row").count()) === 3 && !html.includes("Pocket") && !html.includes("pocket") && !html.includes(pocketMockupPath.split("/").pop()),
    );
    await seeIt.getByTestId("see-it-look").first().click();
    // The look is a new picture: give it a moment to arrive.
    for (let i = 0; i < 40; i += 1) {
      if (await page.getByTestId("option-mockup").evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)) break;
      await page.waitForTimeout(250);
    }
    const lookSrc = await pictureSrc(page);
    check(
      "tapping a look shows the house in that look, loaded, and the price below stays on their option",
      (await page.getByTestId("option-picture").getAttribute("data-kind")) === "look" &&
        lookSrc !== mainSrc &&
        (await page.getByTestId("option-mockup").evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)) &&
        (await seeIt.getByTestId("see-it-look").first().getAttribute("aria-pressed")) === "true" &&
        (await optionRows(page)).find((row) => row.selected)?.offer === "front" &&
        (await totalOf(page, "hero-total")) === "$2,500",
      `kind ${await page.getByTestId("option-picture").getAttribute("data-kind")}`,
    );
    await page.screenshot({ path: `${out}/ql-phone-see-it-look.png`, fullPage: true });
    await seeIt.locator('[data-testid="see-it-option"][data-offer="full"]').click();
    await page.waitForTimeout(500);
    check(
      "tapping an option under the picture shows that option's picture (the Main for Full wrap) and picks it in the price below",
      (await page.getByTestId("option-picture").getAttribute("data-kind")) === "main" &&
        (await pictureSrc(page)) === mainSrc &&
        (await optionRows(page)).find((row) => row.selected)?.offer === "full" &&
        (await totalOf(page, "hero-total")) === "$4,959" &&
        (await seeIt.getByTestId("see-it-look").first().getAttribute("aria-pressed")) === "false",
    );
    await pickOption(page, "front");
    check(
      "picking an option in the price swaps the picture to that option's own, and presses its button under the picture",
      (await page.getByTestId("option-picture").getAttribute("data-kind")) === "own" &&
        (await seeIt.locator('[data-testid="see-it-option"][data-offer="front"]').getAttribute("aria-pressed")) === "true",
    );
    await page.screenshot({ path: `${out}/ql-phone-see-it.png`, fullPage: true });
  }
  await page.screenshot({ path: `${out}/ql-phone-front-only.png`, fullPage: true });
  await page.waitForTimeout(2000);
  const { data: chosen } = await admin.from("quote_links").select("selection, selection_offer").eq("id", link.data.id).single();
  check("the option they settle on is saved on their own link, by its id", chosen?.selection_offer === "front" && JSON.stringify(chosen?.selection) === "[0]", JSON.stringify(chosen));

  // The meeting's choice: the page opens on it (the service role stands in
  // for Keenan's iPad saving it), tagged, until they book something else.
  await admin.from("quotes").update({ meeting_offer: "main" }).eq("id", quote.data.id);
  await page.reload();
  await settle(page);
  rows = await optionRows(page);
  check(
    "with a choice made at the meeting and nothing booked, the page opens on it, tagged \"Your choice at the meeting\"",
    (await totalOf(page, "hero-option")) === "Main floor" &&
      rows.find((row) => row.selected)?.offer === "main" &&
      rows.filter((row) => row.tagged).map((row) => row.offer).join() === "main" &&
      flat(await page.getByTestId("option-meeting-tag").innerText()) === words("link_meeting_tag"),
    JSON.stringify(rows),
  );
  const tagFit = await page.evaluate(() => {
    const tag = document.querySelector('[data-testid="option-meeting-tag"]').getBoundingClientRect();
    const row = document.querySelector('[data-testid="option-meeting-tag"]').closest('[data-testid="option-row"]').getBoundingClientRect();
    const heights = [...document.querySelectorAll('[data-testid="option-row"]')].map((r) => Math.round(r.getBoundingClientRect().height));
    return { tagTop: Math.round(tag.top - row.top), tagBottom: Math.round(tag.bottom - row.top), heights };
  });
  check(
    "the meeting's tag sits on its row's top edge, so it adds no height: every row still 88 px or less",
    tagFit.tagTop < 0 && tagFit.tagBottom > 0 && tagFit.heights.every((h) => h <= 88),
    JSON.stringify(tagFit),
  );
  await page.screenshot({ path: `${out}/ql-phone-meeting-choice.png` });

  // The mockup, full screen.
  await page.getByRole("button", { name: /Open the picture of your house/ }).click();
  const viewer = page.getByTestId("mockup-viewer");
  await viewer.waitFor({ timeout: 5000 }).catch(() => {});
  const viewerOpen = await viewer.isVisible().catch(() => false);
  await page.screenshot({ path: `${out}/ql-phone-mockup.png` });
  await viewer.getByRole("button", { name: "Close" }).click().catch(() => {});
  check("a tap opens the mockup full screen to zoom, and Close brings them back", viewerOpen && !(await viewer.isVisible().catch(() => false)));

  // Book my install on Front only: it asks once, restating the choice,
  // before it books. A quick second tap lands where Yes appears; it must not book.
  await pickOption(page, "front");
  await page.getByRole("button", { name: "Book my install" }).click();
  const confirm = page.getByTestId("book-confirm");
  await confirm.getByRole("button", { name: "Yes, book my install" }).click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const { data: afterDoubleTap } = await admin.from("quote_links").select("booked_at").eq("id", link.data.id).single();
  check(
    "a quick second tap on Book my install doesn't book: the confirm step is still open",
    afterDoubleTap?.booked_at === null && (await confirm.getByRole("button", { name: "Yes, book my install" }).isVisible()),
  );
  const confirmText = flat(await confirm.innerText().catch(() => ""));
  check(
    "Book my install asks first: Your choice, the total and nothing to sign or pay; with no day planned, Keenan sets the install date",
    (await page.getByTestId("confirm-option").innerText()).trim() === "Front only" &&
      (await page.getByTestId("confirm-total").innerText()).trim() === "$2,500" &&
      confirmText.includes("Your choice Front only") &&
      confirmText.includes("There's nothing to sign or pay today.") &&
      confirmText.includes("Keenan will be in touch to set your install date and go through the agreement.") &&
      (await confirm.getByRole("button", { name: "Back" }).count()) === 1,
    confirmText.slice(0, 200),
  );
  await page.screenshot({ path: `${out}/ql-phone-confirm.png` });
  const { data: notYet } = await admin.from("quote_links").select("booked_at").eq("id", link.data.id).single();
  check("nothing is booked until they say yes", notYet?.booked_at === null);
  await page.waitForTimeout(600);
  await confirm.getByRole("button", { name: "Yes, book my install" }).click();
  await page.getByTestId("quote-thanks").waitFor({ timeout: 20000 }).catch(() => {});
  const thanks = flat(await page.getByTestId("quote-thanks").innerText().catch(() => ""));
  check(
    "Book my install shows the thank-you: Keenan in touch within one business day, nothing to sign or pay, Your choice and its total",
    thanks.includes("Keenan will be in touch within one business day to set your install date and go through the agreement.") &&
      thanks.includes("There's nothing to sign or pay today.") &&
      (await page.getByTestId("thanks-option").innerText()).trim() === "Front only" &&
      (await page.getByTestId("thanks-total").innerText()).trim() === "$2,500",
    thanks.slice(0, 240),
  );
  await page.screenshot({ path: `${out}/ql-phone-thanks.png`, fullPage: true });
  const { data: booked } = await admin.from("quote_links").select("booked_at, booked_option, booked_offer, booked_selection").eq("id", link.data.id).single();
  const { data: requested } = await admin.from("lead_events").select("payload, actor_id").eq("lead_id", leadId).eq("type", "install_requested");
  const { data: quoteAfter } = await admin.from("quotes").select("status, accepted_at").eq("id", quote.data.id).single();
  const { data: earnings } = await admin.from("earnings").select("id").eq("lead_id", leadId);
  check(
    "Book my install records the option by its id (booked_offer) with its name and runs, on the timeline without a price, and the quote is not accepted",
    booked?.booked_offer === "front" &&
      booked?.booked_option === "Front only" &&
      JSON.stringify(booked?.booked_selection) === "[0]" &&
      requested?.length === 1 &&
      requested[0].payload?.option === "Front only" &&
      JSON.stringify(requested[0].payload?.runs) === JSON.stringify(["Front"]) &&
      Object.keys(requested[0].payload ?? {}).length === 2 &&
      quoteAfter?.status === "draft" &&
      quoteAfter?.accepted_at === null &&
      (earnings ?? []).length === 0,
    JSON.stringify({ booked, requested, quoteAfter }),
  );
  // The server prices the booking from the stored quote and the offer id,
  // never from the browser: a made-up offer id books nothing.
  const anon = createClient(url, anonKey, noSession);
  const madeUp = await anon.rpc("quote_link_book_offer", { p_token: token, p_offer: "not-an-offer" });
  const { data: stillBooked } = await admin.from("quote_links").select("booked_offer").eq("id", link.data.id).single();
  check(
    "an offer that isn't on the quote books nothing",
    madeUp.data?.ok === false && madeUp.data?.state === "no_offer" && stillBooked?.booked_offer === "front",
    JSON.stringify(madeUp.data ?? madeUp.error?.message),
  );
  await page.reload();
  await settle(page);
  rows = await optionRows(page);
  check(
    "coming back, the page opens on what they booked (ahead of the meeting's choice, still tagged), says they asked to book, and the bar no longer offers it again",
    (await page.getByTestId("quote-booked-before").innerText().catch(() => "")).includes("you asked us to book your install: Front only.") &&
      rows.find((row) => row.selected)?.offer === "front" &&
      rows.find((row) => row.tagged)?.offer === "main" &&
      (await page.getByTestId("bar-requested").innerText()).includes("Install requested") &&
      (await page.getByRole("button", { name: "Book my install" }).count()) === 0,
    JSON.stringify(rows),
  );
  await page.screenshot({ path: `${out}/ql-phone-return.png` });
  await customer.close();

  // ---------------------------------------------------------------- the customer at 430 (Keenan's own iPhone width)
  {
    const wide = await browser.newContext({ ...phone, viewport: { width: 430, height: 932 } });
    const widePage = await wide.newPage();
    await widePage.goto(quoteUrl);
    await settle(widePage);
    const wideFit = await widePage.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      rows: [...document.querySelectorAll('[data-testid="option-row"]')].map((row) => Math.round(row.getBoundingClientRect().height)),
    }));
    check(
      "at 430 wide: no sideways scroll, the same three rows, each 88 px or less",
      wideFit.width <= 430 && wideFit.rows.length === 3 && wideFit.rows.every((h) => h <= 88),
      JSON.stringify(wideFit),
    );
    await widePage.screenshot({ path: `${out}/ql-phone-430.png`, fullPage: true });
    await wide.close();
  }

  // ---------------------------------------------------------------- the areas quote (round 11), at 390
  {
    const areas = await browser.newContext(phone);
    const ap = await areas.newPage();
    page = ap;
    await ap.goto(areaUrl);
    await settle(ap);
    await ap.waitForTimeout(800);
    // A breakdown row as the page shows it, "label detail amount", while it
    // is on; null while it is off or not there at all (no waiting).
    const row = async (label) => {
      const el = ap.locator(`[data-testid="quote-lines"] [data-line="${label}"]`);
      return (await el.count()) === 1 && (await el.getAttribute("data-shown")) === "true" ? flat(await el.innerText()).trim() : null;
    };
    const areaRows = await optionRows(ap);
    check(
      "round 11: the areas quote opens on Full wrap, with the options biggest first and their totals: $4,188, $3,850 and $2,500 at the minimum",
      (await totalOf(ap, "hero-option")) === "Full wrap" &&
        (await totalOf(ap, "hero-total")) === "$4,188" &&
        JSON.stringify(areaRows.map((r) => [r.offer, r.total, r.selected])) ===
          JSON.stringify([
            ["full", "$4,188", true],
            ["nogable", "$3,850", false],
            ["front_lower", "$2,500", false],
          ]) &&
        (await ap.evaluate(() => document.documentElement.scrollWidth)) <= 390,
      JSON.stringify(areaRows),
    );
    check(
      "What's in Full wrap: Track and lights at two rates (\"76 ft at $24, 38 ft at $28\"), the Shed on its own line as a flat price, the box, and the automatic $200 upper roof access (an upper run, no upper gable)",
      (await row("Track and lights")) === "Track and lights 76 ft at $24, 38 ft at $28 $2,888" &&
        (await row("Shed")) === "Shed 20 ft, flat price $600" &&
        (await row("Control box")) === "Control box Always included $500" &&
        (await row("Upper roof access")) === "Upper roof access For work up high: $200, or $400 with an upper gable $200" &&
        !(await lineShown(ap, "To reach our $2,500 minimum")) &&
        (await totalOf(ap, "line-total")) === "Total $4,188",
      `${await row("Track and lights")} | ${await row("Shed")} | ${await row("Upper roof access")} | ${await totalOf(ap, "line-total")}`,
    );
    await ap.screenshot({ path: `${out}/ql-phone-areas-full-wrap.png`, fullPage: true });
    await pickOption(ap, "front_lower");
    check(
      "Front lower only: one rate (\"76 ft at $24 a foot\"), no Shed, upper access typed 0 so no line at all, and $2,324 lifted to the $2,500 minimum",
      (await row("Track and lights")) === "Track and lights 76 ft at $24 a foot $1,824" &&
        !(await lineShown(ap, "Shed")) &&
        !(await lineShown(ap, "Upper roof access")) &&
        flat(await ap.getByTestId("quote-lines").innerText()).includes("Before the minimum $2,324 To reach our $2,500 minimum $176") &&
        (await totalOf(ap, "line-total")) === "Total $2,500" &&
        (await totalOf(ap, "hero-total")) === "$2,500",
      `${await row("Track and lights")} | ${await totalOf(ap, "line-total")}`,
    );
    await ap.screenshot({ path: `${out}/ql-phone-areas-front-lower.png`, fullPage: true });
    await pickOption(ap, "nogable");
    check(
      "Front, no gable: \"64 ft at $24, 38 ft at $28\", the Shed back, and Upper roof access at the typed $150 with no detail; $3,850",
      (await row("Track and lights")) === "Track and lights 64 ft at $24, 38 ft at $28 $2,600" &&
        (await row("Shed")) === "Shed 20 ft, flat price $600" &&
        (await row("Upper roof access")) === "Upper roof access $150" &&
        (await totalOf(ap, "line-total")) === "Total $3,850" &&
        (await totalOf(ap, "hero-total")) === "$3,850",
      `${await row("Track and lights")} | ${await row("Upper roof access")} | ${await totalOf(ap, "line-total")}`,
    );
    await ap.screenshot({ path: `${out}/ql-phone-areas-no-gable.png`, fullPage: true });
    check("nothing internal on the areas page either", !flat(await ap.locator("body").innerText()).includes("INTERNAL"));
    await areas.close();
  }

  // ---------------------------------------------------------------- Keenan
  const { data: viewsBefore } = await admin.from("quote_links").select("view_count").eq("id", link.data.id).single();
  const views = viewsBefore?.view_count ?? 0;
  const ownerContext = await browser.newContext(ipad);
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  const owner = await ownerContext.newPage();
  await owner.goto(`${base}/app/leads/${leadId}`);
  await settle(owner);
  const card = owner.getByTestId("quote-card");
  const cardText = (await card.innerText().catch(() => "")).replace(/\s+/g, " ");
  check(
    "the lead's Customer's link card leads with the booking (the option by name, priced from the stored quote), then opens, last visit and the price-held date in the Quote card's style; no single quoted total",
    cardText.trim().startsWith("Customer's link") &&
      (await card.getByTestId("quote-card-booked").innerText().catch(() => "")).includes(`${TEST_LEAD} asked to book Front only, $2,500.`) &&
      !cardText.includes("Quoted total") &&
      cardText.includes(`Price held until ${fullDate(validUntil)}.`) &&
      cardText.includes(`Opened ${views} times, last`) &&
      !cardText.includes(".."),
    cardText.slice(0, 300),
  );
  check(
    "Keenan's quote editor card sums up every option a customer sees, biggest first, counts the one he hides (round 13) without a price, and the price-held date",
    flat(await owner.getByTestId("quote-summary-line").innerText().catch(() => "")) ===
      `Full wrap $4,959, Main floor $2,633, Front only $2,500. 1 hidden from the customer. Price held until ${fullDate(validUntil)}.`,
    flat(await owner.getByTestId("quote-summary-line").innerText().catch(() => "no summary")),
  );
  const previewHref = await card.getByRole("link", { name: "Preview" }).getAttribute("href").catch(() => "");
  check("Preview opens the app's own copy of the link", previewHref === quoteUrl, previewHref ?? "");
  await card.getByRole("button", { name: "Send quote link" }).click();
  const sheet = owner.getByTestId("send-quote-link");
  await sheet.getByRole("textbox").waitFor({ timeout: 15000 }).catch(() => {});
  const message = await sheet.getByRole("textbox").inputValue().catch(() => "");
  check(
    "Send quote link: the same link and an editable text, nothing sent",
    message.includes(`Hi ${TEST_LEAD}, here's your Vesper quote:`) && message.includes(`/q/${token}`) && message.includes(`Your price is held until ${longDay(validUntil)}.`) && !message.includes("—"),
    message.replace(/\s+/g, " ").slice(0, 200),
  );
  await owner.screenshot({ path: `${out}/ql-ipad-send-sheet.png` });
  await sheet.getByRole("button", { name: "Done" }).click();
  const timeline = (await owner.getByRole("list", { name: "Timeline" }).innerText()).replace(/\s+/g, " ");
  check(
    "the timeline: opened and Book my install, by the customer, never with a price",
    timeline.includes("Opened the quote link.") && timeline.includes("Tapped Book my install: Front only.") && !/\$\d/.test(timeline),
    timeline.slice(0, 300),
  );
  await owner.screenshot({ path: `${out}/ql-ipad-lead.png`, fullPage: true });

  // Keenan's own preview counts nothing and books nothing.
  const preview = await ownerContext.newPage();
  await preview.goto(quoteUrl);
  await settle(preview);
  await preview.waitForTimeout(1000);
  // It opens at the booked choice; another option offers an update.
  const previewOpened = (await optionRows(preview)).find((row) => row.selected)?.offer;
  await pickOption(preview, "main");
  await preview.getByRole("button", { name: "Update my choice" }).click();
  await preview.waitForTimeout(600);
  await preview.getByTestId("book-confirm").getByRole("button", { name: "Yes, update it" }).click();
  await preview.getByTestId("thanks-preview").waitFor({ timeout: 20000 }).catch(() => {});
  const previewNote = await preview.getByTestId("thanks-preview").isVisible().catch(() => false);
  await preview.waitForTimeout(1500);
  const { data: afterPreview } = await admin.from("quote_links").select("view_count, booked_option, booked_offer, selection_offer").eq("id", link.data.id).single();
  check(
    "Keenan's signed-in visit isn't counted, opens on what they booked, and his Book my install and his tap on a row are a preview",
    previewNote &&
      previewOpened === "front" &&
      afterPreview?.view_count === views &&
      afterPreview?.booked_option === "Front only" &&
      afterPreview?.booked_offer === "front" &&
      afterPreview?.selection_offer === "front",
    JSON.stringify({ previewOpened, ...afterPreview }),
  );
  await preview.close();
  await ownerSession.close();
  ownerSession = null;
  await ownerContext.close();
  check("nothing of Keenan's changed", before === (await ownerFootprint(ownerId)));

  // ---------------------------------------------------------------- the setter
  const setterContext = await browser.newContext(phone);
  const setterPage = await setterContext.newPage();
  await signIn(setterPage, setter);
  await setterPage.goto(`${base}/app/leads/${leadId}`);
  await settle(setterPage);
  const setterHtml = await setterPage.content();
  check("a setter never sees the Quote card or the link", (await setterPage.getByTestId("quote-card").count()) === 0 && !setterHtml.includes(token));
  await setterContext.close();

  // ---------------------------------------------------------------- reduce motion
  const calm = await browser.newContext({ ...phone, reducedMotion: "reduce" });
  const calmPage = await calm.newPage();
  await calmPage.goto(quoteUrl);
  await settle(calmPage);
  await pickOption(calmPage, "full");
  const calmMotion = await calmPage.evaluate(() => ({
    row: getComputedStyle(document.querySelector('[data-testid="quote-lines"] .quote-row')).transitionProperty,
  }));
  check(
    "with reduce motion on, the total is the new option's at once and no line slides",
    (await totalOf(calmPage, "hero-total")) === "$4,959" && !/grid-template-rows/.test(calmMotion.row),
    JSON.stringify(calmMotion),
  );
  await calm.close();

  // ---------------------------------------------------------------- after the price hold
  // With an install day picked at the meeting too: What happens next shows
  // it, so the confirm step and the thank-you say Keenan confirms that day.
  await admin.from("quotes").update({ valid_until: addDays(calgaryToday(), -1), meeting_install_on: addDays(calgaryToday(), 6) }).eq("id", quote.data.id);
  const later = await browser.newContext(phone);
  const laterPage = await later.newPage();
  await laterPage.goto(quoteUrl);
  await settle(laterPage);
  const held = flat(await laterPage.getByTestId("quote-price-hold").innerText().catch(() => "")).trim();
  await pickOption(laterPage, "main");
  await laterPage.getByRole("button", { name: "Update my choice" }).click();
  const laterConfirm = flat(await laterPage.getByTestId("book-confirm").innerText().catch(() => ""));
  await laterPage.waitForTimeout(600);
  await laterPage.getByTestId("book-confirm").getByRole("button", { name: "Yes, update it" }).click();
  await laterPage.getByTestId("quote-thanks").waitFor({ timeout: 20000 }).catch(() => {});
  const laterThanks = flat(await laterPage.getByTestId("quote-thanks").innerText().catch(() => ""));
  check(
    "with an install day planned, the confirm step and the thank-you say Keenan will be in touch to confirm it, not to set one",
    laterConfirm.includes("Keenan will be in touch to confirm your install day and go through the agreement.") &&
      laterThanks.includes("Keenan will be in touch within one business day to confirm your install day and go through the agreement.") &&
      !`${laterConfirm} ${laterThanks}`.includes("set your install date"),
    `${laterConfirm.slice(0, 200)} | ${laterThanks.slice(0, 200)}`,
  );
  const { data: rebooked } = await admin.from("quote_links").select("booked_option, booked_offer").eq("id", link.data.id).single();
  const passed = `Prices may have changed since ${fullDate(addDays(calgaryToday(), -1))}. We'll confirm before booking.`;
  check(
    "after the price-held-until date the link still works, says prices may have changed, and Book my install still goes through, by option",
    held === passed && laterConfirm.includes(passed) && rebooked?.booked_option === "Main floor" && rebooked?.booked_offer === "main",
    `${held} | ${JSON.stringify(rebooked)}`,
  );
  await laterPage.screenshot({ path: `${out}/ql-phone-held.png` });
  await later.close();

  // ---------------------------------------------------------------- accepted: only what was agreed
  // The service role stands in for Keenan's Accepted sheet (owner-only):
  // Main floor, with a planned install day.
  const { data: colourRow } = await admin.from("track_colours").select("id, name").eq("active", true).ilike("name", "white").limit(1).maybeSingle();
  const { data: anyColour } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order").limit(1).single();
  const agreedColour = colourRow ?? anyColour;
  await admin.from("leads").update({ track_colour_id: agreedColour.id }).eq("id", leadId);
  const agreedDay = addDays(calgaryToday(), 9);
  const accepted = await admin.rpc("quote_accept_offer", { p_quote: quote.data.id, p_offer: "main", p_install_on: agreedDay });
  if (accepted.error) throw new Error(`accept: ${accepted.error.message}`);
  const agreedContext = await browser.newContext(phone);
  const agreedPage = await agreedContext.newPage();
  await agreedPage.goto(quoteUrl);
  await settle(agreedPage);
  const agreedText = flat(await agreedPage.locator("body").innerText());
  check(
    "after Keenan marks it accepted, the page shows only what was agreed: Your choice and its total, the colour, the install day and no payment until the install",
    (await agreedPage.getByTestId("quote-agreed").count()) === 1 &&
      (await totalOf(agreedPage, "agreed-choice")).includes("Main floor") &&
      (await totalOf(agreedPage, "agreed-total")) === "$2,633" &&
      (await totalOf(agreedPage, "agreed-colour")) === `Your track colour: ${agreedColour.name}` &&
      (await totalOf(agreedPage, "agreed-day")) === `Your install day: ${longDay(agreedDay)}` &&
      agreedText.includes("No payment until your install is complete."),
    agreedText.slice(0, 300),
  );
  check(
    "no other option's price, no Your options, no Book my install and no status word; Call and Text stay",
    (await agreedPage.getByTestId("option-rows").count()) === 0 &&
      (await agreedPage.getByTestId("quote-options").count()) === 0 &&
      (await agreedPage.getByRole("button", { name: /Book my install|Update my choice/ }).count()) === 0 &&
      !agreedText.includes("$4,959") &&
      !/\b(accepted|sold|status)\b/i.test(agreedText) &&
      (await agreedPage.getByTestId("bar-call").count()) === 1 &&
      (await agreedPage.getByTestId("bar-text").count()) === 1,
  );
  await agreedPage.screenshot({ path: `${out}/ql-phone-agreed.png`, fullPage: true });
  await agreedContext.close();

  // ---------------------------------------------------------------- turned off, and the quote domain
  const turnedOff = await admin.rpc("revoke_quote_link", { p_lead_id: leadId });
  const after = await browser.newContext(phone);
  const closed = await after.newPage();
  await closed.goto(quoteUrl);
  await settle(closed);
  const closedText = flat(await closed.locator("body").innerText()).replace(/\u2011/g, "-");
  const closedHrefs = await closed.locator("a").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  check(
    "a link turned off is closed, with call and text, no name and no prices",
    turnedOff.data === true &&
      closedText.includes("This quote link is closed.") &&
      closedText.includes("Call or text Keenan for an up-to-date quote.") &&
      closedHrefs.includes("tel:+14038959915") &&
      closedHrefs.includes("sms:+14038959915") &&
      !closedText.includes(TEST_LEAD) &&
      !/\$\d/.test(closedText),
    closedText.slice(0, 160),
  );
  await closed.screenshot({ path: `${out}/ql-phone-closed.png` });
  await closed.goto(`${base}/q/${randomBytes(18).toString("base64url")}`);
  check("a made-up link shows the same closed screen", (await closed.locator("body").innerText()).includes("This quote link is closed."));
  await after.close();

  if (new URL(base).hostname === "localhost") {
    const appOnQuoteHost = await getAs("quote.vesperlighting.ca", "/login");
    const quoteOnQuoteHost = await getAs("quote.vesperlighting.ca", `/q/${token}`);
    const rootOnQuoteHost = await getAs("quote.vesperlighting.ca", "/");
    check(
      "on quote.vesperlighting.ca only quote pages answer",
      appOnQuoteHost.status === 404 && rootOnQuoteHost.status === 404 && quoteOnQuoteHost.status === 200,
      JSON.stringify({ appOnQuoteHost, rootOnQuoteHost, quoteOnQuoteHost }),
    );
  }
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)}${page ? ` at ${page.url()}` : ""}`);
  if (page) await page.screenshot({ path: `${out}/ql-failure.png`, fullPage: true }).catch(() => {});
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  const stored = [mockupPath, frontMockupPath, sceneMockupPath, pocketMockupPath].filter(Boolean);
  if (stored.length > 0) await admin.storage.from(BUCKET).remove(stored).catch(() => {});
  if (setter.id) {
    const { data: owned } = await admin.from("leads").select("id").eq("created_by", setter.id);
    const ids = (owned ?? []).map((row) => row.id);
    if (ids.length > 0) {
      await admin.from("earnings").delete().in("lead_id", ids);
      await admin.from("lead_mockups").delete().in("lead_id", ids);
      await admin.from("quote_links").delete().in("lead_id", ids);
      await admin.from("quotes").delete().in("lead_id", ids);
    }
    await admin.from("earnings").delete().eq("profile_id", setter.id);
    await admin.from("push_subscriptions").delete().eq("profile_id", setter.id);
    await admin.from("leads").delete().eq("created_by", setter.id);
    await admin.auth.admin.deleteUser(setter.id);
    const { data: strays } = await admin.from("leads").select("id").eq("first_name", TEST_LEAD).like("address_line", `%${stamp}%`);
    const accounts = (await accountEmails()).filter((email) => email.startsWith("ql-live-"));
    check("the throwaway setter, the test lead, its quote, link and mockup are gone", accounts.length === 0 && (strays ?? []).length === 0, `${accounts.length} accounts, ${(strays ?? []).length} strays`);
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(`accounts remaining: ${JSON.stringify((await accountEmails()).filter((email) => !email.endsWith("@example.com")))}`);
  process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
}
