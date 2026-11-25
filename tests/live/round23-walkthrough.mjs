// Live walk-through of round 23 (Keenan, 2026-11-17): install days the
// customer picks from Keenan's calendar, against a running build.
//
// The walk-through opens three days of its own on Keenan's calendar (days he
// hasn't touched, a few days to a month out; tests/live/install-days.mjs):
// A takes one job and is already held, B takes two, C takes five. Every lead
// is a throwaway setter's TEST LEAD, and every link is the setter's, so no
// notice reaches Keenan. Everything is removed at the end.
//
//   - The customer, on a phone (390): Pick your install day shows only the
//     open days, A greyed with "Full", the first day they can pick and
//     Keenan's line under the days; they book B, see their day, and Change
//     your day opens the days again.
//   - The customer at 430: Book my install, then Pick your install day on
//     the thank-you, and they take C.
//   - Two customers at once for B's last spot: exactly one gets it, the
//     other is told someone just took it, and B never holds more than two.
//   - A laptop (1280): an accepted quote's page shows their day with Change
//     your day.
//   - Keenan (his one-time session, view only): the Installs page, a month
//     at a time on the iPad, with who's booked and the spots left; a day's
//     panel; Close this day on a day with an install asks first and lists
//     who needs moving (Keep it open is the only tap). The lead page's At a
//     glance and the link card show the day; Change opens his open days
//     (Back only). The timeline says the customer picked it on their link.
//     Settings has the three install numbers. Meeting mode's Pick a day
//     shows only open days, A as Full (no day tapped: each would save).
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { closeOpenedDays, openFreeDays } from "./install-days.mjs";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3400";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The round 23 walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const NOTE = "We'll confirm your day with you a few days before. If the weather won't allow it, we'll move you to the next good day.";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const setter = { email: `r23-live-${stamp}@example.com`, password: `maple-river-stone-${String(Date.now() % 10000).padStart(4, "0")}`, id: null };
const STREET = `Roundtwentythree${stamp}`;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const PHONE_430 = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const IPAD = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true };
const LAPTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

// The deck (and the link) may curl apostrophes; compare the words.
const squash = (text) => (text ?? "").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
const calgaryDay = (moment = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Etc/GMT+6", year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
const asDate = (day) => new Date(`${day}T12:00:00Z`);
const longDay = (day) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(asDate(day));
const shortDay = (day) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(asDate(day));
const RUNS = [{ name: "Front", feet: 60, level: "lower", part: "eave", area: "front", gable: false }];

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(200);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}
async function open(page, path) {
  await page.goto(`${base}${path}`);
  await settle(page);
}
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function shot(page, name, locator = null) {
  if (locator) await locator.screenshot({ path: `${out}/r23-${name}.png` }).catch(() => {});
  else await page.screenshot({ path: `${out}/r23-${name}.png` }).catch(() => {});
}

// ---------------------------------------------------------------- staging

