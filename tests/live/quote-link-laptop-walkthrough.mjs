// The customer's quote link on a laptop (Keenan, 2026-11-12). Stages one
// marked test lead (TEST LEAD (laptop)) with a quote of three options (one
// area on J track), a Main mockup, a Christmas look and an option's own
// picture, a document for this customer and, when it can be offered safely,
// the agreement to sign. Then, as the customer:
// - at 1280, 1440 and 1920 wide and on an iPad in landscape: the picture
//   with its Looks and Options beside the offers and the price, a reading
//   width for the text, nothing edge to edge, no sideways scroll, pictures
//   shown no bigger than they are;
// - with a mouse and keyboard: full screen opens with a click and closes
//   with Esc or a click, double-click and the wheel zoom; Build your own,
//   the documents, Book my install and the agreement work from the
//   keyboard, and the signature is drawn with the mouse;
// - scrolled top to bottom in steps at 1440 x 900 and 1280 x 800, the way
//   a customer reads it, in Chromium and in WebKit (Safari's engine) when it
//   can run here: at every step the picture covers no text, and it leaves
//   with the offers (2026-11-12: it once stayed pinned over the sections
//   below, which full-page screenshots never show because they don't scroll);
// - on a phone: the single column as before, with the finger wording.
// Round 17 (Keenan, 2026-11-12): the Christmas banner across the very top
// and Where you're at full width above the top section; the bar's middle
// naming the option on screen and its price as they pick (Build your own
// and a Black Friday price included), never on a phone; the house once on a
// phone, in See it on your house under the price; and the accepted-quote
// page at laptop size, on the lead assigned to Keenan so no commission is
// made, with the same scroll check.
// Everything staged is removed at the end; Settings' agreement text is set
// only when empty and no other lead waits on it, and put back after.
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "playwright";
import sharp from "sharp";

const base = process.env.BASE ?? "http://localhost:3400";
const out = process.env.OUT ?? "test-results/live";
const tag = process.env.TAG ?? "link-laptop";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, noSession);
const stamp = Date.now().toString(36);
const FIRST = "TEST LEAD (laptop)";
const results = [];
const say = (text) => { results.push(text); console.log(text); };
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  say(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` [${detail}]` : ""}`);
};
const flat = (t) => (t ?? "").replace(/\s+/g, " ").trim();

const setter = { email: `laptop-${stamp}@example.com`, password: `laptop-cedar-${stamp}-4821`, name: "TEST Laptop Setter", id: null };
const DOCS = "link-documents";
const PHOTOS = "lead-photos";
const TEST_AGREEMENT = "TEST agreement text (automated check, removed right after).\n\nBy signing you agree to the install described in your quote.";
const staged = { leadId: null, token: null, ownerId: null, agreementSet: false };

// A detailed 2400 x 1600 picture, so sharpness can be judged at laptop size.
async function picture(sky, lights) {
  const bulbs = Array.from({ length: 60 }, (_, at) => `<circle cx="${420 + at * 26}" cy="${780 - Math.abs(30 - at) * 13}" r="5" fill="${lights}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600"><rect width="2400" height="1600" fill="${sky}"/><polygon points="380,800 1200,400 2020,800" fill="#0b1720"/><rect x="480" y="800" width="1440" height="640" fill="#0f1e29"/><rect x="1080" y="1080" width="240" height="360" fill="#1d2f3b"/>${bulbs}<text x="120" y="1540" font-family="Arial" font-size="40" fill="#ffffff">TEST mockup, fine print to judge sharpness</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

