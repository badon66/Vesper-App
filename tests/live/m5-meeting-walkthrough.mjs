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
// own port: meeting mode is opened there once with signal, that server is
// stopped, and the page is reloaded with nothing left to answer it.
//
// The presentation photos are Keenan's own and are never staged here. The
// day and night page and the gallery are checked when he has uploaded
// them, and named as not reached when he has not.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";
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
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

// The page names Settings starts from, and the order the deck shows them in.
const PAGE_ORDER = ["what_vesper_is", "hidden_by_day", "whites_first", "install_day", "warranty", "gallery"];
const PAGE_LABELS = {
  what_vesper_is: "What Vesper is",
  hidden_by_day: "Hidden by day",
  whites_first: "The whites first",
  install_day: "How install day works",
  warranty: "The warranty",
  gallery: "Gallery",
};

// The same rule as lib/presentation.ts: a page with nothing in it is
// skipped, never shown empty.
function presentationPages(settings) {
  const raw = Array.isArray(settings.presentation) ? settings.presentation : [];
  const byKind = new Map(raw.filter((p) => p && typeof p.kind === "string").map((p) => [p.kind, p]));
  return PAGE_ORDER.map((kind) => {
    const entry = byKind.get(kind) ?? {};
    const images = Array.isArray(entry.image_paths) ? entry.image_paths.filter((path) => typeof path === "string") : [];
    const body = typeof entry.body === "string" ? entry.body : "";
    const shows =
      kind === "hidden_by_day"
        ? Boolean(images[0]) && Boolean(images[1])
        : kind === "gallery"
          ? images.some(Boolean)
          : kind === "warranty"
            ? settings.warranty_text.trim() !== ""
            : body.trim() !== "";
    return { kind, title: typeof entry.title === "string" ? entry.title : PAGE_LABELS[kind], images: images.filter(Boolean), shows };
  });
}

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

  const { data: ownerRow } = await admin.from("profiles").select("id").eq("role", "owner").single();
  const ownerId = ownerRow.id;
  const { data: settings } = await admin
    .from("settings")
    .select("presentation, warranty_text, price_per_ft, box_price, gst_enabled")
    .eq("id", 1)
    .single();
  const { data: colour } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order").limit(1).single();

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({ first_name: TEST_LEAD, address_line: "1 Test Crescent SW", created_by: setter.id, soffit_colour: "off_white" })
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
  const mockupRow = await admin.from("lead_photos").insert({ lead_id: leadId, storage_path: mockupPath, slot: "mockup" });
  if (mockupRow.error) throw new Error(`mockup row: ${mockupRow.error.message}`);

  const pages = presentationPages(settings);
  const expected = ["Vesper", ...pages.filter((p) => p.shows).map((p) => p.title), "This house", "The colour", "The price"];
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
    "the deck shows the pages that have something in them, then This house, The colour and The price",
    JSON.stringify(labels) === JSON.stringify(expected),
    labels.join(" | "),
  );
  check("meeting mode is full screen, with no tabs and no side rail", (await page.locator('nav[aria-label="Tabs"]').count()) === 0);
  check("it opens on the cover, with the address", (await currentScreen(page)) === "Vesper" && (await page.getByRole("region", { name: "Vesper" }).innerText()).includes("1 Test Crescent SW"));
  const deckText = await page.locator("body").innerText();
  check(
    "nothing internal anywhere in the deck: no setter, no status, no pipeline",
    !deckText.includes(setter.name) && !deckText.includes(setter.email) && !/meeting_booked|Follow up|Qualified|Pipeline/i.test(deckText),
  );
  const sectionsEmpty = await page.locator('section[aria-label]').evaluateAll((sections) =>
    sections.filter((s) => s.innerText.trim() === "" && s.querySelectorAll("img").length === 0).map((s) => s.getAttribute("aria-label")),
  );
  check("no screen is empty", sectionsEmpty.length === 0, sectionsEmpty.join(", "));
  await page.screenshot({ path: `${out}/m5-cover.png` });
  const cdp = await ownerContext.newCDPSession(page);
  await touchSwipe(page, cdp, 900, 500, -700);
  check("a swipe on the cover turns to the next page", (await currentScreen(page)) === expected[1], await currentScreen(page));

  // ---------------------------------------------------------------- the day and night page and the gallery, when Keenan has photos
  const dayNight = pages.find((p) => p.kind === "hidden_by_day");
  if (dayNight?.shows) {
    await goToScreen(page, dayNight.title);
    const region = page.getByRole("region", { name: dayNight.title });
    const night = region.locator('img[alt="The same house at night, lights on"]');
    const before50 = await night.evaluate((img) => img.style.clipPath);
    const box = await region.boundingBox();
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.7);
    await page.waitForTimeout(200);
    const after20 = await night.evaluate((img) => img.style.clipPath);
    check("a tap on the day and night photo moves the line there", before50 !== after20 && after20.includes("80%"), `${before50} to ${after20}`);
    const handle = await region.locator("div.cursor-ew-resize").boundingBox();
    await touchSwipe(page, cdp, Math.round(handle.x + handle.width / 2), Math.round(box.y + box.height * 0.5), 400);
    const dragged = await night.evaluate((img) => img.style.clipPath);
    check(
      "dragging the handle moves the line and keeps the page",
      dragged !== after20 && (await currentScreen(page)) === dayNight.title,
      `${after20} to ${dragged}`,
    );
    await touchSwipe(page, cdp, Math.round(box.x + box.width * 0.9), Math.round(box.y + box.height * 0.65), -700);
    check("a swipe away from the handle turns the page", (await currentScreen(page)) !== dayNight.title, await currentScreen(page));
  } else {
    note("the day and night page was not reached: its two photos are not uploaded yet, so the deck skips it");
  }
  const gallery = pages.find((p) => p.kind === "gallery");
  if (gallery?.shows) {
    await goToScreen(page, gallery.title);
    const shown = await page.getByRole("region", { name: gallery.title }).locator("img").count();
    check("the gallery shows every uploaded install photo", shown === gallery.images.length, `${shown} of ${gallery.images.length}`);
  } else {
    note("the gallery was not reached: no install photos are uploaded yet, so the deck skips it");
  }

  // ---------------------------------------------------------------- This house
  await goToScreen(page, "This house");
  const house = page.getByRole("region", { name: "This house" });
  const mockupLoaded = await house.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0);
  check("This house shows the customer's mockup", mockupLoaded);
  const hb = await house.boundingBox();
  await touchSwipe(page, cdp, Math.round(hb.x + hb.width * 0.8), Math.round(hb.y + hb.height * 0.6), -700);
  check("a one-finger swipe on the mockup turns the page, like everywhere else", (await currentScreen(page)) === "The colour", await currentScreen(page));
  await cdp.detach();

  // ---------------------------------------------------------------- The colour
  await goToScreen(page, "The colour");
  const colourScreen = page.getByRole("region", { name: "The colour" });
  const colourText = await colourScreen.innerText();
  check("The colour shows their soffit answer and the track colour by name", colourText.includes("Off-white or cream") && colourText.includes(colour.name), colour.name);
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
  const saveColour = chooser.getByRole("button", { name: "Save track colour" });
  await chooser.locator("label").filter({ has: page.getByText(colour.name, { exact: true }) }).click();
  check("tapping the chosen colour to agree with it can never save no colour", await saveColour.isDisabled());
  await chooser.locator("label").filter({ hasText: /^Custom$/ }).click();
  await chooser.locator("#lead-track-ral").fill("12");
  await chooser.getByRole("button", { name: "Save track colour" }).click();
  await chooser.locator("#lead-track-ral-error").waitFor({ timeout: 20000 }).catch(() => {});
  const { data: colourAfter } = await admin.from("leads").select("track_colour_id, track_ral_code").eq("id", leadId).single();
  check(
    "a RAL number that is not four digits is refused there, and nothing is saved",
    (await chooser.locator("#lead-track-ral-error").count()) === 1 && colourAfter?.track_colour_id === colour.id && colourAfter?.track_ral_code === null,
  );
  await chooser.getByRole("button", { name: "Back" }).click();
  check("Back closes the chooser and keeps the colour", (await chooser.count()) === 0 && (await colourScreen.getByTestId("deck-track-colour").innerText()).includes(colour.name));

  // ---------------------------------------------------------------- The price
  await goToScreen(page, "The price");
  const priceScreen = page.getByRole("region", { name: "The price" });
  const save = priceScreen.getByRole("button", { name: /^Save/ });
  check("Save waits until there are feet to price", await save.isDisabled());
  check(
    "a fresh quote shows no price until something is measured",
    (await priceScreen.getByTestId("quote-waiting").count()) === 1 && (await priceScreen.getByTestId("quote-total").count()) === 0,
  );
  await priceScreen.getByLabel("Run 1 feet").fill("120");
  await page.waitForTimeout(300);
  const subtotal = 120 * Number(settings.price_per_ft) + Number(settings.box_price);
  const wanted = settings.gst_enabled ? `${money(subtotal)} + GST` : money(subtotal);
  const total = (await priceScreen.getByTestId("quote-total").innerText()).trim();
  check("the total moves as Keenan types, priced from Settings", total === wanted, `${total}, expected ${wanted}`);
  check(
    "the quote says it is not saved yet, and Save is ready (never tapped here)",
    (await priceScreen.getByTestId("quote-unsaved").innerText()).includes("Not saved yet") && (await save.isEnabled()),
  );
  const bill = await priceScreen.getByTestId("quote-bill").innerText();
  check("No payment until your install is complete, on the bill", bill.includes("No payment until your install is complete."));
  check("valid until reads as a written-out date", /Valid until [A-Z][a-z]+ \d{1,2}, \d{4}\./.test(bill));
  if (!settings.gst_enabled) check("with GST off, the price never mentions GST", !/GST/.test(await priceScreen.innerText()));
  check("no note to Keenan on the customer's screen", !(await priceScreen.innerText()).includes("apply to this quote only"));
  await priceScreen.getByLabel("Run 1 feet").press("ArrowLeft");
  await page.waitForTimeout(500);
  check("arrow keys stay with the field being typed in", (await currentScreen(page)) === "The price");
  await page.screenshot({ path: `${out}/m5-price.png` });

  // ---------------------------------------------------------------- a reload mid-meeting
  await page.reload();
  await dots(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
  check(
    "a reload picks up on the same screen, with the quote as typed",
    (await currentScreen(page)) === "The price" &&
      (await page.getByRole("region", { name: "The price" }).getByLabel("Run 1 feet").inputValue()) === "120",
    await currentScreen(page),
  );

  // ---------------------------------------------------------------- the way out takes two taps
  await page.getByRole("button", { name: "Leave meeting mode" }).click();
  await page.waitForTimeout(400);
  const stillIn = page.url().split("#")[0] === `${base}/meeting/${leadId}` && (await dots(page).count()) === 1;
  const armed = await page.getByRole("button", { name: "Tap again to leave meeting mode" }).count();
  await page.getByRole("button", { name: "Tap again to leave meeting mode" }).click();
  await page.waitForURL(`**/app/leads/${leadId}`, { timeout: 30000 }).catch(() => {});
  check(
    "one tap on the X stays in the deck and asks again; the second tap leaves for the lead page",
    stillIn && armed === 1 && page.url().endsWith(`/app/leads/${leadId}`),
    page.url(),
  );

  // ---------------------------------------------------------------- weak signal, on a server of its own
  offlineServer = spawn("npx", ["next", "start", "--port", String(offlinePort)], { detached: true, stdio: "ignore", env: process.env });
  for (let i = 0; i < 60 && !(await serverAnswers(offlineBase)); i += 1) await sleep(1000);
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
  await signal
    .waitForFunction(() => {
      const img = document.querySelector('section[aria-label="This house"] img');
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
      const img = document.querySelector('section[aria-label="This house"] img');
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }, null, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check(
    "with the server gone, a reload still opens meeting mode, mockup and all",
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