let whiteId = null;
let ownerId = null;
async function makeLead(label, n) {
  const { data, error } = await admin
    .from("leads")
    .insert({ first_name: TEST_LEAD, last_name: label, address_line: `${n} ${STREET} Way SW`, neighbourhood: "TEST (automated)", created_by: setter.id, track_colour_id: whiteId })
    .select("id")
    .single();
  if (error || !data) throw new Error(`lead ${label}: ${error?.message}`);
  return data.id;
}
async function makeQuote(leadId) {
  const { data, error } = await admin
    .from("quotes")
    .insert({
      lead_id: leadId,
      created_by: ownerId,
      price_per_ft: 24,
      box_price: 500,
      box_count: 1,
      runs: RUNS,
      offers: [{ id: "front", name: "Front", runs: [0] }],
      total_feet: 60,
      adders: [],
      discounts: [],
      gst_rate: 0.05,
      gst_enabled: false,
      subtotal: 0,
      total: 0,
      valid_until: calgaryDay(new Date(Date.now() + 14 * 86_400_000)),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`quote: ${error?.message}`);
  return data.id;
}
async function customer(label, n, { booked = true } = {}) {
  const lead = await makeLead(label, n);
  const quote = await makeQuote(lead);
  const token = randomBytes(18).toString("base64url");
  const { error } = await admin
    .from("quote_links")
    .insert({ lead_id: lead, token, created_by: setter.id, ...(booked ? { booked_at: new Date().toISOString(), booked_offer: "front", booked_option: "Front" } : {}) });
  if (error) throw new Error(`link: ${error.message}`);
  return { lead, quote, token };
}
const dayOf = async (lead) => (await admin.from("leads").select("install_on").eq("id", lead).single()).data?.install_on ?? null;
const heldOn = async (day) => (await admin.from("leads").select("id", { count: "exact", head: true }).eq("install_on", day).neq("status", "lost")).count ?? 0;

async function removeEverything() {
  if (!setter.id) return;
  const { data: rows } = await admin.from("leads").select("id").eq("created_by", setter.id);
  const ids = (rows ?? []).map((row) => row.id);
  if (ids.length > 0) {
    await admin.from("earnings").delete().in("lead_id", ids);
    await admin.from("quote_links").delete().in("lead_id", ids);
    await admin.from("quotes").delete().in("lead_id", ids);
    await admin.from("lead_events").delete().in("lead_id", ids);
    await admin.from("leads").delete().in("id", ids);
  }
  await admin.from("push_subscriptions").delete().eq("profile_id", setter.id);
  await admin.auth.admin.deleteUser(setter.id);
}

// ---------------------------------------------------------------- the walk-through

let browser;
let ownerSession = null;
let days = [];
try {
  await mkdir(out, { recursive: true });
  const today = calgaryDay();
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  ownerId = owner.id;
  const { data: colours } = await admin.from("track_colours").select("id, name").eq("active", true);
  whiteId = (colours ?? []).find((colour) => /^white\b/i.test(colour.name.trim()))?.id ?? null;
  if (!whiteId) throw new Error("no active White track colour");
  const made = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "Round Twentythree Setter" },
    app_metadata: { role: "sales" },
  });
  if (made.error || !made.data.user) throw new Error(`setter: ${made.error?.message}`);
  setter.id = made.data.user.id;
  await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", setter.id);

  // Three days of the walk-through's own: A takes 1 (already held), B 2, C 5.
  days = await openFreeDays(admin, today, { from: 5, to: 35, count: 3, limits: [1, 2, 5] });
  const [dayA, dayB, dayC] = days;
  note(`test install days: A ${dayA}, B ${dayB}, C ${dayC}`);

  const holder = await makeLead("Holder", 1);
  const held = await admin.rpc("install_day_set", { p_lead: holder, p_day: dayA, p_by: "keenan" });
  if (held.error) throw new Error(`holder: ${held.error.message}`);
  const picker = await customer("Picker", 2);
  const thanker = await customer("Thanker", 3, { booked: false });
  const racers = [await customer("Racer one", 4), await customer("Racer two", 5)];
  const agreed = await customer("Agreed", 6);
  const meetingLead = await customer("Meeting", 7, { booked: false });
  {
    const set = await admin.rpc("install_day_set", { p_lead: agreed.lead, p_day: dayC, p_by: "meeting" });
    const accepted = await admin.rpc("quote_accept_offer", { p_quote: agreed.quote, p_offer: "front" });
    if (set.error || accepted.error) throw new Error(`agreed: ${set.error?.message ?? accepted.error?.message}`);
  }

  browser = await chromium.launch();

  // ---------------------------------------------------------------- the customer, on a phone: Pick your install day
  {
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    await open(page, `/q/${picker.token}`);
    const section = page.getByTestId("install-day-pick");
    await section.waitFor({ timeout: 20000 }).catch(() => {});
    await section.scrollIntoViewIfNeeded().catch(() => {});
    const heading = squash(await section.locator("h2").innerText().catch(() => ""));
    const cell = (day) => section.locator(`button[data-day="${day}"]`);
    const fullA = await cell(dayA).getAttribute("data-kind").catch(() => null);
    const fullText = squash(await cell(dayA).innerText().catch(() => ""));
    const buttons = await section.locator("button[data-day]").evaluateAll((els) => els.map((el) => el.getAttribute("data-day")));
    const { data: openRows } = await admin.from("install_days").select("day").eq("open", true).in("day", buttons.length ? buttons : ["1900-01-01"]);
    const openSet = new Set((openRows ?? []).map((row) => row.day));
    check(
      "phone: once booked, Pick your install day shows only open days, a full day greyed with Full, the first day they can pick, and Keenan's line",
      heading === "Pick your install day" &&
        fullA === "full" &&
        (await cell(dayA).isDisabled()) &&
        fullText.includes("Full") &&
        (await cell(dayB).getAttribute("data-kind")) === "open" &&
        buttons.every((day) => openSet.has(day) && day > today) &&
        squash(await section.getByTestId("install-day-earliest").innerText()).startsWith("The first day you can pick is") &&
        squash(await section.getByTestId("install-day-note").innerText()) === NOTE,
      `${heading} | A ${fullA} "${fullText}" | ${buttons.join(",")}`,
    );
    check("phone: no sideways scroll", (await sideways(page)) <= 0);
    await shot(page, "link-pick-install-day-390", section);
    await cell(dayB).click();
    const book = section.getByTestId("install-day-book");
    check("tapping a day names it on the button", squash(await book.innerText()) === `Book ${shortDay(dayB)}`, squash(await book.innerText()));
    await book.click();
    await section.getByTestId("install-day-yours").waitFor({ timeout: 20000 }).catch(() => {});
    const yours = squash(await section.getByTestId("install-day-yours").innerText().catch(() => ""));
    const message = squash(await section.getByTestId("install-day-message").innerText().catch(() => ""));
    check(
      "booking it says so and shows their day; the lead holds it",
      yours === longDay(dayB) && message === `Booked for ${longDay(dayB)}.` && (await dayOf(picker.lead)) === dayB,
      `${yours} | ${message}`,
    );
    await shot(page, "link-your-install-day-390", section);
    await section.getByTestId("install-day-change").click();
    const reopened = await section.getByTestId("install-day-grid").isVisible().catch(() => false);
    await section.getByRole("button", { name: "Keep this day" }).click();
    check("Change your day opens the days again, and Keep this day closes them", reopened && !(await section.getByTestId("install-day-grid").isVisible().catch(() => false)));
    await page.reload();
    await settle(page);
    check("back later, the link shows their day", squash(await page.getByTestId("install-day-yours").innerText().catch(() => "")) === longDay(dayB));
    const { data: events } = await admin.from("lead_events").select("type, payload").eq("lead_id", picker.lead).eq("type", "install_day_picked");
    check("the timeline records it as picked by the customer", events?.length === 1 && events[0].payload?.by === "customer" && events[0].payload?.day === dayB, JSON.stringify(events));
    await context.close();
  }

  // ---------------------------------------------------------------- at 430: Book my install, then pick the day on the thank-you
  {
    const context = await browser.newContext(PHONE_430);
    const page = await context.newPage();
    await open(page, `/q/${thanker.token}`);
    check("before booking there's no day to pick", (await page.getByTestId("install-day-pick").count()) === 0);
    await page.getByRole("button", { name: "Book my install" }).first().click();
    await page.getByTestId("book-confirm").getByRole("button", { name: "Yes, book my install" }).waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.getByTestId("book-confirm").getByRole("button", { name: "Yes, book my install" }).click();
    await page.getByTestId("quote-thanks").waitFor({ timeout: 20000 }).catch(() => {});
    const section = page.getByTestId("install-day-pick");
    await section.waitFor({ timeout: 20000 }).catch(() => {});
    check("the thank-you offers Pick your install day", squash(await section.locator("h2").innerText().catch(() => "")) === "Pick your install day");
    await section.locator(`button[data-day="${dayC}"]`).click();
    await section.getByTestId("install-day-book").click();
    await section.getByTestId("install-day-yours").waitFor({ timeout: 20000 }).catch(() => {});
    check("430: they take C from the thank-you", (await dayOf(thanker.lead)) === dayC && squash(await section.getByTestId("install-day-yours").innerText()) === longDay(dayC));
    check("430: no sideways scroll", (await sideways(page)) <= 0);
    await shot(page, "link-thanks-430");
    await context.close();
  }

  // ---------------------------------------------------------------- two customers for B's last spot
  {
    const pages = [];
    for (const racer of racers) {
      const context = await browser.newContext(PHONE);
      const page = await context.newPage();
      await open(page, `/q/${racer.token}`);
      const section = page.getByTestId("install-day-pick");
      await section.waitFor({ timeout: 20000 }).catch(() => {});
      await section.locator(`button[data-day="${dayB}"]`).click();
      pages.push({ context, page, section });
    }
    check("both see B with one spot, open", (await Promise.all(pages.map(({ section }) => section.locator(`button[data-day="${dayB}"]`).getAttribute("data-kind")))).every((kind) => kind === "open"));
    await Promise.all(pages.map(({ section }) => section.getByTestId("install-day-book").click()));
    await Promise.all(pages.map(({ section }) => section.getByTestId("install-day-message").waitFor({ timeout: 20000 }).catch(() => {})));
    const said = await Promise.all(pages.map(({ section }) => section.getByTestId("install-day-message").innerText().then(squash).catch(() => "")));
    const won = said.filter((text) => text === `Booked for ${longDay(dayB)}.`).length;
    const lost = said.filter((text) => text === "Someone just took that day. Pick another one.").length;
    check("exactly one gets the last spot; the other is told someone just took it", won === 1 && lost === 1, said.join(" | "));
    check("B never holds more than its two", (await heldOn(dayB)) === 2, String(await heldOn(dayB)));
    const loser = pages[said.findIndex((text) => text.startsWith("Someone"))];
    if (loser) {
      await loser.page.waitForTimeout(800);
      check("the one who missed it now sees B as Full", (await loser.section.locator(`button[data-day="${dayB}"]`).getAttribute("data-kind")) === "full");
    }
    for (const { context } of pages) await context.close();
  }

  // ---------------------------------------------------------------- a laptop: the accepted page
  {
    const context = await browser.newContext(LAPTOP);
    const page = await context.newPage();
    await open(page, `/q/${agreed.token}`);
    const section = page.getByTestId("install-day-pick");
    await section.waitFor({ timeout: 20000 }).catch(() => {});
    check(
      "laptop: the accepted page shows their day with Change your day",
      (await page.getByTestId("quote-agreed").count()) === 1 &&
        squash(await section.locator("h2").innerText().catch(() => "")) === "Your install day" &&
        squash(await section.getByTestId("install-day-yours").innerText().catch(() => "")) === longDay(dayC) &&
        (await section.getByTestId("install-day-change").count()) === 1,
    );
    check("laptop: no sideways scroll", (await sideways(page)) <= 0);
    await shot(page, "link-accepted-1280");
    await context.close();
  }

  // ---------------------------------------------------------------- Keenan, view only
  {
    const context = await browser.newContext(IPAD);
    ownerSession = await openOwnerSession({ url, anonKey, admin, base, context });
    const page = await context.newPage();
    const calendarBefore = JSON.stringify((await admin.from("install_days").select("*").in("day", days).order("day")).data);

    await open(page, `/app/admin/installs?m=${dayA.slice(0, 7)}`);
    const cellA = page.locator(`[data-testid="install-day"][data-day="${dayA}"]`);
    const textA = squash(await cellA.innerText().catch(() => ""));
    check(
      "Installs (iPad): a month view; A says Full with who's booked",
      (await page.getByTestId("installs-page").count()) === 1 && (await cellA.getAttribute("data-state")) === "full" && textA.includes("Full") && textA.includes(TEST_LEAD),
      textA,
    );
    if (dayB.slice(0, 7) === dayA.slice(0, 7)) {
      check("B is full too after the race", (await page.locator(`[data-testid="install-day"][data-day="${dayB}"]`).getAttribute("data-state")) === "full");
    }
    check("Installs (iPad): no sideways scroll", (await sideways(page)) <= 0);
    await shot(page, "installs-ipad");
    await cellA.click();
    const panel = page.getByTestId("install-day-panel");
    await panel.waitFor({ timeout: 5000 }).catch(() => {});
    const summary = squash(await panel.getByTestId("install-day-summary").innerText().catch(() => ""));
    const bookedLinks = await panel.getByTestId("install-day-booked").locator("a").evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    check(
      "a day's panel: open for 1 job, full, and each name opens the lead",
      summary === "Open for 1 job. Full." && bookedLinks.includes(`/app/leads/${holder}`) && (await panel.getByTestId("install-day-limit").innerText()) === "1",
      `${summary} | ${bookedLinks.join(",")}`,
    );
    await shot(page, "installs-day-panel-ipad");
    await panel.getByTestId("install-day-close").click();
    const warning = squash(await panel.getByTestId("install-day-close-warning").innerText().catch(() => ""));
    check(
      "Close this day on a day with an install asks first and says it moves no one",
      warning === "1 install is booked on this day. Closing it doesn't move anyone: move it to another day from the lead." &&
        (await panel.getByText("Needs moving").count()) === 1,
      warning,
    );
    await shot(page, "installs-close-ask-ipad");
    await panel.getByRole("button", { name: "Keep it open" }).click();
    await page.keyboard.press("Escape");

    // The Admin hub links Installs; Settings has the three numbers.
    await open(page, "/app/admin");
    check("Admin lists Installs", (await page.locator('a[href="/app/admin/installs"]').count()) === 1);
    await open(page, "/app/admin/settings");
    const { data: settings } = await admin.from("settings").select("install_jobs_per_day, install_lead_days_white, install_lead_days_colour").eq("id", 1).single();
    check(
      "Settings has the jobs a day and the two earliest days",
      (await page.inputValue('input[name="install_jobs_per_day"]')) === String(settings.install_jobs_per_day) &&
        (await page.inputValue('input[name="install_lead_days_white"]')) === String(settings.install_lead_days_white) &&
        (await page.inputValue('input[name="install_lead_days_colour"]')) === String(settings.install_lead_days_colour),
    );

    // The lead page: At a glance, the link card and the timeline.
    await open(page, `/app/leads/${picker.lead}`);
    const glance = squash(await page.getByTestId("glance-install-day").innerText().catch(() => ""));
    const card = squash(await page.getByTestId("quote-card-install-day").innerText().catch(() => ""));
    const timeline = squash(await page.locator("main").innerText());
    check(
      "the lead page: At a glance and the link card show the day; the timeline says the customer picked it on their link",
      glance === longDay(dayB) && card === `Install day: ${longDay(dayB)}` && timeline.includes(`Picked ${shortDay(dayB)} for the install on their link.`),
      `${glance} | ${card}`,
    );
    await page.getByTestId("glance-install-change").click();
    const sheet = page.getByTestId("install-day-sheet");
    await sheet.waitFor({ timeout: 5000 }).catch(() => {});
    const sheetA = await sheet.locator(`button[data-day="${dayA}"]`).getAttribute("data-kind").catch(() => null);
    const sheetB = await sheet.locator(`button[data-day="${dayB}"]`).getAttribute("aria-pressed").catch(() => null);
    check("Change opens Keenan's open days: A full, B theirs", sheetA === "full" && sheetB === "true", `${sheetA} ${sheetB}`);
    await shot(page, "lead-install-day-sheet-ipad");
    await sheet.getByRole("button", { name: "Back" }).click();

    // Meeting mode: Pick a day, looked at only.
    await page.goto(`${base}/meeting/${meetingLead.lead}#next_steps`);
    await page.waitForTimeout(2500);
    const pick = page.getByTestId("next-step-pick-day");
    if ((await pick.count()) === 0) {
      note("meeting mode had no What happens next page for the test lead; Pick a day not reached");
    } else {
      await pick.first().click();
      const picker2 = page.getByTestId("install-day-picker");
      await picker2.waitFor({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      const meetingA = await picker2.locator(`button[data-day="${dayA}"]`).getAttribute("data-kind").catch(() => null);
      const meetingC = await picker2.locator(`button[data-day="${dayC}"]`).getAttribute("data-kind").catch(() => null);
      const meetingButtons = await picker2.locator("button[data-day]").evaluateAll((els) => els.map((el) => el.getAttribute("data-day")));
      const { data: meetingOpen } = await admin.from("install_days").select("day").eq("open", true).in("day", meetingButtons.length ? meetingButtons : ["1900-01-01"]);
      const meetingSet = new Set((meetingOpen ?? []).map((row) => row.day));
      check(
        "meeting mode: Pick a day shows only open days, A as Full, with Keenan's line (no day tapped)",
        meetingA === "full" && meetingC === "open" && meetingButtons.every((day) => meetingSet.has(day)) && squash(await picker2.getByTestId("install-day-note").innerText()) === NOTE,
        `${meetingA} ${meetingC} ${meetingButtons.join(",")}`,
      );
      await shot(page, "meeting-pick-a-day-ipad");
      await page.keyboard.press("Escape");
    }

    // Other sizes for the Installs page.
    for (const [label, size] of [["phone", PHONE.viewport], ["laptop", LAPTOP.viewport]]) {
      await page.setViewportSize(size);
      await open(page, `/app/admin/installs?m=${dayA.slice(0, 7)}`);
      check(`Installs (${label}): every day of the month is there, no sideways scroll`, (await page.locator('[data-testid="install-day"]').count()) >= 28 && (await sideways(page)) <= 0);
      await shot(page, `installs-${label}`);
    }

    const calendarAfter = JSON.stringify((await admin.from("install_days").select("*").in("day", days).order("day")).data);
    check("Keenan's session changed nothing on the calendar", calendarAfter === calendarBefore);
    await ownerSession.close();
    ownerSession = null;
    await context.close();
  }
  note("Opening and closing a day and changing its number are Keenan's own taps; his session here only looks, so the database tests cover those writes");
} catch (error) {
  check("walk-through ran to the end", false, String(error?.stack ?? error).replace(/\/q\/[A-Za-z0-9_-]{16,}/g, "/q/<token>"));
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await removeEverything().catch((error) => note(`cleanup: ${error?.message}`));
  await closeOpenedDays(admin, days).catch((error) => note(`install days: ${error?.message}`));
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).like("address_line", `%${STREET}%`);
  const { count: leftDays } = await admin.from("install_days").select("day", { count: "exact", head: true }).in("day", days.length ? days : ["1900-01-01"]);
  check("cleanup left no test leads and none of the walk-through's days", (count ?? 0) === 0 && (leftDays ?? 0) === 0);
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`${results.filter((line) => line.startsWith("PASS")).length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