function tinyPdf(text) {
  const body = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, at) => {
    offsets.push(pdf.length);
    pdf += `${at + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function stage() {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  staged.ownerId = owner.id;
  const made = await admin.auth.admin.createUser({ email: setter.email, password: setter.password, email_confirm: true, user_metadata: { full_name: setter.name }, app_metadata: { role: "sales" } });
  if (made.error) throw new Error(`createUser: ${made.error.message}`);
  setter.id = made.data.user.id;
  const lead = await admin.from("leads").insert({
    first_name: FIRST, last_name: stamp, address_line: `1 Laptop Lane SW (TEST) ${stamp}`, neighbourhood: "TEST (automated)", created_by: setter.id,
    phone: "+14035550100", owns_home: true, wants_price: true, both_decision_makers: true, christmas_lights_now: "hires", looked_into_before: "new_to_them",
    soffit_colour: "white", lat: 51.0447, lng: -114.0719, position_source: "picked",
  }).select("id").single();
  if (lead.error) throw new Error(`lead: ${lead.error.message}`);
  staged.leadId = lead.data.id;
  const { data: white } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order").limit(1).single();
  await admin.from("leads").update({ track_colour_id: white.id }).eq("id", staged.leadId);
  const runs = [
    { name: "Front", feet: 64, level: "lower", part: "eave", area: "front" },
    { name: "Front gable", feet: 18, level: "upper", part: "gable", area: "front", gable: true, track: "j", trackRate: 30 },
    { name: "Front upper", feet: 40, level: "upper", part: "eave", area: "front" },
    { name: "Back", feet: 50, level: "lower", part: "eave", area: "back" },
  ];
  const day = new Date(Date.now() - 6 * 3600_000 + 14 * 86_400_000).toISOString().slice(0, 10);
  const quote = await admin.from("quotes").insert({
    lead_id: staged.leadId, created_by: owner.id, price_per_ft: 24, box_price: 500, box_count: 1, runs, total_feet: 172, adders: [], discounts: [], gst_rate: 0.05, gst_enabled: false,
    min_job_total: null, subtotal: 0, total: 0, colour_timing: "stock", upper_access_fee: 200, upper_gable_access_fee: 400, track_colour_name: white.name, valid_until: day,
    offers: [
      { id: "full", name: "Full wrap", runs: [0, 1, 2, 3] },
      { id: "front", name: "Full front", runs: [0, 1, 2] },
      { id: "lower", name: "Front lower only", runs: [0] },
    ],
  }).select("id").single();
  if (quote.error) throw new Error(`quote: ${quote.error.message}`);
  const rows = [];
  for (const [name, sky, lights, extra] of [
    ["Warm white", "#132e3f", "#f4e3b5", { is_main: true, position: 0 }],
    ["Christmas", "#10283a", "#d83a3a", { is_scene: true, position: 1 }],
    ["Full front", "#16344a", "#f4e3b5", { offer_ids: ["front"], position: 2 }],
  ]) {
    const path = `${owner.id}/${randomUUID()}.jpg`;
    const up = await admin.storage.from(PHOTOS).upload(path, await picture(sky, lights), { contentType: "image/jpeg" });
    if (up.error) throw new Error(`mockup: ${up.error.message}`);
    rows.push({ lead_id: staged.leadId, storage_path: path, name, created_by: owner.id, is_main: false, is_scene: false, offer_ids: [], ...extra });
  }
  const mockups = await admin.from("lead_mockups").insert(rows);
  if (mockups.error) throw new Error(`mockups: ${mockups.error.message}`);
  const uploadPath = `leads/${staged.leadId}/${randomUUID()}.pdf`;
  await admin.storage.from(DOCS).upload(uploadPath, tinyPdf("TEST site plan"), { contentType: "application/pdf" });
  const own = await admin.from("lead_link_documents").insert({ lead_id: staged.leadId, name: "TEST Your site plan", storage_path: uploadPath, content_type: "application/pdf", size_bytes: 600, created_by: owner.id });
  if (own.error) throw new Error(`document: ${own.error.message}`);
  const issued = await admin.rpc("issue_quote_link", { p_lead_id: staged.leadId });
  if (issued.error) throw new Error(`link: ${issued.error.message}`);
  staged.token = issued.data;
  // Book my install and signing notices go to the test setter (no devices), never Keenan.
  await admin.from("quote_links").update({ created_by: setter.id }).eq("lead_id", staged.leadId);
}

// The agreement: Keenan's own text if written; otherwise a marked test text
// only while no other lead has Agreement to sign on.
async function offerAgreement() {
  const { data: settings } = await admin.from("settings").select("agreement_text").eq("id", 1).single();
  if (!settings?.agreement_text?.trim()) {
    const { count } = await admin.from("lead_link_options").select("lead_id", { count: "exact", head: true }).eq("agreement_to_sign", true);
    if ((count ?? 0) > 0) return false;
    const set = await admin.from("settings").update({ agreement_text: TEST_AGREEMENT }).eq("id", 1);
    if (set.error) throw new Error(`agreement text: ${set.error.message}`);
    staged.agreementSet = true;
  }
  const tick = await admin.from("lead_link_options").insert({ lead_id: staged.leadId, agreement_to_sign: true, updated_by: staged.ownerId });
  if (tick.error) throw new Error(`agreement tick: ${tick.error.message}`);
  return true;
}

async function clean() {
  const { data: leads } = await admin.from("leads").select("id").eq("last_name", stamp).eq("first_name", FIRST);
  const ids = (leads ?? []).map((l) => l.id);
  if (ids.length > 0) {
    const { data: docs } = await admin.from("lead_link_documents").select("storage_path").in("lead_id", ids);
    const files = (docs ?? []).flatMap((d) => (d.storage_path ? [d.storage_path] : []));
    const { data: mockups } = await admin.from("lead_mockups").select("storage_path").in("lead_id", ids);
    await admin.from("agreement_signatures").delete().in("lead_id", ids);
    await admin.from("lead_site_visits").delete().in("lead_id", ids);
    await admin.from("lead_link_documents").delete().in("lead_id", ids);
    await admin.from("lead_link_options").delete().in("lead_id", ids);
    if (files.length > 0) await admin.storage.from(DOCS).remove(files);
    const photos = (mockups ?? []).map((m) => m.storage_path);
    if (photos.length > 0) await admin.storage.from(PHOTOS).remove(photos);
    for (const table of ["earnings", "slot_holds", "meetings", "quote_links", "quotes", "lead_mockups", "lead_photos", "lead_events"]) await admin.from(table).delete().in("lead_id", ids);
    await admin.from("leads").delete().in("id", ids);
  }
  if (staged.agreementSet) await admin.from("settings").update({ agreement_text: null }).eq("id", 1).eq("agreement_text", TEST_AGREEMENT);
  const { data: people } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of (people?.users ?? []).filter((x) => (x.email ?? "").startsWith(`laptop-${stamp}`))) {
    await admin.from("leads").delete().eq("created_by", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
  const { data: after } = await admin.from("settings").select("agreement_text").eq("id", 1).single();
  const { count: left } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("last_name", stamp);
  const textLeft = after?.agreement_text === TEST_AGREEMENT;
  if (textLeft) failures += 1;
  say(`CLEAN ${ids.length} lead(s); left: ${left ?? 0}; Settings agreement text ${!staged.agreementSet ? "untouched" : textLeft ? "NOT PUT BACK" : "put back (empty again)"}`);
}

const box = (page, id) => page.getByTestId(id).first().boundingBox();

// The layout at one laptop size: picture beside the offers, reading widths,
// no sideways scroll, pictures never blown up.
async function layoutAt(page, name, width) {
  await page.goto(`${base}/q/${staged.token}`, { waitUntil: "networkidle" });
  await page.getByTestId("quote-live").waitFor({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const picture = await box(page, "see-it");
  const options = await box(page, "quote-options");
  const head = await page.locator("#quote-for").boundingBox();
  check(
    `${name}: the picture with its Looks and Options sits beside the price and the offers`,
    picture && options && head && picture.x + picture.width <= options.x + 1 && Math.abs(picture.y - head.y) < 140 && options.y < picture.y + picture.height,
    picture && options ? `picture ${Math.round(picture.x)}..${Math.round(picture.x + picture.width)} from y ${Math.round(picture.y)}, offers from x ${Math.round(options.x)} y ${Math.round(options.y)}` : "missing",
  );
  const hero = await page.getByTestId("quote-mockup").isVisible().catch(() => false);
  check(`${name}: the house is shown once, not again above the page`, !hero);
  const widths = await page.evaluate(() => {
    const measure = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return Math.round(rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    return {
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      main: measure('[data-testid="quote-live"]'),
      points: measure('section[aria-labelledby="getting-laptop"]') ?? measure('section[aria-labelledby="getting"]'),
      below: (() => {
        const element = document.querySelector('[data-testid="laptop-below"]');
        if (!element) return 9999;
        const rect = element.getBoundingClientRect();
        return Math.round(Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2));
      })(),
      next: measure('[data-testid="tracker-detail"]'),
      track: measure('[data-testid="about-track"]'),
      options: measure('[data-testid="quote-options"]'),
      left: Math.round(document.getElementById("quote-for").getBoundingClientRect().left),
      right: Math.round(window.innerWidth - document.querySelector('[data-testid="option-rows"]').getBoundingClientRect().right),
    };
  });
  check(`${name}: no sideways scroll`, widths.page <= widths.viewport, `${widths.page} in ${widths.viewport}`);
  // Round 17: the banner across the whole width at the very top, then Where
  // you're at across the page's width, above the picture and the price.
  const top = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const banner = rect('[data-testid="quote-christmas"]');
    const tracker = rect('[data-testid="tracker"]');
    const grid = rect('[data-testid="laptop-top"]');
    const main = rect('[data-testid="quote-live"]');
    return {
      banner: banner ? { left: Math.round(banner.left), width: Math.round(banner.width), bottom: Math.round(banner.bottom) } : null,
      mainTop: main ? Math.round(main.top) : null,
      tracker: tracker ? { left: Math.round(tracker.left), right: Math.round(tracker.right), bottom: Math.round(tracker.bottom) } : null,
      grid: grid ? { left: Math.round(grid.left), right: Math.round(grid.right), top: Math.round(grid.top) } : null,
    };
  });
  check(
    `${name}: the Christmas banner runs the full width at the very top`,
    top.banner && top.banner.left === 0 && top.banner.width === width && top.banner.bottom <= top.mainTop + 1,
    JSON.stringify(top.banner),
  );
  check(
    `${name}: Where you're at runs the width of the page above the picture and the price`,
    top.tracker && top.grid && top.tracker.bottom <= top.grid.top + 1 && Math.abs(top.tracker.left - top.grid.left) <= 24 && Math.abs(top.tracker.right - top.grid.right) <= 24,
    JSON.stringify({ tracker: top.tracker, top: top.grid }),
  );
  check(`${name}: the page stops short of the screen's edges`, widths.main <= 1280 && widths.left >= 40 && widths.right >= 40, `page ${widths.main} px of ${width}, text from ${widths.left} px, offers end ${widths.right} px from the edge`);
  const reading = [widths.points, widths.next, widths.track].filter((w) => w !== null);
  check(`${name}: text runs at a reading width`, reading.length === 3 && reading.every((w) => w > 300 && w <= 760), `text ${reading.join(", ")} px; offers ${widths.options} px`);
  check(`${name}: below the offers, one column in the middle of the screen`, widths.below <= 2, `${widths.below} px off centre`);
  const sharp = await page.getByTestId("option-mockup").evaluate((image) => ({ natural: image.naturalWidth, shown: Math.round(image.getBoundingClientRect().width), ratio: window.devicePixelRatio }));
  check(`${name}: the picture is never shown bigger than it is`, sharp.natural >= sharp.shown * sharp.ratio, `${sharp.natural} px wide, shown at ${sharp.shown} px x${sharp.ratio}`);
  await page.screenshot({ path: `${out}/${tag}-${width}-top.png` });
  return widths;
}

