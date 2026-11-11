// Live walk-through of meeting mode (M5) against a running build, on an
// iPad-sized page with touch. Keenan's side uses the one-time owner session
// he approved (owner-session.mjs): it opens meeting mode for a test lead,
// pages through it, types into the quote and the initials, and never taps
// Save or Confirm, so nothing is written as Keenan; the run checks
// afterwards that nothing of his changed. The test lead belongs to a
// throwaway setter, is named "TEST LEAD (automated)", carries a test
// mockup, and is deleted at the end with the setter and the file.
//
// Weak signal is checked on a second server this walk-through starts on its
// own port, from the local build: meeting mode is opened there once with
// signal, that server is stopped, and the page is reloaded with nothing
// left to answer it. A deployed site can't be stopped, so run against one,
// this part still uses the local build of the same code.
//
// The deck (round 7; round 9, the meeting as one story) reads its words from
// settings.deck and Keenan's own photos from deck_photos, which are never
// staged here: the deck shows his photos where he has uploaded them and the
// drawings where he has not, and the gallery is checked when he has install
// photos, and named as not reached when he has not. The test lead has a
// mockup and is never traced, so Your house, lit stands in for Your house
// and neither the light picker nor Warm white shows (the spec's table; the
// traced story has its own walk-through, meeting-story-walkthrough.mjs).
// The test lead carries a split soffit with a setter's note, to prove the
// note never reaches the deck.
//
// Round 9: a quiet "Next: {page}" beside the forward chevron names the page
// that comes next; the price page is a presentation (the options, biggest
// first, with Choose), and the builder's inputs live behind Keenan's Edit,
// in the shared quote editor. Choose, the colour page's timing buttons and
// a picked install day save the quote quietly, so the owner's session never
// taps them; Edit is typed into but never saved. What happens next closes
// the meeting: four steps, and Pick a day opens its layer (never a day).
//
// The layout check (round 7 review; the spec's "every seeded page fits at
// 1180x820 and 1366x1024"): at both sizes, every page and every layer it
// opens (each More, the contact sheet, the colour chooser) is measured: the
// band, the split columns and the layer never scroll, no line of text
// crosses into the bottom row (the More button or Back, the dots, the
// chevrons), the chevrons and the exit never sit on another control, the
// row's dots share the button's centre line, and a layer hides the dots.
// At 1180 x 820 the colour chooser is measured with Custom chosen, so its
// colour number and Save are checked against the keyboard's 400 px line as
// the initials are; at 1366 x 1024 the initials end by 55% of the height;
// and the price page's Choose and Edit sit clear of the bottom row at
// either size.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";
import { deckLine, deckOrder, fillLine, nextLabelText, pageLabel as deckPageLabel } from "./deck-order.mjs";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const offlinePort = Number(process.env.OFFLINE_PORT ?? Number(new URL(base).port || 3300) + 1);
const offlineBase = `http://localhost:${offlinePort}`;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The M5 walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
// The setter's which-is-where note on a split soffit: never in the deck.
const SOFFIT_NOTE = "TEST NOTE white on the garage only";
const BUCKET = "lead-photos";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const setter = { email: `m5-live-a-${stamp}@example.com`, password: `cedar-lantern-orbit-${digits}`, name: "M5 Test Setter", id: null };

const ipad = { viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1, hasTouch: true };
// The two iPads the deck is laid out for: the 11-inch Air and the 12.9-inch Pro.
const LAYOUT_SIZES = [
  { width: 1180, height: 820 },
  { width: 1366, height: 1024 },
];

