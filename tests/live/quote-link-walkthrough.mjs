// Live walk-through of the customer quote link (Keenan, 2026-11-02; the
// rework, 2026-11-04), against the real database, phone size first.
//
// It stages a throwaway setter, a TEST LEAD with a quote (four runs, two of
// them upper, one an upper gable; extra work marked only with upper runs; a
// neighbour discount; the two upper access amounts; a rush colour fee; a
// minimum job total), a mockup and a live link made by the throwaway setter,
// so any notice goes to that account and never to Keenan's phone. Then, as a
// customer with no session, at phone size: the page's headers and look, all
// eight sections in order, the house diagram, Start smaller with upper
// access following the runs and the total counting, down to the minimum and
// Keenan's two lines, reduce motion, Tap to open, the mockup viewer, Book my
// install and the thank-you, the visit and the choice in the database, and
// nothing internal on the page. As Keenan, through his one-time view-only
// session (owner-session.mjs): the lead's Quote card, the Send quote link
// sheet (the link already exists, so nothing is written), the timeline, and
// his Preview, which counts nothing and books nothing. As the setter: no
// Quote card. Then the price hold passes and the page still works, Book my
// install included; then the link is turned off and closes; and on the
// quote domain only quote pages answer. Everything staged is removed at the
// end, and nothing of Keenan's changes.
import http from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";
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
// The figure a screen reader hears, never the counting digits.
const totalOf = async (page, testId) => ((await page.getByTestId(testId).locator(".sr-only").textContent().catch(() => "")) ?? "").trim();
// The digits on screen, which count to the new value.
const shownOf = async (page, testId) => ((await page.getByTestId(testId).locator("[aria-hidden=true]").first().textContent().catch(() => "")) ?? "").trim();
const lineShown = async (page, label) =>
  (await page.locator(`[data-testid="quote-lines"] [data-line="${label}"]`).getAttribute("data-shown").catch(() => null)) === "true";