// Scrolled top to bottom in steps of 40% of the window, the way a customer
// reads: at every step no text on the page sits under the picture (only the
// picture's own Looks and Options, and the bar fixed at the bottom, may
// share its space), and by the end the picture has left the screen.
async function scrollCheck(engine, launcher, [width, height], main = "quote-live") {
  const name = `${main === "quote-agreed" ? "accepted page, " : ""}${engine} ${width} x ${height}`;
  const context = await launcher.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}/q/${staged.token}`, { waitUntil: "networkidle" });
  await page.getByTestId(main).waitFor({ timeout: 30000 });
  const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const step = Math.round(height * 0.4);
  const covered = [];
  let steps = 0;
  let last = null;
  for (let y = 0; ; y += step) {
    const at = Math.min(y, total);
    await page.evaluate((to) => window.scrollTo(0, to), at);
    await page.waitForTimeout(150);
    steps += 1;
    last = await page.evaluate(() => {
      const top = document.querySelector('[data-testid="laptop-top"]') ?? document;
      const picture = top?.querySelector('[data-testid="see-it"]') ?? top?.querySelector('[data-testid="quote-mockup"]')?.closest("figure")?.parentElement;
      if (!picture) return { missing: true };
      const box = picture.getBoundingClientRect();
      const bar = document.querySelector('[data-testid="quote-bar"]');
      const hits = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.textContent.trim();
        const parent = node.parentElement;
        if (!text || !parent || picture.contains(parent) || bar?.contains(parent) || parent.closest("dialog, script, style")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= window.innerHeight) continue;
          if (r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) {
            hits.push(text.slice(0, 40));
            break;
          }
        }
      }
      return { hits, top: Math.round(box.top), bottom: Math.round(box.bottom) };
    });
    if (last.missing) break;
    if (last.hits.length > 0) covered.push(`at ${at} px: ${[...new Set(last.hits)].slice(0, 3).join(" / ")}`);
    if (at >= total) break;
  }
  check(`${name}: scrolled top to bottom in ${steps} steps, the picture never covers any text`, !last?.missing && covered.length === 0, last?.missing ? "no picture found" : covered.slice(0, 3).join("; "));
  check(`${name}: the picture leaves with the offers`, last && !last.missing && last.bottom <= 0, last ? `picture ends at ${last.bottom} px at the bottom of the page` : "");
  await context.close();
}

await mkdir(out, { recursive: true });
let browser = null;
let safari = null;
try {
  await stage();
  const agreementOffered = await offerAgreement();
  say(`STAGED lead ${staged.leadId}${agreementOffered ? " with the agreement" : " (agreement left off: another lead waits on Settings' text)"}`);
  browser = await chromium.launch();

  for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await layoutAt(page, `${width} wide`, width);
    if (width === 1440) {
      // The picture stays in view while they read the offers.
      // Round 17: the offer cards in the middle of the screen, as they read
      // them (each card's breakdown is closed until asked for, so the
      // offers are shorter and the picture leaves with their last line).
      await page.evaluate(() => {
        const rows = document.querySelector('[data-testid="option-rows"]').getBoundingClientRect();
        window.scrollTo(0, window.scrollY + (rows.top + rows.bottom) / 2 - window.innerHeight / 2);
      });
      await page.waitForTimeout(300);
      const kept = await box(page, "option-mockup");
      check("1440 wide: the picture stays in view while they go down the offers", kept && kept.y >= 0 && kept.y + kept.height <= 900, kept ? `top ${Math.round(kept.y)}` : "missing");
    }
    await context.close();
  }

  // The scroll check, in Chromium and in WebKit when it runs here.
  for (const size of [[1440, 900], [1280, 800]]) await scrollCheck("Chromium", browser, size);
  try {
    safari = await webkit.launch(process.env.WEBKIT_EXECUTABLE ? { executablePath: process.env.WEBKIT_EXECUTABLE } : {});
  } catch (error) {
    say(`NOTE WebKit (Safari's engine) can't run on this machine, so the scroll check ran in Chromium only: ${String(error?.message ?? error).split("\n")[0]}`);
  }
  if (safari) {
    for (const size of [[1440, 900], [1280, 800]]) await scrollCheck("WebKit", safari, size);
  }

  // 1440 x 900 as a customer sees it: the top, halfway down the offers, below the offers.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(`${base}/q/${staged.token}`, { waitUntil: "networkidle" });
    await page.getByTestId("quote-live").waitFor({ timeout: 30000 });
    await page.screenshot({ path: `${out}/${tag}-1440x900-1-top.png` });
    await page.evaluate(() => {
      const rows = document.querySelector('[data-testid="option-rows"]').getBoundingClientRect();
      const under = document.querySelector('[data-testid="quote-includes"]').getBoundingClientRect();
      window.scrollTo(0, window.scrollY + (rows.top + under.bottom) / 2 - window.innerHeight / 2);
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${tag}-1440x900-2-offers.png` });
    await page.evaluate(() => window.scrollTo(0, window.scrollY + document.querySelector('[data-testid="laptop-below"]').getBoundingClientRect().top - 120));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${tag}-1440x900-3-below.png` });
    await context.close();
  }

  // iPad, landscape: the laptop layout; portrait: one column.
  {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await layoutAt(page, "iPad landscape", 1180);
    const note = await page.getByTestId("agreement").innerText().catch(() => "");
    if (agreementOffered) check("iPad: signing still says finger", /with your finger/.test(note));
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForTimeout(300);
    const options = await box(page, "quote-options");
    const picture = await box(page, "see-it");
    check("iPad portrait: one column, the picture above the offers", picture && options && options.y > picture.y + picture.height - 1);
    await page.screenshot({ path: `${out}/${tag}-ipad-portrait.png` });
    await context.close();
  }

  // Mouse and keyboard, at 1440.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}/q/${staged.token}`, { waitUntil: "networkidle" });
  await page.getByTestId("quote-live").waitFor({ timeout: 30000 });

  // A look, then full screen with the mouse.
  await page.getByTestId("see-it-look").first().click();
  check("a look clicked shows on the picture", (await page.getByTestId("option-picture").first().getAttribute("data-kind")) === "look");
  await page.getByTestId("option-mockup").click();
  const viewer = page.getByTestId("option-mockup-viewer");
  await viewer.waitFor({ state: "visible", timeout: 5000 });
  check("full screen opens with a click", await viewer.isVisible());
  check("full screen says how to zoom and close with a mouse", /double-click to zoom\. Click or press Esc to close/.test(flat(await viewer.innerText())));
  const viewerImage = viewer.locator("img");
  const scaleOf = async () => (await viewerImage.evaluate((image) => image.style.transform)).match(/scale\(([\d.]+)\)/)?.[1] ?? "1";
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(250);
  const wheeled = Number(await scaleOf());
  check("the wheel zooms in", wheeled > 1.2, `scale ${wheeled.toFixed(2)}`);
  await page.mouse.dblclick(720, 450);
  await page.waitForTimeout(250);
  check("a double-click steps back to the whole picture", Number(await scaleOf()) === 1, `scale ${await scaleOf()}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("Esc closes it", !(await viewer.isVisible()));
  check("and the picture's button has the focus again", await page.getByTestId("option-mockup").evaluate((image) => document.activeElement === image.closest("button")));
  await page.getByTestId("option-mockup").click();
  await viewer.waitFor({ state: "visible", timeout: 5000 });
  await page.mouse.click(300, 300);
  await page.waitForTimeout(600);
  check("a click on the picture closes it", !(await viewer.isVisible()));

  // An option picked by mouse in the picture's Options swaps the price.
  await page.locator('[data-testid="see-it-option"][data-offer="front"]').click();
  await page.waitForTimeout(300);
  check("an option picked beside the picture changes the price", flat(await page.getByTestId("hero-option").innerText()) === "Full front" && flat(await page.getByTestId("hero-total").innerText()).includes("$3,936"), flat(await page.getByTestId("hero-total").innerText()));
  check(
    "the middle of the bar names the option on screen and its price, and follows the pick",
    flat(await page.getByTestId("bar-summary").innerText().catch(() => "")) === "Full front, $3,936",
    flat(await page.getByTestId("bar-summary").innerText().catch(() => "")),
  );

  // Build your own from the keyboard.
  await page.getByTestId("build-row").focus();
  await page.keyboard.press("Space");
  await page.getByTestId("build-areas").waitFor({ timeout: 5000 });
  const before = flat(await page.getByTestId("hero-total").innerText());
  await page.locator('[data-testid="build-area"][data-position="0"]').focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  const after = flat(await page.getByTestId("hero-total").innerText());
  check("Build your own opens and ticks from the keyboard, and the price follows", before !== after && /\$[\d,]+/.test(after), `${before} -> ${after}`);
  check(
    "with Build your own, the bar names their own option and its price, the same as the price at the top",
    flat(await page.getByTestId("bar-summary").innerText().catch(() => "")) === `Your own option, ${after}`,
    flat(await page.getByTestId("bar-summary").innerText().catch(() => "")),
  );
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);

  // Documents: real links, reached with Tab.
  const docLinks = await page.locator('[data-testid="link-documents"] a').evaluateAll((links) => links.map((link) => ({ href: link.getAttribute("href") ?? "", tab: link.tabIndex })));
  check("the documents open and download from ordinary links a keyboard reaches", docLinks.length >= 2 && docLinks.every((link) => link.href.length > 0 && link.tab >= 0), `${docLinks.length} links`);

  // Book my install from the keyboard.
  await page.getByTestId("bar-book").focus();
  await page.keyboard.press("Enter");
  await page.getByTestId("book-confirm").waitFor({ timeout: 5000 });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Yes, book my install/ }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  const { data: link } = await admin.from("quote_links").select("booked_offer").eq("token", staged.token).single();
  check("Book my install works from the keyboard", link?.booked_offer === "customer", JSON.stringify(link));
  if (await page.getByTestId("quote-thanks").isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "See your quote again" }).click();
    await page.getByTestId("quote-live").waitFor({ timeout: 10000 });
  }

  // The agreement with a mouse and keyboard.
  if (agreementOffered) {
    const agreement = page.getByTestId("agreement");
    await agreement.scrollIntoViewIfNeeded();
    const words = flat(await agreement.innerText());
    check("on a computer the agreement says mouse or trackpad, not finger", /mouse or trackpad/.test(words) && !/finger/.test(words), words.slice(0, 120));
    await page.getByTestId("agreement-name").focus();
    await page.keyboard.type("Test Customer");
    const pad = await page.getByTestId("agreement-pad").boundingBox();
    await page.mouse.move(pad.x + 40, pad.y + pad.height / 2);
    await page.mouse.down();
    for (const [dx, dy] of [[90, -40], [150, 30], [220, -30], [300, 25], [380, -15]]) await page.mouse.move(pad.x + dx, pad.y + pad.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    await agreement.screenshot({ path: `${out}/${tag}-agreement.png` });
    await page.getByTestId("agreement-sign").focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("agreement-signed").waitFor({ timeout: 15000 }).catch(() => {});
    check("signed with a mouse and the keyboard", /Signed by Test Customer on/.test(flat(await page.getByTestId("agreement-signed").innerText().catch(() => ""))));
    const { data: signature } = await admin.from("agreement_signatures").select("signature_png").eq("lead_id", staged.leadId).maybeSingle();
    check("the signature drawn with the mouse is saved", (signature?.signature_png ?? "").startsWith("data:image/png;base64,") && signature.signature_png.length > 1500, `${signature?.signature_png?.length ?? 0} characters`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${tag}-1440-after.png`, fullPage: true });
  await context.close();

  // The phone: one column as before, the picture full width at the top, finger wording.
  {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page2 = await phone.newPage();
    await page2.goto(`${base}/q/${staged.token}`, { waitUntil: "networkidle" });
    await page2.getByTestId("quote-live").waitFor({ timeout: 30000 });
    const seeIt = await box(page2, "see-it");
    const options = await box(page2, "quote-options");
    const price = await box(page2, "quote-promises");
    const tracker = await box(page2, "tracker");
    const banner = await box(page2, "quote-christmas");
    check(
      "phone (round 17): the banner at the top, Where you're at under it, then the price, then their house once, in See it on your house",
      (await page2.getByTestId("quote-mockup").count()) === 0 &&
        banner && tracker && price && seeIt &&
        banner.y < tracker.y && tracker.y < price.y && price.y + price.height <= seeIt.y + 1,
      JSON.stringify({ banner: banner && Math.round(banner.y), tracker: tracker && Math.round(tracker.y), price: price && Math.round(price.y), seeIt: seeIt && Math.round(seeIt.y) }),
    );
    check("phone: one column, See it on your house above the offers", seeIt && options && options.y > seeIt.y + seeIt.height - 1 && Math.round(options.width) === 390);
    check("phone: the bar keeps Call, Text and Book alone, no option or price in it", !(await page2.getByTestId("bar-summary").isVisible().catch(() => false)));
    check("phone: no sideways scroll", await page2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page2.screenshot({ path: `${out}/${tag}-phone.png`, fullPage: true });
    await phone.close();
  }
  // Round 17: a Black Friday price in the bar. Keenan's iPad saves the deal
  // as one discount line on the quote; the service role stands in for it.
  {
    const { data: q } = await admin.from("quotes").select("id, discounts").eq("lead_id", staged.leadId).single();
    const deal = await admin.from("quotes").update({ discounts: [...(q.discounts ?? []), { label: "Black Friday", amount: 300 }] }).eq("id", q.id);
    if (deal.error) throw new Error(`black friday: ${deal.error.message}`);
    const bf = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const bfPage = await bf.newPage();
    await bfPage.goto(`${base}/q/${staged.token}`, { waitUntil: "networkidle" });
    await bfPage.getByTestId("quote-live").waitFor({ timeout: 30000 });
    await bfPage.locator('[data-testid="see-it-option"][data-offer="full"]').click();
    await bfPage.waitForTimeout(300);
    const heroTotal = flat(await bfPage.getByTestId("hero-total").innerText());
    const barText = flat(await bfPage.getByTestId("bar-summary").innerText().catch(() => ""));
    check(
      "with a Black Friday price on the quote, the bar names Full wrap at that price, the same as the price at the top",
      heroTotal === "$4,836" && barText === "Full wrap, $4,836",
      `${heroTotal} | ${barText}`,
    );
    await bfPage.screenshot({ path: `${out}/${tag}-1440-black-friday-bar.png` });
    await bf.close();
  }

  // Round 17: the accepted page at laptop size, on the lead assigned to
  // Keenan, so accepting it makes no commission. The service role stands
  // in for his Accepted sheet, as in the quote outcomes walk-through.
  {
    await admin.from("leads").update({ assigned_to: staged.ownerId }).eq("id", staged.leadId);
    const { data: q } = await admin.from("quotes").select("id").eq("lead_id", staged.leadId).single();
    const accepted = await admin.rpc("quote_accept_offer", { p_quote: q.id, p_offer: "full", p_install_on: null });
    if (accepted.error) throw new Error(`accept: ${accepted.error.message}`);
    const { count: earned } = await admin.from("earnings").select("id", { count: "exact", head: true }).eq("lead_id", staged.leadId);
    check("accepted on the lead assigned to Keenan: no commission is made", (earned ?? 0) === 0, `${earned ?? 0} earnings`);
    for (const [width, height] of [[1440, 900], [1280, 800]]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto(`${base}/q/${staged.token}`, { waitUntil: "networkidle" });
      await page.getByTestId("quote-agreed").waitFor({ timeout: 30000 });
      const facts = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
        const picture = rect('[data-testid="see-it"]');
        const head = rect("#quote-for");
        const tracker = rect('[data-testid="tracker"]');
        const grid = rect('[data-testid="laptop-top"]');
        const below = rect('[data-testid="laptop-below"]');
        return {
          sideways: document.documentElement.scrollWidth > window.innerWidth,
          beside: Boolean(picture && head && picture.right <= head.left + 1 && Math.abs(picture.top - head.top) < 140),
          tracker: Boolean(tracker && grid && tracker.bottom <= grid.top + 1),
          looks: [...document.querySelectorAll('[data-testid="see-it-look"]')].map((e) => e.textContent).join(),
          centred: below ? Math.round(Math.abs(below.left + below.width / 2 - window.innerWidth / 2)) : 9999,
          steps: [...document.querySelectorAll('[data-testid="tracker-step"]')].map((e) => `${e.getAttribute("data-step")}:${e.getAttribute("data-state")}`).join(" "),
          banner: Boolean(document.querySelector('[data-testid="quote-christmas"]')),
          summary: Boolean(document.querySelector('[data-testid="bar-summary"]')),
        };
      });
      check(
        `accepted page ${width} x ${height}: Where you're at full width above, their house with its Looks beside what was agreed, the rest in one centred column, no sideways scroll`,
        !facts.sideways && facts.beside && facts.tracker && facts.looks === "Christmas" && facts.centred <= 2 && facts.steps === "meeting:done choose:done visit:current install:later" && !facts.banner && !facts.summary,
        JSON.stringify(facts),
      );
      await page.screenshot({ path: `${out}/${tag}-agreed-${width}x${height}.png` });
      await context.close();
    }
    for (const size of [[1440, 900], [1280, 800]]) await scrollCheck("Chromium", browser, size, "quote-agreed");
    if (safari) for (const size of [[1440, 900], [1280, 800]]) await scrollCheck("WebKit", safari, size, "quote-agreed");
  }
} catch (error) {
  failures += 1;
  say(`SCRIPT ERROR ${error?.message ?? error}`);
} finally {
  if (safari) await safari.close().catch(() => {});
  if (browser) await browser.close();
  await clean();
  say(`DONE ${failures === 0 ? "all checks passed" : `${failures} failed`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}