// The deck draws customer words with typographic apostrophes (lib/typography.ts).
const smart = (text) => text.replace(/(\p{L})'(?=\p{L})/gu, "$1\u2019");
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const flat = (text) => (text ?? "").replace(/\s+/g, " ").trim();
// Calgary's date, as meeting mode's today: Alberta has stayed on UTC-6 since November 1, 2026.
const calgaryZone = (moment) => (moment.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton");
const calgaryDay = (moment = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(moment), year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
const tight = (text) => (text ?? "").replace(/\s+/g, "");

// The same as lib/pricing.ts formatMoney.
function money(amount) {
  const cents = Math.round(Math.abs(amount) * 100);
  const text = (cents / 100).toLocaleString("en-CA", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}$${text}`;
}

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

// A one-finger swipe, as touch events. (Chromium's synthesized scroll
// gesture does not move a scroll-snap pager when headless; raw touches do.)
async function touchSwipe(page, cdp, x, y, distance) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  for (let step = 1; step <= 14; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (distance * step) / 14, y, id: 1 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(1000);
}

const dots = (page) => page.locator('ol[aria-label="Where you are"]');
const currentScreen = (page) => dots(page).locator('button[aria-current="true"]').getAttribute("aria-label");

async function goToScreen(page, label) {
  await dots(page).getByRole("button", { name: label, exact: true }).click();
  await page
    .waitForFunction(
      (want) => document.querySelector('ol[aria-label="Where you are"] button[aria-current="true"]')?.getAttribute("aria-label") === want,
      label,
      { timeout: 10000 },
    )
    .catch(() => {});
  await page.waitForTimeout(300);
}

// Everything the layout check measures, in the page: the page on screen (or
// the layer open over it). Text is measured line by line (its ranges), so a
// wide paragraph box with short lines is never mistaken for a collision.
function measureDeck() {
  const problems = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const hit = (a, b) => a.right > b.left + 0.5 && a.left < b.right - 0.5 && a.bottom > b.top + 0.5 && a.top < b.bottom - 0.5;
  const name = (el) => (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 30);
  const layer = document.querySelector("[data-deck-layer]");
  const scope = layer ?? document.querySelector("section[data-page]:not([inert])");
  if (!scope) return { problems: ["no page on screen"], info: {} };
  for (const box of scope.querySelectorAll("[data-deck-box]")) {
    if (visible(box) && box.scrollHeight > box.clientHeight + 1) problems.push(`the ${box.dataset.deckBox} scrolls (${box.scrollHeight} > ${box.clientHeight})`);
  }
  const row = [...document.querySelectorAll('[data-deck-row="button"] button, [data-deck-row="nav"] button, [data-deck-row="nav"] ol')].filter(visible);
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    const parent = node.parentElement;
    if (!text || !parent || parent.closest("[data-deck-row], button, [aria-hidden='true'], .sr-only") || !visible(parent)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const line of range.getClientRects()) {
      for (const control of row) {
        if (hit(line, control.getBoundingClientRect())) problems.push(`"${text.slice(0, 30)}" runs into ${name(control)}`);
      }
    }
  }
  const mine = [...document.querySelectorAll('[aria-label="Previous"], [aria-label="Next"], [aria-label^="Hold to leave"]')].filter(visible);
  const controls = [
    ...scope.querySelectorAll("button, input, a, select, textarea, label[data-answer]"),
    ...document.querySelectorAll("[data-deck-row] button, [data-deck-row] ol"),
  ].filter(visible);
  for (const one of mine) {
    for (const control of controls) {
      if (control === one || control.contains(one) || one.contains(control)) continue;
      if (hit(one.getBoundingClientRect(), control.getBoundingClientRect())) problems.push(`${name(one)} sits on ${name(control)}`);
    }
  }
  const nav = document.querySelector('[data-deck-row="nav"]');
  const info = { layer: Boolean(layer), dots: Boolean(nav) };
  if (layer && nav) problems.push("the dots and chevrons stay up while a layer is open");
  const button = scope.querySelector('[data-deck-row="button"] button');
  if (nav && button) {
    const dots = nav.querySelector("ol").getBoundingClientRect();
    const b = button.getBoundingClientRect();
    if (Math.abs(dots.top + dots.height / 2 - (b.top + b.height / 2)) > 1) problems.push("the dots are off the button's centre line");
  }
  return { problems, info };
}

async function ownerFootprint(ownerId) {
  const [profile, leads, events, settings, colours, quotes] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).single(),
    admin.from("leads").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("lead_events").select("id").eq("actor_id", ownerId).order("id"),
    admin.from("settings").select("*").eq("id", 1).single(),
    admin.from("track_colours").select("*").order("id"),
    admin.from("quotes").select("id, updated_at").eq("created_by", ownerId).order("id"),
  ]);
  return JSON.stringify({ profile: profile.data, leads: leads.data, events: events.data, settings: settings.data, colours: colours.data, quotes: quotes.data });
}

async function accountEmails() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (data?.users ?? []).map((u) => u.email ?? "");
}

async function serverAnswers(origin) {
  try {
    const response = await fetch(`${origin}/login`);
    return response.status === 200;
  } catch {
    return false;
  }
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
  // The first sign-in welcome has its own walk-through; this one starts after it.
  await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", setter.id);

  const { data: ownerRow } = await admin.from("profiles").select("id").eq("role", "owner").single();
  const ownerId = ownerRow.id;
  const { data: settings } = await admin
    .from("settings")
    .select("deck, light_looks, warranty_text, price_per_ft, box_price, gst_enabled, upper_access_fee, upper_gable_access_fee, min_job_total")
    .eq("id", 1)
    .single();
  const { data: colour } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order").limit(1).single();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      first_name: TEST_LEAD,
      address_line: "1 Test Crescent SW",
      created_by: setter.id,
      soffit_colour: "off_white",
      soffit_colour_2: "white",
      soffit_note: SOFFIT_NOTE,
    })
    .select("id")
    .single();
  if (leadError) throw new Error(`lead: ${leadError.message}`);
  const leadId = lead.id;
  const colourSet = await admin.from("leads").update({ track_colour_id: colour.id }).eq("id", leadId);
  if (colourSet.error) throw new Error(`colour: ${colourSet.error.message}`);
  const mockupPath = `${setter.id}/${crypto.randomUUID()}.jpg`;
  const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#1d3445" } }).jpeg().toBuffer();
  const uploaded = await admin.storage.from(BUCKET).upload(mockupPath, jpeg, { contentType: "image/jpeg" });
  if (uploaded.error) throw new Error(`mockup upload: ${uploaded.error.message}`);
  // Round 10: the mockup is a lead_mockups row, the house's Main, inserted
  // by the service role (the lead page's Mockups section is builder A's).
  const mockupRow = await admin.from("lead_mockups").insert({
    lead_id: leadId,
    storage_path: mockupPath,
    name: "Warm white",
    is_main: true,
    position: 0,
    created_by: ownerId,
  });
  if (mockupRow.error) throw new Error(`mockup row: ${mockupRow.error.message}`);

  // Keenan's gallery photos, if he has uploaded any (never staged here).
  const order = deckOrder(settings, { lead: { main: true } });
  const expected = order.map((p) => p.label);
  const pageLabel = (key) => deckPageLabel(settings.deck, key);
  // Round 10: the Main mockup is Up once, there all year; the colour page
  // folded into Your price, so its section below is skipped.
  const MOCKUP = pageLabel("what_vesper_is");
  const AFTER_MOCKUP = order[order.findIndex((p) => p.key === "what_vesper_is") + 1]?.label ?? null;
  const COLOUR = null;
  const PRICE = pageLabel("quote");
  const NEXT = pageLabel("next_steps");
  const before = await ownerFootprint(ownerId);

  // ---------------------------------------------------------------- Keenan opens it from the lead
  const ownerContext = await browser.newContext(ipad);
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  page = await ownerContext.newPage();
  await page.goto(`${base}/app/leads/${leadId}`);
  await settle(page);
  const card = page.getByTestId("mockup-card");
  check("the lead page offers meeting mode, with the customer's mockup", (await card.count()) === 1 && (await card.locator("img").count()) === 1);
  const entryHref = await card.getByRole("link", { name: "Open meeting mode" }).getAttribute("href");
  const [opened] = await Promise.all([
    page.waitForResponse((r) => r.url().split("#")[0] === `${base}/meeting/${leadId}` && r.request().resourceType() === "document", { timeout: 30000 }),
    card.getByRole("link", { name: "Open meeting mode" }).click(),
  ]);
  check("Open meeting mode loads the whole page, so the iPad can keep it", opened.ok());
  check("the way in asks for a fresh start at the cover", entryHref === `/meeting/${leadId}#start`, entryHref ?? "");
  await dots(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);

  const labels = await dots(page).getByRole("button").evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
  check(
    "the deck shows its pages in the story's order (the Vesper pages, then their house, then What happens next), skipping any page with nothing to show",
    JSON.stringify(labels) === JSON.stringify(expected),
    `${labels.join(" | ")}${JSON.stringify(labels) === JSON.stringify(expected) ? "" : ` (expected ${expected.join(" | ")})`}`,
  );
  const keys = await page.locator("section[data-page]").evaluateAll((sections) => sections.map((s) => s.getAttribute("data-page")));
  check(
    "a Main mockup and no trace: Up once, there all year shows it, and no page missing its mockup shows (no day and night, no phone, no picker)",
    keys.includes("what_vesper_is") && !keys.includes("hidden_by_day") && !keys.includes("phone_control") && !keys.includes("light_picker") && !keys.includes("your_house") && !keys.includes("colour"),
    `${keys.join(", ")}; the mockup page reads "${MOCKUP}"`,
  );
  check(
    "the story closes on What happens next, straight after the price",
    keys.at(-1) === "next_steps" && keys.at(-2) === "quote" && keys.at(-3) === "warranty",
    keys.slice(-3).join(", "),
  );
  check("meeting mode is full screen, with no tabs and no side rail", (await page.locator('nav[aria-label="Tabs"]').count()) === 0);
  check("it opens on the cover, with the address", (await currentScreen(page)) === "Vesper" && (await page.getByRole("region", { name: "Vesper" }).innerText()).includes("1 Test Crescent SW"));
  if ((await page.getByTestId("deck-cover").getAttribute("data-house").catch(() => null)) === "true") {
    // Round 15: with a Main mockup the cover leads with the house, and says
    // who it is for, what Vesper is (from Settings), three points and the date.
    const coverText = await page.getByTestId("deck-cover").innerText();
    check(
      "the cover leads with their house, framed, with who it's for, the line on what Vesper is, three points and today's date",
      (await page.getByTestId("cover-frame").count()) === 1 &&
        /^Prepared for /.test(flat(await page.getByTestId("deck-cover-prepared").innerText())) &&
        flat(await page.getByTestId("deck-cover-what").innerText()) === smart(deckLine(settings.deck, "cover_what")) &&
        (await page.locator("[data-testid=deck-cover-points] li").count()) === 3 &&
        (await page.getByTestId("deck-cover-date").innerText()).trim().length > 0,
      coverText.slice(0, 240),
    );
    await page.getByTestId("house-photo-open").first().click();
    await page.getByTestId("deck-full").waitFor({ timeout: 5000 }).catch(() => {});
    const fullOpen = (await page.getByTestId("deck-full").count()) === 1;
    await page.getByTestId("deck-full-close").click().catch(() => {});
    await page.waitForTimeout(400);
    check(
      "tapping the house opens it full screen on black, and closing it stays on the cover",
      fullOpen && (await page.getByTestId("deck-full").count()) === 0 && (await currentScreen(page)) === "Vesper",
    );
  } else {
    check(
      "the cover says what's coming, in the line from Settings",
      flat(await page.getByTestId("deck-cover-line").innerText().catch(() => "")) === smart(deckLine(settings.deck, "cover_line")),
      await page.getByTestId("deck-cover-line").innerText().catch(() => "no line"),
    );
  }
  const deckText = await page.locator("body").innerText();
  check(
    "nothing internal anywhere in the deck: no setter, no status, no pipeline",
    !deckText.includes(setter.name) && !deckText.includes(setter.email) && !/meeting_booked|Follow up|Qualified|Pipeline/i.test(deckText),
  );
  const sectionsEmpty = [];
  const wrongNext = [];
  for (const [at, label] of expected.entries()) {
    await goToScreen(page, label);
    const empty = await page
      .getByRole("region", { name: label })
      .evaluate((s) => s.innerText.trim() === "" && s.querySelectorAll("img, canvas, svg").length === 0);
    if (empty) sectionsEmpty.push(label);
    // The quiet Next label names the page that actually comes next; none on the last.
    const shown = (await page.getByTestId("deck-next-label").count()) > 0 ? flat(await page.getByTestId("deck-next-label").innerText()) : null;
    const want = at < expected.length - 1 ? smart(nextLabelText(settings.deck, expected[at + 1])) : null;
    if (shown !== want) wrongNext.push(`${label}: "${shown}" (expected "${want}")`);
  }
  check("no screen is empty", sectionsEmpty.length === 0, sectionsEmpty.join(", "));
  check("every page but the last says what comes next, \"Next: {page}\", skipped pages left out", wrongNext.length === 0, wrongNext.slice(0, 4).join("; "));
  const allText = await page.locator("body").innerText();
  check("the setter's soffit note never reaches the deck", !allText.includes(SOFFIT_NOTE) && !(await page.content()).includes(SOFFIT_NOTE));
  await goToScreen(page, "Vesper");
  await page.screenshot({ path: `${out}/m5-cover.png` });
  const cdp = await ownerContext.newCDPSession(page);
  await touchSwipe(page, cdp, 900, 500, -700);
  check("a swipe on the cover turns to the next page", (await currentScreen(page)) === expected[1], await currentScreen(page));

  // ---------------------------------------------------------------- Hidden by day: Keenan's pair, or the drawn pair
  const dayNightLabel = pageLabel("hidden_by_day");
  if (expected.includes(dayNightLabel)) {
    await goToScreen(page, dayNightLabel);
    const region = page.getByRole("region", { name: dayNightLabel });
    const line = region.locator('input[type="range"]');
    const before50 = await line.inputValue();
    const box = await region.boundingBox();
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.4);
    await page.waitForTimeout(400);
    const after20 = await line.inputValue();
    check("a tap on the day and night picture moves the line there", before50 === "50" && after20 === "20", `${before50} to ${after20}`);
    const handle = await region.locator("div.cursor-ew-resize").boundingBox();
    await touchSwipe(page, cdp, Math.round(handle.x + handle.width / 2), Math.round(handle.y + handle.height * 0.5), 400);
    const dragged = await line.inputValue();
    check("dragging the grip moves the line and keeps the page", dragged !== after20 && (await currentScreen(page)) === dayNightLabel, `${after20} to ${dragged}`);
    await touchSwipe(page, cdp, Math.round(box.x + box.width * 0.9), Math.round(box.y + box.height * 0.3), -700);
    check("a swipe away from the grip turns the page", (await currentScreen(page)) !== dayNightLabel, await currentScreen(page));
  } else {
    note("Hidden by day was not reached: Settings has no words for it, so the deck skips it");
  }

  // ---------------------------------------------------------------- a More: one layer, Back, the pager locked
  const whatLabel = pageLabel("what_vesper_is");
  const moreLabel = typeof settings.deck?.pages?.what_vesper_is?.more_label === "string" ? settings.deck.pages.what_vesper_is.more_label.trim() : "";
  if (expected.includes(whatLabel) && moreLabel) {
    await goToScreen(page, whatLabel);
    await page.getByRole("region", { name: whatLabel }).getByRole("button", { name: smart(moreLabel) }).click();
    const layer = page.getByRole("dialog", { name: smart(moreLabel) });
    await layer.waitFor({ timeout: 5000 }).catch(() => {});
    const opened = (await layer.count()) === 1;
    const openedNoDots = (await dots(page).count()) === 0;
    const pagerLocked = (await page.locator('[aria-label="Meeting screens"]').evaluate((el) => getComputedStyle(el).overflowX)) === "hidden";
    const lb = opened ? await layer.boundingBox() : null;
    if (lb) await touchSwipe(page, cdp, Math.round(lb.x + lb.width * 0.8), Math.round(lb.y + lb.height * 0.5), -500);
    check(
      `${moreLabel} opens a full-screen layer, and a sideways swipe closes it without turning the page`,
      opened && (await layer.count()) === 0 && (await currentScreen(page)) === whatLabel,
      await currentScreen(page),
    );
    check("while it was open the dots and chevrons were hidden and the pager locked", openedNoDots && pagerLocked);
  } else {
    note("What Vesper is's More was not reached: Settings has no words for it");
  }

  // The gallery (Homes we've lit) left the meeting in round 10.
  // ---------------------------------------------------------------- Up once, there all year (their Main mockup)
  await goToScreen(page, MOCKUP);
  const house = page.getByRole("region", { name: MOCKUP });
  const mockupLoaded = await house
    .locator("img")
    .evaluate((img) => (img.complete ? img.naturalWidth > 0 : new Promise((done) => img.addEventListener("load", () => done(img.naturalWidth > 0)))));
  const mockupWords = (settings.deck?.pages?.what_vesper_is?.words ?? "").trim();
  check(
    `${MOCKUP} shows the customer's mockup, with its words from Settings`,
    mockupLoaded && (mockupWords === "" || flat(await house.innerText()).includes(smart(mockupWords))),
    mockupWords,
  );
  const hb = await house.boundingBox();
  await touchSwipe(page, cdp, Math.round(hb.x + hb.width * 0.8), Math.round(hb.y + hb.height * 0.6), -700);
  check("a one-finger swipe on the mockup turns the page, like everywhere else", (await currentScreen(page)) === AFTER_MOCKUP, await currentScreen(page));
  await cdp.detach();

  // ---------------------------------------------------------------- Your track colour (round 9's page; round 10 folds it into Your price)
  if (COLOUR) {
  // ---------------------------------------------------------------- Your track colour
  await goToScreen(page, COLOUR);
  const colourScreen = page.getByRole("region", { name: COLOUR });
  const colourText = flat(await colourScreen.innerText());
  check(
    `${COLOUR} names the split soffit's two colours on their own lines, and the track colour by name`,
    colourText.includes("Your soffit, two colours") &&
      JSON.stringify(await colourScreen.getByTestId("deck-soffit-colour").allInnerTexts()) === JSON.stringify(["Off-white or cream", "White"]) &&
      colourText.includes(smart(deckLine(settings.deck, "colour_one"))) &&
      colourText.includes(colour.name),
    colour.name,
  );
  // One colour rule (round 9): White is in stock and included; any other
  // colour is made to order, with Install in spring and, when the quote has
  // a rush fee, Install this season (never tapped here: it saves the quote).
  const isWhite = /^white\b/i.test(colour.name.trim());
  const timing = flat(await colourScreen.getByTestId("deck-colour-timing").innerText().catch(() => ""));
  check(
    "the page opens on why the colour matters, then one colour rule for the track",
    flat(await colourScreen.getByTestId("deck-colour-opener").innerText().catch(() => "")) === smart(deckLine(settings.deck, "colour_opener")) &&
      (isWhite
        ? timing === smart(deckLine(settings.deck, "colour_stock")) && (await colourScreen.getByTestId("deck-colour-spring").count()) === 0
        : timing.startsWith(smart(fillLine(deckLine(settings.deck, "colour_made"), { colour: colour.name }))) && (await colourScreen.getByTestId("deck-colour-spring").count()) === 1),
    timing,
  );
  check(
    "the colour book line sits under the initials",
    flat(await colourScreen.getByTestId("deck-colour-book").innerText().catch(() => "")) === smart(deckLine(settings.deck, "colour_book")),
  );
  check("never the setter's which-is-where note", !colourText.includes(SOFFIT_NOTE));
  const initialsBox = await colourScreen.locator("#colour-initials").boundingBox();
  check("the initials sit no lower than 400 px from the top, clear of the keyboard", initialsBox && initialsBox.y + initialsBox.height <= 400 + 834 - 820, `${Math.round(initialsBox?.y ?? 0)}`);
  check(
    "the initials field says what goes in it",
    (await colourScreen.locator("#colour-initials").getAttribute("placeholder")) === "Initials" &&
      (await colourScreen.locator("#colour-initials").getAttribute("aria-label")) === "Your initials",
  );
  const confirm = colourScreen.getByRole("button", { name: "Confirm" });
  const waitsForInitials = await confirm.isDisabled();
  await colourScreen.locator("#colour-initials").fill("ab");
  check(
    "the initials read in capitals and Confirm wakes up once they are typed (never tapped here)",
    waitsForInitials && (await colourScreen.locator("#colour-initials").inputValue()) === "AB" && (await confirm.isEnabled()),
  );
  await page.screenshot({ path: `${out}/m5-colour.png` });
  await colourScreen.getByRole("button", { name: "Change the colour" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose the track colour" });
  await chooser.waitFor({ timeout: 10000 });
  const chooserText = await chooser.innerText();
  check(
    "the colour can be changed without leaving the deck: names only, no swatches",
    chooserText.includes(colour.name) && (await chooser.locator('[style*="background"]').count()) === 0,
  );
  check(
    "the chooser is one of the deck's layers: the dots and chevrons hide and the pager locks",
    (await dots(page).count()) === 0 &&
      (await page.locator('[aria-label="Meeting screens"]').evaluate((el) => getComputedStyle(el).overflowX)) === "hidden",
  );
  check(
    "in front of the customer it says the colour book: Choose the colour, the page's screens line, never RAL Classic or powder coating",
    chooserText.includes("Choose the colour") &&
      chooserText.includes(smart("Screens can't show colour exactly, so we choose it from the colour book together.")) &&
      !/RAL Classic|RAL K7|powder/i.test(chooserText),
  );
  const saveColour = chooser.getByRole("button", { name: "Save track colour" });
  // Gold is Save's data-ready (the Porch Light Rule): only once there is a new colour to save.
  const saveIsGold = async () => (await saveColour.getAttribute("data-ready")) !== null;
  check("Save waits, outlined and off, while nothing has changed", (await saveColour.isDisabled()) && !(await saveIsGold()));
  const chosenLabel = chooser.locator(`label[data-answer="${colour.id}"]`);
  await chooser.locator("label").filter({ has: page.getByText(colour.name, { exact: true }) }).click();
  check(
    "tapping the chosen colour to agree with it keeps it chosen and can never save no colour",
    (await chosenLabel.locator("input").isChecked()) && (await saveColour.isDisabled()) && !(await saveIsGold()),
  );
  check(
    "the chosen colour's tick hangs after its name, which stays centred, as on the light picker",
    await chosenLabel.evaluate((label) => {
      const name = label.querySelector("span");
      const tick = label.querySelector("svg");
      if (!name || !tick) return false;
      const box = label.getBoundingClientRect();
      const words = name.getBoundingClientRect();
      return tick.getBoundingClientRect().left >= words.right - 1 && Math.abs(words.left + words.width / 2 - (box.left + box.width / 2)) <= 1.5;
    }),
  );
  // A finger sliding across the colours (touch White, slide on, let go) is
  // never a swipe that closes the chooser; only the layer's empty space is.
  const swipeCdp = await ownerContext.newCDPSession(page);
  const firstOption = await chooser.locator("label[data-answer]").first().boundingBox();
  await touchSwipe(page, swipeCdp, Math.round(firstOption.x + firstOption.width / 2), Math.round(firstOption.y + firstOption.height / 2), 300);
  check("a sideways slide that starts on a colour never closes the chooser", (await chooser.count()) === 1);
  await chooser.locator("label").filter({ hasText: /^Custom$/ }).click();
  const customText = await chooser.innerText();
  check(
    "Custom asks for the Colour number, from the colour book",
    customText.includes("Colour number") && customText.includes("From the colour book.") && !/RAL Classic|RAL K7|powder/i.test(customText),
  );
  // The other thing typed in front of the customer: the colour number, its
  // read-back and Save sit level with the colours, clear of the keyboard.
  const numberBox = await chooser.locator("#lead-track-ral").boundingBox();
  const saveBox = await saveColour.boundingBox();
  check(
    "the colour number and Save sit no lower than 400 px from the top, clear of the keyboard",
    numberBox && saveBox && numberBox.y + numberBox.height <= 400 + 834 - 820 && saveBox.y + saveBox.height <= 400 + 834 - 820,
    `${Math.round((numberBox?.y ?? 0) + (numberBox?.height ?? 0))}, ${Math.round((saveBox?.y ?? 0) + (saveBox?.height ?? 0))}`,
  );
  await chooser.locator("#lead-track-ral").fill("12");
  const waitsForNumber = !(await saveIsGold());
  await chooser.getByRole("button", { name: "Save track colour" }).click();
  await chooser.locator("#lead-track-ral-error").waitFor({ timeout: 20000 }).catch(() => {});
  const { data: colourAfter } = await admin.from("leads").select("track_colour_id, track_ral_code").eq("id", leadId).single();
  check(
    "a colour number that is not four digits is refused there, in the colour book's words, and nothing is saved",
    waitsForNumber &&
      (await chooser.locator("#lead-track-ral-error").count()) === 1 &&
      (await chooser.locator("#lead-track-ral-error").innerText()) === "Four digits, from the colour book." &&
      colourAfter?.track_colour_id === colour.id &&
      colourAfter?.track_ral_code === null,
  );
  await chooser.locator("#lead-track-ral").fill("7016");
  check(
    "a number in the colour book reads back its name and turns Save gold (never tapped here)",
    (await chooser.getByTestId("lead-track-ral-name").innerText()).includes("7016") && (await saveIsGold()) && (await saveColour.isEnabled()),
    await chooser.getByTestId("lead-track-ral-name").innerText(),
  );
  await touchSwipe(page, swipeCdp, Math.round(numberBox.x + 20), Math.round(numberBox.y + numberBox.height / 2), 200);
  check("a press and drag in the number field never closes the chooser or loses the number", (await chooser.count()) === 1 && (await chooser.locator("#lead-track-ral").inputValue()) === "7016");
  await swipeCdp.detach();
  await chooser.getByRole("button", { name: "Back" }).click();
  // The chooser fades out like every layer.
  await chooser.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  check(
    "Back closes the chooser and keeps the colour, and the dots come back",
    (await chooser.count()) === 0 && (await colourScreen.getByTestId("deck-track-colour").innerText()).includes(colour.name) && (await dots(page).count()) === 1,
  );

  } else {
    note("round 10: the colour page left the deck; its line, timing and initials are on Your price (meeting-story-walkthrough.mjs checks them)");
  }

  // ---------------------------------------------------------------- What happens next (the last page, at every meeting)
  await goToScreen(page, NEXT);
  const nextScreen = page.getByRole("region", { name: NEXT });
  const stepLabels = [];
  for (const id of ["next-step-install", "next-step-pay"]) stepLabels.push(flat(await nextScreen.getByTestId(id).innerText().catch(() => "")));
  check(
    "What happens next (round 10, a wrap-up): Your install day, then Paying with No payment until your install is complete. word for word, and thanks; no colour book line",
    (await nextScreen.getByTestId("next-steps-page").count()) === 1 &&
      stepLabels[0].includes(deckLine(settings.deck, "step_day_label")) &&
      stepLabels[1].includes(deckLine(settings.deck, "step_pay_label")) &&
      stepLabels[1].includes("No payment until your install is complete.") &&
      (await nextScreen.getByTestId("next-steps-thanks").count()) === 1 &&
      !flat(await nextScreen.innerText()).includes(smart(deckLine(settings.deck, "step_colour_todo"))),
    stepLabels.join(" | ").slice(0, 300),
  );
  check("with nothing chosen there's no recap", (await nextScreen.getByTestId("next-steps-recap").count()) === 0);
  check(
    "the install day says We pick the day together., with Pick a day always there; the closing line hands over to the link",
    flat(await nextScreen.getByTestId("next-step-day").innerText().catch(() => "")) === smart(deckLine(settings.deck, "step_day_none")) &&
      flat(await nextScreen.getByTestId("next-step-pick-day").innerText().catch(() => "")) === deckLine(settings.deck, "step_day_button") &&
      flat(await nextScreen.getByTestId("next-steps-closing").innerText().catch(() => "")) === smart(deckLine(settings.deck, "closing")),
  );
  check("the last page has no Next label and no forward chevron", (await page.getByTestId("deck-next-label").count()) === 0 && !(await page.getByRole("button", { name: "Next", exact: true }).isVisible().catch(() => false)));
  check("no Book button, acceptance or amount on What happens next", !/Book|Accept|\$\d/.test(await nextScreen.innerText()));
  await page.screenshot({ path: `${out}/m5-next-steps.png` });
  await nextScreen.getByTestId("next-step-pick-day").click();
  const dayPicker = page.getByTestId("install-day-picker");
  await dayPicker.waitFor({ timeout: 5000 }).catch(() => {});
  const days = await dayPicker.locator("button[data-day]").evaluateAll((buttons) => buttons.map((b) => b.getAttribute("data-day")));
  const tomorrow = (() => {
    const [y, m, d] = calgaryDay().split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  })();
  check(
    "Pick a day opens a layer of three weeks of days from tomorrow, one tap each, and No day yet (no day tapped here: it saves the quote)",
    days.length === 21 && days[0] === tomorrow && (await page.getByTestId("install-day-none").count()) === 1 && (await dots(page).count()) === 0,
    `${days.length} days from ${days[0]}, tomorrow ${tomorrow}`,
  );
  await page.screenshot({ path: `${out}/m5-pick-a-day.png` });
  await page.keyboard.press("Escape");
  await dayPicker.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  check("Escape closes the day layer with no day picked", (await dayPicker.count()) === 0 && flat(await nextScreen.getByTestId("next-step-day").innerText()) === smart(deckLine(settings.deck, "step_day_none")));

  // ---------------------------------------------------------------- Your price (a presentation; the builder is behind Edit)
  await goToScreen(page, PRICE);
  const priceScreen = page.getByRole("region", { name: PRICE });
  check(
    "a fresh quote shows no options until something is measured, in the line from Settings",
    (await priceScreen.getByTestId("price-empty").count()) === 1 &&
      flat(await priceScreen.getByTestId("price-empty").innerText()) === smart(deckLine(settings.deck, "price_empty")) &&
      (await priceScreen.getByTestId("price-option").count()) === 0 &&
      (await priceScreen.getByTestId("price-choose").count()) === 0,
  );
  const editButton = priceScreen.getByTestId("price-edit");
  const editBox = await editButton.boundingBox();
  check("Keenan's Edit is small, outlined, at the bottom left", editBox !== null && editBox.x < 120 && editBox.y > 834 - 140 && editBox.height >= 44, JSON.stringify(editBox));
  await editButton.click();
  const editLayer = page.getByTestId("quote-edit-layer");
  await editLayer.waitFor({ timeout: 5000 }).catch(() => {});
  const editSave = editLayer.getByTestId("quote-edit-save");
  check(
    "Edit opens the quote editor as a full-screen layer over the deck, the dots hidden; Save waits until there are feet to price",
    (await editLayer.getByTestId("quote-editor").count()) === 1 && (await dots(page).count()) === 0 && (await editSave.isDisabled()),
  );
  // Round 11: the editor measures areas on views; the new quote's one
  // empty Front run is the Front lower line.
  await editLayer.getByLabel("Front lower feet", { exact: true }).fill("120");
  await page.waitForTimeout(300);
  const ppf = Number(settings.price_per_ft);
  const minimum = Number(settings.min_job_total ?? 0) || 0;
  const priced = (extra = 0) => Math.max(120 * ppf + Number(settings.box_price) + extra, minimum);
  const withGst = (amount) => (settings.gst_enabled ? `${money(amount)} + GST` : money(amount));
  const wanted = withGst(priced());
  const offerTotal = flat(await editLayer.getByTestId("offer-total").first().innerText().catch(() => ""));
  check(
    "the editor's one Full wrap prices as Keenan types, from Settings",
    (await editLayer.getByTestId("offer-card").count()) === 1 && tight(offerTotal) === tight(wanted),
    `${offerTotal}, expected ${wanted}`,
  );
  check(
    "the Edit layer says the quote is not saved yet, and Save is ready (never tapped here); saving needs signal",
    (await editLayer.getByTestId("quote-edit-status").innerText()).includes("Not saved yet") &&
      (await editLayer.getByTestId("quote-edit-status").innerText()).includes("Saving needs signal.") &&
      (await editSave.isEnabled()),
  );
  await editLayer.getByLabel("Front lower feet", { exact: true }).press("ArrowLeft");
  await page.waitForTimeout(500);
  check(
    "arrow keys stay with the field being typed in",
    (await page.locator('section[data-page="quote"]:not([inert])').count()) === 1 && (await editLayer.count()) === 1,
  );
  // Round 11: the measured line sits on the Front view as Front lower,
  // priced at the quote's price a foot until Keenan says otherwise; upper
  // access follows the areas, from this quote's own two amounts.
  const frontLine = editLayer.locator('[data-testid="editor-run"][data-area="front_lower"]');
  check(
    "the measured line is Front lower on the Front view, at the quote's price a foot",
    (await frontLine.count()) === 1 &&
      (await editLayer.locator('[data-testid="area-view"][data-view="front"]').count()) === 1 &&
      (await editLayer.locator('[data-testid="area-price-mode"]').first().getAttribute("data-mode")) === "quote",
    `${await frontLine.count()} front lower lines`,
  );
  const upperAmount = Number(settings.upper_access_fee ?? 0);
  const gableAmount = Number(settings.upper_gable_access_fee ?? 0);
  await editLayer.getByTestId("editor-prices-toggle").click();
  const upperField = await editLayer.locator("#editor-upper").inputValue().catch((e) => `error: ${e.message.slice(0, 80)}`);
  const gableField = await editLayer.locator("#editor-upper-gable").inputValue().catch((e) => `error: ${e.message.slice(0, 80)}`);
  check(
    "Prices for this quote, collapsed until opened: the upper access amounts come from Settings and can be changed here",
    Number(upperField) === upperAmount && Number(gableField) === gableAmount,
    `fields ${upperField} and ${gableField}, Settings ${settings.upper_access_fee} and ${settings.upper_gable_access_fee}`,
  );
  await page.screenshot({ path: `${out}/m5-edit.png` });
  await editLayer.getByTestId("quote-edit-done").click();
  await editLayer.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});

  const option = priceScreen.getByTestId("price-option");
  // Round 10: the breakdown is one tap away, in a layer; the total is on the option.
  const breakdown = async () => {
    await priceScreen.getByTestId("price-breakdown-open").click();
    const layer = page.getByTestId("price-breakdown");
    await layer.waitFor({ timeout: 5000 }).catch(() => {});
    const text = flat(await layer.innerText().catch(() => ""));
    await page.keyboard.press("Escape");
    await layer.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    return text;
  };
  const priceTotal = async () => tight(await priceScreen.getByTestId("price-option").first().innerText().catch(() => ""));
  check(
    "Done goes back to the price page: one option, Full wrap, on screen and not chosen, its total from Settings",
    (await option.count()) === 1 &&
      (await option.getAttribute("data-on-screen")) === "yes" &&
      (await option.getAttribute("data-chosen")) === "no" &&
      flat(await option.innerText()).includes("Full wrap") &&
      tight(await option.innerText()).includes(tight(wanted)) &&
      (await priceTotal()).includes(tight(money(priced()))),
    flat(await option.innerText().catch(() => "")),
  );
  check(
    "the sub-line names the track colour; What's in it and Choose name the option (Choose never tapped here: it saves the quote)",
    flat(await priceScreen.getByTestId("price-sub").innerText().catch(() => "")) === fillLine(deckLine(settings.deck, "price_sub_one"), { colour: colour.name }) &&
      (await breakdown()).startsWith(smart(fillLine(deckLine(settings.deck, "whats_in"), { name: "Full wrap" }))) &&
      flat(await priceScreen.getByTestId("price-choose").innerText()) === fillLine(deckLine(settings.deck, "choose"), { name: "Full wrap" }) &&
      (await priceScreen.getByTestId("price-choose").getAttribute("aria-pressed")) === "false",
    flat(await priceScreen.getByTestId("price-sub").innerText().catch(() => "")),
  );
  check(
    "the breakdown, line by line: the lights at \"$X a foot\", the control box always included",
    (await breakdown()).includes(`Track and lights ${money(120 * ppf)} 120 ft at ${money(ppf)} a foot`) && (await breakdown()).includes(`Control box ${money(Number(settings.box_price))} Always included`),
    (await breakdown()).slice(0, 200),
  );
  const pageText = flat(await priceScreen.innerText());
  check("No payment until your install is complete., on the price page", pageText.includes("No payment until your install is complete."));
  check("price held until reads as a written-out date", /Price held until [A-Z][a-z]+ \d{1,2}, \d{4}\./.test(pageText));
  if (!settings.gst_enabled) check("with GST off, the price never mentions GST", !/GST/.test(pageText));
  check(
    "no note to Keenan on the customer's page: the save's state and the signal note live in the Edit layer only",
    !/Saving needs signal|Not saved yet|Save quote|apply to this quote only/.test(pageText),
  );
  check(
    "the page the customer watches holds no gold: the total is Night Text and Choose is outlined",
    await priceScreen.evaluate((root) => {
      const gold = (el) => /185, 146, 87/.test(getComputedStyle(el).color) || /185, 146, 87/.test(getComputedStyle(el).backgroundColor);
      return ![...root.querySelectorAll("*")].some((el) => el.getBoundingClientRect().width > 0 && gold(el));
    }),
  );
  await page.screenshot({ path: `${out}/m5-price.png` });

  // Upper access follows the areas: an upper area, then an upper gable, then
  // both taken off again (a line cleared comes off the house on blur).
  const setArea = async (label, feet) => {
    await editButton.click();
    await editLayer.waitFor({ timeout: 5000 }).catch(() => {});
    const box = editLayer.getByLabel(label, { exact: true });
    await box.fill(feet);
    await box.press("Tab");
    await page.waitForTimeout(300);
    await editLayer.getByTestId("quote-edit-done").click();
    await editLayer.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  };
  check("no upper area, no upper access line", !(await breakdown()).includes("Upper roof access"));
  await setArea("Front upper feet", "30");
  const withUpper = await breakdown();
  await setArea("Front upper gable feet", "8");
  const withGable = await breakdown();
  check(
    "an upper run adds upper access, and an upper gable the gable amount instead, with its reason",
    (upperAmount > 0 ? withUpper.includes("Upper roof access") && withUpper.includes(money(upperAmount)) : true) &&
      (gableAmount > 0 ? withGable.includes(money(gableAmount)) && withGable.includes("For work up high") : true) &&
      withGable.split("Upper roof access").length === 2,
    `${withUpper.slice(0, 160)} | ${withGable.slice(0, 160)}`,
  );
  await setArea("Front upper gable feet", "");
  await setArea("Front upper feet", "");
  check("back to the lower front alone, the line goes and the total is as before", !(await breakdown()).includes("Upper roof access") && (await priceTotal()).includes(tight(money(priced()))));

  // ---------------------------------------------------------------- a reload mid-meeting
  await page.reload();
  await dots(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
  check(
    "a reload picks up on the same screen, with the quote as typed",
    (await currentScreen(page)) === PRICE &&
      tight(await page.getByRole("region", { name: PRICE }).getByTestId("price-option").first().innerText().catch(() => "")).includes(tight(wanted)),
    await currentScreen(page),
  );

  // ---------------------------------------------------------------- an edge swipe back stays in the deck
  await page.goBack().catch(() => {});
  await page.waitForTimeout(800);
  check(
    "going back (an edge swipe) stays in the deck, on the same page",
    page.url().split("#")[0] === `${base}/meeting/${leadId}` && (await currentScreen(page)) === PRICE,
    page.url(),
  );

  // ---------------------------------------------------------------- #quote opens on the price page (prep's Draft the quote)
  // From another page each time, so each is a full load that reads its hash.
  await page.goto(`${base}/app/leads/${leadId}`);
  await settle(page);
  await page.goto(`${base}/meeting/${leadId}#start`);
  await dots(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  const fromStart = await currentScreen(page);
  await page.goto(`${base}/app/leads/${leadId}`);
  await settle(page);
  await page.goto(`${base}/meeting/${leadId}#quote`);
  await dots(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  check("#start opens at the cover, #quote on the price page", fromStart === "Vesper" && (await currentScreen(page)) === PRICE, `${fromStart}, ${await currentScreen(page)}`);

  // ---------------------------------------------------------------- the layout check, at 1180 x 820 and 1366 x 1024
  // Every page and every layer it opens, measured as it stands (nothing is
  // typed or saved). The X's place and size are checked here too.
  for (const size of LAYOUT_SIZES) {
    const at = `${size.width}x${size.height}`;
    const lp = await ownerContext.newPage();
    await lp.setViewportSize(size);
    await lp.goto(`${base}/meeting/${leadId}#start`);
    await dots(lp).waitFor({ timeout: 30000 });
    await lp.waitForTimeout(600);
    const exitBox = await lp.getByRole("button", { name: "Hold to leave meeting mode" }).boundingBox();
    check(
      `${at}: the exit is 48 px, 20 px in from the top and left`,
      exitBox && Math.round(exitBox.x) === 20 && Math.round(exitBox.y) === 20 && Math.round(exitBox.width) === 48,
      JSON.stringify(exitBox),
    );
    const found = [];
    let layers = 0;
    for (const label of expected) {
      await goToScreen(lp, label);
      await lp.waitForTimeout(500);
      const onPage = await lp.evaluate(measureDeck);
      found.push(...onPage.problems.map((problem) => `${label}: ${problem}`));
      if (label === COLOUR) {
        const initials = await lp.locator("#colour-initials").boundingBox();
        const foot = Math.round((initials?.y ?? 0) + (initials?.height ?? 0));
        if (size.height === 820 && !(initials && foot <= 400)) found.push(`${COLOUR}: the initials end at ${foot}, below 400 px`);
        if (size.height === 1024 && !(initials && foot <= Math.ceil(0.55 * size.height))) found.push(`${COLOUR}: the initials end at ${foot}, below 55% of the height`);
      }
      if (label === PRICE) {
        // Choose and the total stay above the bottom row (the dots, the
        // chevrons and the Next label), and Edit keeps clear of Choose.
        const boxes = await lp.evaluate(() => {
          const rect = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
          };
          const section = document.querySelector('section[data-page="quote"]');
          const nav = document.querySelector('[data-deck-row="nav"]');
          return {
            choose: rect(section?.querySelector('[data-testid="price-choose"]')),
            total: rect(section?.querySelector('[data-testid="price-option"]')),
            edit: rect(section?.querySelector('[data-testid="price-edit"]')),
            row: rect(nav?.querySelector("ol")),
            next: rect(nav?.querySelector('[data-testid="deck-next-label"]')),
          };
        });
        const rowTop = Math.min(boxes.row?.top ?? Infinity, boxes.next?.top ?? Infinity);
        if (!boxes.choose || boxes.choose.bottom > rowTop + 0.5) found.push(`${PRICE}: Choose ends at ${Math.round(boxes.choose?.bottom ?? 0)}, below the bottom row's top (${Math.round(rowTop)})`);
        if (!boxes.total || boxes.total.bottom > rowTop + 0.5) found.push(`${PRICE}: the total runs into the bottom row`);
        if (boxes.edit && boxes.choose && boxes.edit.right > boxes.choose.left - 24) found.push(`${PRICE}: Edit sits near Choose`);
      }
      const openers = await lp.getByRole("region", { name: label }).locator('button[aria-haspopup="dialog"]').all();
      for (const opener of openers) {
        const name = (await opener.innerText()).trim();
        await opener.click();
        await lp.locator("[data-deck-layer]").waitFor({ timeout: 5000 }).catch(() => {});
        await lp.waitForTimeout(400);
        if (label === COLOUR) {
          // Custom shows the colour number (a tap, nothing saved): measured with it.
          const chooser = lp.locator("[data-deck-layer]");
          await chooser.locator("label").filter({ hasText: /^Custom$/ }).click();
          await lp.waitForTimeout(200);
          if (size.height === 820) {
            for (const [what, box] of [
              ["the colour number", await chooser.locator("#lead-track-ral").boundingBox()],
              ["Save", await chooser.getByRole("button", { name: "Save track colour" }).boundingBox()],
            ]) {
              const foot = Math.round((box?.y ?? 0) + (box?.height ?? 0));
              if (!box || foot > 400) found.push(`${COLOUR} > ${name}: ${what} ends at ${foot}, below 400 px`);
            }
          }
        }
        const inLayer = await lp.evaluate(measureDeck);
        found.push(...inLayer.problems.map((problem) => `${label} > ${name}: ${problem}`));
        if (!inLayer.info.layer) found.push(`${label} > ${name}: no layer opened`);
        layers += 1;
        await lp.keyboard.press("Escape");
        await lp.waitForTimeout(400);
        if ((await lp.locator("[data-deck-layer]").count()) > 0) {
          // Back closes a page's layer; Done closes Keenan's Edit layer (never Save).
          await lp.locator("[data-deck-layer]").getByRole("button", { name: /^(Back|Done)$/ }).last().click();
          await lp.waitForTimeout(400);
        }
      }
    }
    check(
      `${at}: every page and every layer (${expected.length} pages, ${layers} layers) fits with nothing scrolled, nothing in the bottom row's way, and nothing under the exit or the chevrons`,
      found.length === 0,
      found.slice(0, 8).join("; "),
    );
    await lp.screenshot({ path: `${out}/m5-layout-${at}.png` });
    await lp.close();
  }

  // ---------------------------------------------------------------- the way out: hold the X for 600 ms
  const exit = page.getByRole("button", { name: "Hold to leave meeting mode" });
  const xb = await exit.boundingBox();
  await page.mouse.move(xb.x + xb.width / 2, xb.y + xb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const stillIn = page.url().split("#")[0] === `${base}/meeting/${leadId}` && (await dots(page).count()) === 1;
  // A hand gripping the corner: the finger drifts more than 10 px.
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(xb.x + xb.width / 2 + 12, xb.y + xb.height / 2 + 12);
  await page.waitForTimeout(700);
  await page.mouse.up();
  const driftStays = page.url().split("#")[0] === `${base}/meeting/${leadId}` && (await dots(page).count()) === 1;
  check("a press that drifts more than 10 px is a grip, not a hold: it stays in the deck", driftStays);
  await page.mouse.move(xb.x + xb.width / 2, xb.y + xb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await page.waitForURL(`**/app/leads/${leadId}`, { timeout: 30000 }).catch(() => {});
  check(
    "a short press on the X stays in the deck; holding it leaves for the lead page",
    stillIn && page.url().endsWith(`/app/leads/${leadId}`),
    page.url(),
  );

  // ---------------------------------------------------------------- weak signal, on a server of its own
  offlineServer = spawn("npx", ["next", "start", "--port", String(offlinePort)], { detached: true, stdio: "ignore", env: process.env });
  for (let i = 0; i < 60 && !(await serverAnswers(offlineBase)); i += 1) await sleep(1000);
  // The same one-time owner session on the second server's origin. Run
  // against the deployed site, the cookies belong to its domain; locally,
  // this just repeats them for localhost.
  const sessionCookies = await ownerContext.cookies(base);
  await ownerContext.addCookies(sessionCookies.map(({ name, value }) => ({ name, value, url: offlineBase })));
  const signal = await ownerContext.newPage();
  await signal.goto(`${offlineBase}/app/leads/${leadId}`);
  await settle(signal);
  const controlled = await signal
    .waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check("the service worker takes the page in a production build", controlled);
  await Promise.all([
    signal.waitForResponse((r) => r.url().split("#")[0] === `${offlineBase}/meeting/${leadId}` && r.request().resourceType() === "document", { timeout: 30000 }),
    signal.getByTestId("mockup-card").getByRole("link", { name: "Open meeting mode" }).click(),
  ]);
  await dots(signal).waitFor({ timeout: 30000 });
  // Only the page on screen and its neighbours mount their pictures, so the
  // mockup loads (and is kept) once its page is reached.
  await goToScreen(signal, MOCKUP);
  await signal
    .waitForFunction(() => {
      const img = document.querySelector('section[data-page="what_vesper_is"] img');
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }, null, { timeout: 30000 })
    .catch(() => {});
  await signal.waitForTimeout(1000);
  const kept = await signal.evaluate(async () => {
    const pagesKept = await (await caches.open("vesper-pages-v1")).keys();
    const photosKept = await (await caches.open("vesper-images-v1")).keys();
    return { pages: pagesKept.map((r) => r.url), photos: photosKept.map((r) => r.url) };
  });
  check(
    "opened once with signal, the iPad keeps the meeting page and the mockup",
    kept.pages.some((kept) => kept.split("#")[0] === `${offlineBase}/meeting/${leadId}`) && kept.photos.some((photo) => photo.includes(mockupPath)),
    `${kept.pages.length} pages, ${kept.photos.length} photos`,
  );
  try {
    process.kill(-offlineServer.pid, "SIGTERM");
  } catch {}
  for (let i = 0; i < 30 && (await serverAnswers(offlineBase)); i += 1) await sleep(500);
  const gone = !(await serverAnswers(offlineBase));
  await signal.reload().catch(() => {});
  await dots(signal).waitFor({ timeout: 30000 }).catch(() => {});
  const offlineMockup = await signal
    .waitForFunction(() => {
      const img = document.querySelector('section[data-page="what_vesper_is"] img');
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }, null, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(
    "with the server gone, a reload still opens meeting mode on the page it was on, mockup and all",
    gone && (await dots(signal).count()) === 1 && offlineMockup,
    gone ? "" : "the second server did not stop",
  );
  await signal.screenshot({ path: `${out}/m5-offline-reload.png` });
  await signal.close();
  offlineServer = null;

  // ---------------------------------------------------------------- View as a setter, and the setter themselves
  await page.goto(`${base}/app/admin/people`);
  await settle(page);
  await page.locator("tr", { hasText: setter.email }).getByRole("button", { name: "View as" }).click();
  await page.waitForURL("**/app", { timeout: 30000 });
  await settle(page);
  await page.goto(`${base}/meeting/${leadId}`);
  await settle(page);
  check(
    "View as a setter never opens meeting mode",
    (await page.getByText("Not for your role").count()) === 1 && (await dots(page).count()) === 0,
  );
  await page.goto(`${base}/app`);
  await settle(page);
  await page.getByRole("status").filter({ hasText: "Viewing as" }).getByRole("button", { name: "Exit" }).click();
  await page.waitForURL("**/app/admin/people", { timeout: 20000 });

  const setterContext = await browser.newContext(phone);
  const setterPage = await setterContext.newPage();
  await signIn(setterPage, setter);
  await setterPage.goto(`${base}/meeting/${leadId}`);
  await settle(setterPage);
  check(
    "a setter who opens a meeting address gets Not for your role",
    (await setterPage.getByText("Not for your role").count()) === 1 && (await dots(setterPage).count()) === 0,
  );
  await setterPage.goto(`${base}/app/leads/${leadId}`);
  await settle(setterPage);
  check(
    "a setter's lead page has no meeting mode and no mockup upload",
    (await setterPage.getByTestId("mockup-card").count()) === 0 && (await setterPage.getByRole("link", { name: /meeting mode/i }).count()) === 0,
  );
  await setterContext.close();

  // ---------------------------------------------------------------- nothing was written as Keenan
  await ownerSession.close();
  ownerSession = null;
  const after = await ownerFootprint(ownerId);
  check("nothing of the owner's changed: profile, settings, colours, leads, timeline and quotes", before === after);
  const { count: quotes } = await admin.from("quotes").select("id", { count: "exact", head: true }).eq("lead_id", leadId);
  const { data: leadAfter } = await admin.from("leads").select("track_colour_initials").eq("id", leadId).single();
  const { count: confirmations } = await admin
    .from("lead_events")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("type", "colour_confirmed");
  check("the owner's session saved no quote and no initials", quotes === 0 && leadAfter?.track_colour_initials === null && confirmations === 0);
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)}${page ? ` at ${page.url()}` : ""}`);
  if (page) await page.screenshot({ path: `${out}/m5-failure.png` }).catch(() => {});
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
    if (leadIds.length > 0) await admin.from("quotes").delete().in("lead_id", leadIds);
    // lead_mockups has no cascade: its rows go before the leads.
    if (leadIds.length > 0) await admin.from("lead_mockups").delete().in("lead_id", leadIds);
    await admin.from("leads").delete().eq("created_by", setter.id);
    const { data: files } = await admin.storage.from(BUCKET).list(setter.id, { limit: 1000 });
    if (files && files.length > 0) await admin.storage.from(BUCKET).remove(files.map((file) => `${setter.id}/${file.name}`));
    await admin.auth.admin.deleteUser(setter.id);
  }
  const emails = await accountEmails();
  const leftoverUsers = emails.filter((email) => email.startsWith("m5-live-"));
  const { count: leftoverLeads } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("first_name", TEST_LEAD);
  check("the throwaway setter, the test lead and its mockup are gone", leftoverUsers.length === 0 && leftoverLeads === 0, `${leftoverUsers.length} accounts, ${leftoverLeads} test leads left`);
  results.push(`accounts remaining: ${JSON.stringify(emails)}`);
  await browser.close();
}

console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