const segment = async (page, name) => page.locator(`[data-testid="quote-house"] [data-segment="${name}"]`).getAttribute("data-state").catch(() => null);

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
    .select("warranty_text, company, service_call_fee, christmas_banner_on, christmas_banner_title, christmas_banner_text, product_points, presentation")
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
  await admin.from("lead_photos").insert({ lead_id: leadId, storage_path: mockupPath, slot: "mockup", created_by: setter.id });

  // The link, made by the throwaway setter: its notices go nowhere near Keenan.
  const token = randomBytes(18).toString("base64url");
  const link = await admin.from("quote_links").insert({ lead_id: leadId, token, created_by: setter.id }).select("id").single();
  if (link.error) throw new Error(`link: ${link.error.message}`);
  const quoteUrl = `${base}/q/${token}`;
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

  const text = flat(await page.locator("body").innerText());
  // 1. Their house and their price.
  check(
    "their greeting first, then the total and price held until",
    text.includes(`${TEST_LEAD}, here's your quote`) &&
      (await totalOf(page, "hero-total")) === "$4,959" &&
      (await page.getByTestId("quote-price-hold").innerText()).trim() === `Price held until ${fullDate(validUntil)}`,
    text.slice(0, 200),
  );
  const mockup = await page.getByTestId("quote-mockup").evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false);
  check("their mockup, full width, loaded through a short-lived signed link", mockup);
  const promises = flat(await page.getByTestId("quote-promises").innerText());
  const justAsk = await page.getByRole("link", { name: "Just ask." }).getAttribute("href").catch(() => "");
  check(
    "no payment until install, and financing with Just ask. opening a text",
    promises.includes("No payment until your install is complete.") && promises.includes("Financing is available. Just ask.") && (justAsk ?? "").startsWith("sms:+14038959915?&body=Hi%20Keenan"),
    `${promises} ${justAsk}`,
  );
  // 2. Christmas, while Keenan has it on, September 1 to December 24.
  const [, month, day] = calgaryToday().split("-").map(Number);
  const bannerDue = settingsRow?.christmas_banner_on && month >= 9 && !(month === 12 && day > 24);
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
  // 4. Your lights, and the house.
  const runRows = await page.getByTestId("quote-runs").locator("li").allInnerTexts();
  check("their runs as a compact list, name and feet, no levels", runRows.length === 4 && runRows[0].replace(/\s+/g, " ").trim() === "Front 64 ft" && !runRows.join(" ").includes("level"), runRows.join(" | "));
  const states = {};
  for (const name of ["lower-eave", "upper-eave", "garage", "upper-gable", "garage-gable", "porch", "lower-sides", "upper-sides"]) states[name] = await segment(page, name);
  check(
    "the house lights the parts in their quote and leaves the rest as the outline",
    states["lower-eave"] === "on" && states["upper-eave"] === "on" && states.garage === "on" && states["upper-gable"] === "on" && states["garage-gable"] === "none" && states.porch === "none",
    JSON.stringify(states),
  );
  const explainer = page.getByTestId("quote-explainer");
  const explainerClosed = (await explainer.getAttribute("open")) === null;
  await explainer.locator("summary").click();
  await page.waitForTimeout(400);
  const explained = flat(await page.getByTestId("parts-explained").innerText().catch(() => ""));
  check(
    "What do these mean? opens labelled drawings of an eave, a gable, a garage line, the sides and a porch",
    explainerClosed &&
      ["Eave:", "Gable:", "Garage line:", "Sides:", "Porch:", "Upper is the second storey. Lower is the main floor."].every((t) => explained.includes(t)) &&
      (await page.getByTestId("parts-explained").locator("svg").count()) === 5,
    explained.slice(0, 160),
  );
  // 5. The price, line by line.
  const lines = (await page.getByTestId("quote-lines").innerText()).replace(/\s+/g, " ");
  check(
    "the price line by line: lights at the per-foot price, the box, upper access with its reason, extra work and the discount",
    lines.includes("Track and lights") &&
      lines.includes("166 ft at $24/ft") &&
      lines.includes("$3,984") &&
      lines.includes("Control box Always included $500") &&
      lines.includes("Upper roof access For work up high: $200, or $400 with an upper gable $400") &&
      lines.includes("Extra height") &&
      lines.includes("Garage corner") &&
      lines.includes("\u2212$150") &&
      !lines.includes("Rush colour fee"),
    lines,
  );
  check("the total, with no mention of GST while GST is off", (await totalOf(page, "smaller-total")) === "$4,959" && !/GST/.test(text));
  // 6. Track colour, in Keenan's words, with the fee as a dollar amount.
  check(
    "track colour: their colour, white is stock, and the rush colour fee as a dollar amount",
    text.includes("Your colour: White.") &&
      text.includes("White is our stock colour. It costs nothing extra and fits this season's schedule.") &&
      text.includes("Any other colour is powder coated: nothing extra if it can wait for spring, or the $350 rush colour fee to have it before Christmas."),
  );
  // 7. Tap to open, closed until tapped.
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
  const installDay = (Array.isArray(settingsRow?.presentation) ? settingsRow.presentation : []).find((p) => p?.kind === "install_day");
  const galleryCount = (Array.isArray(settingsRow?.presentation) ? settingsRow.presentation : []).find((p) => p?.kind === "gallery")?.image_paths?.filter(Boolean)?.length ?? 0;
  check(
    "How install day works from Settings, and See our work hidden until there are photos",
    (installDay?.body?.trim() ? (await page.getByTestId("quote-install-day").count()) === 1 : true) &&
      (galleryCount === 0 ? (await page.getByTestId("quote-gallery").count()) === 0 : (await page.getByTestId("quote-gallery").count()) === 1),
    `${galleryCount} gallery photos`,
  );
  const order = await page.evaluate(() =>
    ["hero-total", "quote-christmas", "quote-points", "quote-runs", "quote-house", "start-smaller", "smaller-total", "quote-lines", "quote-colour", "quote-more", "quote-footer"]
      .map((id) => document.querySelector(`[data-testid="${id}"]`))
      .filter(Boolean)
      .map((el) => el.getBoundingClientRect().top + window.scrollY),
  );
  check("the sections in Keenan's order, top to bottom, with the total right under the switches", order.every((top, at) => at === 0 || top > order[at - 1]), order.map(Math.round).join(","));
  const gap = await page.evaluate(() => {
    const rows = document.querySelector('[data-testid="start-smaller"]').getBoundingClientRect();
    const total = document.querySelector('[data-testid="smaller-total"]').getBoundingClientRect();
    return Math.round(total.top - rows.bottom);
  });
  check("a switch and the total share the screen: the total sits within 60 px of the last switch", gap >= 0 && gap <= 60, `${gap} px`);
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
  const bar = (await page.getByTestId("quote-bar").innerText()).replace(/\s+/g, " ").trim();
  check(
    "a bar fixed to the bottom with Call, Text and Book my install, and no price in it",
    (await page.getByRole("button", { name: "Book my install" }).isVisible()) && bar === "Call Text Book my install" && (await page.getByTestId("quote-bar").evaluate((el) => getComputedStyle(el).position)) === "fixed",
    bar,
  );
  const targets = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="quote-bar"] a, [data-testid="quote-bar"] button, [role="switch"], summary, [data-testid="quote-footer"] a, [data-testid="switch-all-on"]')].map((el) => Math.round(el.getBoundingClientRect().height)),
  );
  check("every tap target is at least 44 px tall", targets.every((h) => h >= 44), targets.join(","));
  await page.screenshot({ path: `${out}/ql-phone-top.png` });
  await page.screenshot({ path: `${out}/ql-phone-full.png`, fullPage: true });

  await page.waitForTimeout(800);
  const { data: visited } = await admin.from("quote_links").select("view_count, first_viewed_at").eq("id", link.data.id).single();
  const { data: opened } = await admin.from("lead_events").select("actor_id").eq("lead_id", leadId).eq("type", "quote_link_opened");
  check("the visit is counted, nothing about the visitor stored, and goes on the timeline once", visited?.view_count === 1 && opened?.length === 1 && opened[0].actor_id === null, JSON.stringify(visited));

  // Start smaller: the upper gable off, then the other upper run, then the
  // front, down to the minimum. The total counts to each new figure.
  const smaller = page.getByTestId("start-smaller");
  await smaller.getByRole("switch", { name: /^Left gable/ }).click();
  await page.waitForTimeout(90);
  const counting = await shownOf(page, "smaller-total");
  await page.waitForTimeout(700);
  check(
    "switching off the upper gable dims it on the house, drops upper access to $200, and the total counts to its new figure",
    (await segment(page, "upper-gable")) === "off" &&
      lines.length > 0 &&
      (await page.locator('[data-testid="quote-lines"] [data-line="Upper roof access"]').innerText()).includes("$200") &&
      (await totalOf(page, "smaller-total")) === "$4,231" &&
      (await shownOf(page, "smaller-total")) === "$4,231" &&
      counting !== "$4,231" &&
      (await totalOf(page, "hero-total")) === "$4,231" &&
      (await page.getByTestId("hero-full").innerText()).trim() === "Full quote $4,959",
    `while counting: ${counting}`,
  );
  const markOf = async (name) =>
    smaller.getByRole("switch", { name: new RegExp(`^${name}`) }).locator(`[data-state="off"], [data-state="on"]`).first().getAttribute("data-state").catch(() => null);
  check(
    "each switch carries a small drawing of its own part: lit while on, dashed once off",
    (await markOf("Left gable")) === "off" && (await markOf("Front upper")) === "on" && (await markOf("Garage")) === "on",
  );
  await smaller.getByRole("switch", { name: /^Front upper/ }).click();
  await page.waitForTimeout(700);
  check(
    "switching off every upper run drops upper access and the extra work marked only with upper runs",
    !(await lineShown(page, "Upper roof access")) &&
      !(await lineShown(page, "Extra height")) &&
      (await lineShown(page, "Garage corner")) &&
      (await segment(page, "upper-eave")) === "off" &&
      (await totalOf(page, "smaller-total")) === "$2,633",
  );
  await smaller.getByRole("switch", { name: /^Front,/ }).click();
  await page.waitForTimeout(700);
  const minLines = (await page.getByTestId("quote-lines").innerText()).replace(/\s+/g, " ");
  const note = flat(await page.getByTestId("minimum-note").innerText()).trim();
  check(
    "below the minimum, both totals come to it, with the lines' own subtotal, a line saying so and Keenan's two sentences at the total",
    minLines.includes("Before the minimum $1,097 To reach our $2,500 minimum $1,403") &&
      (await totalOf(page, "line-total")) === "$2,500" &&
      (await totalOf(page, "smaller-total")) === "$2,500" &&
      (await totalOf(page, "hero-total")) === "$2,500" &&
      note === "That's under our $2,500 minimum, so this option comes to $2,500. Need a repair or something smaller? Call or text us and we'll see what we can do." &&
      (await page.getByTestId("hero-full").innerText()).trim() === "Full quote $4,959",
    `${minLines} | ${note}`,
  );
  // The last part is marked disabled; a tap on it anyway changes nothing.
  await smaller.getByRole("switch", { name: /^Garage/ }).click({ force: true });
  check("the last part stays on", (await smaller.getByRole("switch", { name: /^Garage/ }).getAttribute("aria-checked")) === "true");
  check("prices, footage and discounts can't be changed", (await page.locator("input, textarea, select").count()) === 0);
  await page.screenshot({ path: `${out}/ql-phone-smaller.png`, fullPage: true });
  await page.waitForTimeout(2000);
  const { data: chosen } = await admin.from("quote_links").select("selection").eq("id", link.data.id).single();
  check("their choice is saved on their own link", JSON.stringify(chosen?.selection) === "[2]", JSON.stringify(chosen));

  // The mockup, full screen.
  await page.getByRole("button", { name: /Open the picture of your house/ }).click();
  const viewer = page.getByTestId("mockup-viewer");
  await viewer.waitFor({ timeout: 5000 }).catch(() => {});
  const viewerOpen = await viewer.isVisible().catch(() => false);
  await page.screenshot({ path: `${out}/ql-phone-mockup.png` });
  await viewer.getByRole("button", { name: "Close" }).click().catch(() => {});
  check("a tap opens the mockup full screen to zoom, and Close brings them back", viewerOpen && !(await viewer.isVisible().catch(() => false)));

  // Book my install: it asks once, restating the choice, before it books.
  // A quick second tap lands where Yes appears; it must not book.
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
    "Book my install asks first, with the choice, the total and nothing to sign or pay",
    (await page.getByTestId("confirm-option").innerText()).trim() === "Garage only" &&
      (await page.getByTestId("confirm-total").innerText()).trim() === "$2,500" &&
      confirmText.includes("There's nothing to sign or pay today.") &&
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
    "Book my install shows the thank-you: Keenan in touch within a day, nothing to sign or pay",
    thanks.includes("Keenan will be in touch within a day to set your install date and go through the agreement.") &&
      thanks.includes("There's nothing to sign or pay today.") &&
      (await page.getByTestId("thanks-option").innerText()).trim() === "Garage only" &&
      (await page.getByTestId("thanks-total").innerText()).trim() === "$2,500",
    thanks.slice(0, 240),
  );
  await page.screenshot({ path: `${out}/ql-phone-thanks.png`, fullPage: true });
  const { data: booked } = await admin.from("quote_links").select("booked_at, booked_option").eq("id", link.data.id).single();
  const { data: requested } = await admin.from("lead_events").select("payload, actor_id").eq("lead_id", leadId).eq("type", "install_requested");
  const { data: quoteAfter } = await admin.from("quotes").select("status, accepted_at").eq("id", quote.data.id).single();
  const { data: earnings } = await admin.from("earnings").select("id").eq("lead_id", leadId);
  check(
    "the option is saved in words, on the timeline without a price, and the quote is not accepted",
    booked?.booked_option === "Start smaller: Garage" &&
      requested?.length === 1 &&
      requested[0].payload?.option === "Start smaller: Garage" &&
      JSON.stringify(requested[0].payload?.runs) === JSON.stringify(["Garage"]) &&
      Object.keys(requested[0].payload ?? {}).length === 2 &&
      quoteAfter?.status === "draft" &&
      quoteAfter?.accepted_at === null &&
      (earnings ?? []).length === 0,
    JSON.stringify({ booked, requested, quoteAfter }),
  );
  await page.reload();
  await settle(page);
  check(
    "coming back, the page says they asked to book, and the bar no longer offers it again",
    (await page.getByTestId("quote-booked-before").innerText().catch(() => "")).includes("you asked us to book your install: Garage only.") &&
      (await page.getByTestId("bar-requested").innerText()).includes("Install requested") &&
      (await page.getByRole("button", { name: "Book my install" }).count()) === 0,
  );
  await page.screenshot({ path: `${out}/ql-phone-return.png` });
  await customer.close();

  // ---------------------------------------------------------------- Keenan
  const ownerContext = await browser.newContext(ipad);
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  const owner = await ownerContext.newPage();
  await owner.goto(`${base}/app/leads/${leadId}`);
  await settle(owner);
  const card = owner.getByTestId("quote-card");
  const cardText = (await card.innerText().catch(() => "")).replace(/\s+/g, " ");
  check(
    "the lead's Quote card leads with the booking, then the total, opens and last visit",
    (await card.getByTestId("quote-card-booked").innerText().catch(() => "")).includes(`${TEST_LEAD} asked to book Garage only, $2,500.`) &&
      cardText.includes("Quoted total, all parts") &&
      cardText.includes("$4,959") &&
      cardText.includes(`Price held until ${longDay(validUntil)}`) &&
      cardText.includes("Opened 2 times, last") &&
      !cardText.includes(".."),
    cardText.slice(0, 300),
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
    timeline.includes("Opened the quote link.") && timeline.includes("Tapped Book my install: Garage only.") && !/\$\d/.test(timeline),
    timeline.slice(0, 300),
  );
  await owner.screenshot({ path: `${out}/ql-ipad-lead.png`, fullPage: true });

  // Keenan's own preview counts nothing and books nothing.
  const preview = await ownerContext.newPage();
  await preview.goto(quoteUrl);
  await settle(preview);
  await preview.waitForTimeout(1000);
  // It opens at the booked choice; switching the front back on offers an update.
  await preview.getByTestId("start-smaller").getByRole("switch", { name: /^Front,/ }).click();
  await preview.getByRole("button", { name: "Update my choice" }).click();
  await preview.waitForTimeout(600);
  await preview.getByTestId("book-confirm").getByRole("button", { name: "Yes, update it" }).click();
  await preview.getByTestId("thanks-preview").waitFor({ timeout: 20000 }).catch(() => {});
  const previewNote = await preview.getByTestId("thanks-preview").isVisible().catch(() => false);
  const { data: afterPreview } = await admin.from("quote_links").select("view_count, booked_option").eq("id", link.data.id).single();
  check(
    "Keenan's signed-in visit isn't counted and his Book my install is a preview",
    previewNote && afterPreview?.view_count === 2 && afterPreview?.booked_option === "Start smaller: Garage",
    JSON.stringify(afterPreview),
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
  await calmPage.getByTestId("start-smaller").getByRole("switch", { name: /^Front,/ }).click();
  await calmPage.waitForTimeout(60);
  check("with reduce motion on, the total swaps straight to its new figure", (await shownOf(calmPage, "smaller-total")) === (await totalOf(calmPage, "smaller-total")));
  await calm.close();

  // ---------------------------------------------------------------- after the price hold
  await admin.from("quotes").update({ valid_until: addDays(calgaryToday(), -1) }).eq("id", quote.data.id);
  const later = await browser.newContext(phone);
  const laterPage = await later.newPage();
  await laterPage.goto(quoteUrl);
  await settle(laterPage);
  const held = flat(await laterPage.getByTestId("quote-price-hold").innerText().catch(() => "")).trim();
  await laterPage.getByTestId("start-smaller").getByRole("switch", { name: /^Front,/ }).click();
  await laterPage.getByRole("button", { name: "Update my choice" }).click();
  const laterConfirm = flat(await laterPage.getByTestId("book-confirm").innerText().catch(() => ""));
  await laterPage.waitForTimeout(600);
  await laterPage.getByTestId("book-confirm").getByRole("button", { name: "Yes, update it" }).click();
  await laterPage.getByTestId("quote-thanks").waitFor({ timeout: 20000 }).catch(() => {});
  const { data: rebooked } = await admin.from("quote_links").select("booked_option").eq("id", link.data.id).single();
  const passed = `Prices may have changed since ${fullDate(addDays(calgaryToday(), -1))}. We'll confirm before booking.`;
  check(
    "after the price-held-until date the link still works, says prices may have changed, and Book my install still goes through",
    held === passed && laterConfirm.includes(passed) && rebooked?.booked_option === "Start smaller: Front, Garage",
    `${held} | ${rebooked?.booked_option}`,
  );
  await laterPage.screenshot({ path: `${out}/ql-phone-held.png` });
  await later.close();

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
  if (mockupPath) await admin.storage.from(BUCKET).remove([mockupPath]).catch(() => {});
  if (setter.id) {
    const { data: owned } = await admin.from("leads").select("id").eq("created_by", setter.id);
    const ids = (owned ?? []).map((row) => row.id);
    if (ids.length > 0) {
      await admin.from("quote_links").delete().in("lead_id", ids);
      await admin.from("quotes").delete().in("lead_id", ids);
    }
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
