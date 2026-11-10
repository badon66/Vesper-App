// Live walk-through of round 8, quote outcomes and setter commission (Keenan,
// 2026-11-09), against a running build. A throwaway setter's lead has a
// Qualified meeting and a quote; the service role stands in for Keenan's
// taps (Accepted with a planned install day, then Installed, then Mark
// paid), and for a quote Declined for price and a sale Accepted and then
// Cancelled for timing. Round 9: the sale's quote has two options, Full
// wrap and Main floor; the customer chose Main floor at the meeting and
// booked Full wrap on their link, so Keenan's Accepted sheet (opened and
// looked at only) asks "Which option did they say yes to?", lists both
// biggest first with their totals and commission, says where each choice
// came from, and starts on the meeting's choice with the meeting's install
// day; accepting (quote_accept_offer, the service role standing in) pays
// commission on that option's own lights and boxes. After each step the setter's Home ("How mine went")
// and My pay show the commission where it stands, in Keenan's words, and
// the lead cards read Sold, Installed, "Lost: price" and "Lost: cancelled,
// timing". A second throwaway setter sees the outcomes on the team's leads
// and never a commission or an amount. Keenan's side uses the one-time
// owner session he approved (owner-session.mjs): it only looks, never taps,
// at the outcome card on the lead page (its buttons and the commission
// line, at iPad and phone width) and at Pay (the commission coming, then
// owed), and at View as the setter: Home and My pay exactly as the setter
// sees them. Then a check that nothing of the owner's changed. The leads
// are named "TEST LEAD (automated)" and everything made here is removed at
// the end, earnings before quotes.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The quote outcomes walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const BUCKET = "lead-photos";
const VIEW_AS_COOKIE = "vesper_view_as";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const people = {
  a: { email: `outcome-live-a-${stamp}@example.com`, password: `maple-river-stone-${digits}`, name: "Outcome Test A", id: null },
  b: { email: `outcome-live-b-${stamp}@example.com`, password: `cedar-harbor-lantern-${digits}`, name: "Outcome Test B", id: null },
};
const street = (n) => `${n} Outcometest${stamp} Way SW`;
const SOLD_STREET = street(11);
const DECLINED_STREET = street(12);
const CANCELLED_STREET = street(13);

const phone = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const narrow = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const IPAD = { width: 1180, height: 820 };

// ---------------------------------------------------------------- words as the app writes them

// Calgary dates, worked out the way lib/time.ts does: Alberta has stayed on
// UTC-6 since November 1, 2026.
const calgaryZone = (moment) => (moment.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton");
const calgaryDay = (moment = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(moment), year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// "Mon, Nov 16" (formatDay), "Nov 16" (the outcome card's shortDay) and
// "Nov 16, 2026" (formatDate).
const formatDay = (day) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
const shortDay = (day) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
const formatDate = (iso) => {
  const moment = new Date(iso);
  return new Intl.DateTimeFormat("en-CA", { timeZone: calgaryZone(moment), month: "short", day: "numeric", year: "numeric" }).format(moment);
};
// Whole dollars when there are no cents ("$190"), as on Home and Keenan's
// card (lib/pricing.ts formatMoney); Pay's own style always with cents
// ("$190.00", lib/pay/earnings.ts formatMoney).
const money = (amount) => {
  const cents = Math.round(Math.abs(amount) * 100);
  const text = (cents / 100).toLocaleString("en-CA", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}$${text}`;
};
const payMoney = (amount) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount).replace("CA$", "$");

// The setter's own commission lines on Home, the only "$" Home may show.
const OWN_COMMISSION_LINE =
  /(?:Sold\. \$[\d,]+(?:\.\d{2})? commission once it's installed\.|Installed\. \$[\d,]+(?:\.\d{2})? commission to be paid\.|Paid\. \$[\d,]+(?:\.\d{2})? commission\.)/g;

// ---------------------------------------------------------------- page helpers

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}

async function open(page, path) {
  await page.goto(`${base}${path}`);
  await settle(page);
}

async function signIn(page, person) {
  await open(page, "/login");
  await page.fill("#email", person.email);
  await page.fill("#password", person.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30000 });
  await settle(page);
}

const squash = (text) => (text ?? "").replace(/\s+/g, " ").trim();
const textOf = async (locator) => squash(await locator.innerText({ timeout: 10000 }).catch(() => ""));
const mainText = (page) => textOf(page.locator("main").first());
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const leadRow = (page, id) => page.locator(`main a[href="/app/leads/${id}"]`).first();

// Every control inside `selector` at least 44 px each way.
function smallTargets(page, selector) {
  return page.evaluate((root) => {
    const offenders = [];
    for (const scope of document.querySelectorAll(root)) {
      for (const element of scope.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary')) {
        if (element.closest('[aria-hidden="true"]')) continue;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const box = element.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1) continue;
        if (box.width < 44 || box.height < 44) {
          offenders.push(`${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
        }
      }
    }
    return offenders;
  }, selector);
}

async function checkTargets(page, selector, where) {
  const small = await smallTargets(page, selector);
  check(`tap targets on ${where} are at least 44 px`, small.length === 0, small.join("; "));
}

// What a screen shows, as the View as walk-through compares it: the text of
// the screen, its controls and its pictures. data-device and data-clock
// mark what two browsers can't agree on (the phone's own answers, a clock).
function capture(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const device = [...(main?.querySelectorAll("[data-device], [data-clock]") ?? [])];
    const shown = device.map((el) => el.style.display);
    device.forEach((el) => (el.style.display = "none"));
    const text = (main?.innerText ?? "").replace(/\s+/g, " ").trim();
    device.forEach((el, i) => (el.style.display = shown[i]));
    const controls = [...(main?.querySelectorAll("button, input:not([type=hidden]), select, textarea") ?? [])]
      .filter((el) => getComputedStyle(el).display !== "none" && !el.closest("[data-device]"))
      .map((el) => [(el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.id || "").replace(/\s+/g, " ").trim(), el.matches(":disabled")]);
    const images = [...(main?.querySelectorAll("img") ?? [])].map((img) => img.getAttribute("alt") ?? "");
    return { text, controls, images };
  });
}

function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i >= a.length && i >= b.length ? "" : `at ${i}: "${a.slice(Math.max(0, i - 30), i + 50)}" vs "${b.slice(Math.max(0, i - 30), i + 50)}"`;
}

// ---------------------------------------------------------------- data helpers

async function ownerFootprint(ownerId) {
  const [profile, leads, events, settings, colours, paidBy] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).single(),
    admin.from("leads").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("lead_events").select("id").eq("actor_id", ownerId).order("id"),
    admin.from("settings").select("*").eq("id", 1).single(),
    admin.from("track_colours").select("*").order("id"),
    admin.from("earnings").select("id, status").eq("paid_by", ownerId).order("id"),
  ]);
  return JSON.stringify({ profile: profile.data, leads: leads.data, events: events.data, settings: settings.data, colours: colours.data, paidBy: paidBy.data });
}

// A's earnings and the three leads, to prove a look changes nothing.
async function testFootprint(leadIds) {
  const [earnings, leads, quotes] = await Promise.all([
    admin.from("earnings").select("id, status, payable_at, paid_at, quote_id").in("lead_id", leadIds).order("id"),
    admin.from("leads").select("id, status, updated_at, install_on").in("id", leadIds).order("id"),
    admin.from("quotes").select("id, status, updated_at").in("lead_id", leadIds).order("id"),
  ]);
  return JSON.stringify({ earnings: earnings.data, leads: leads.data, quotes: quotes.data });
}

async function insertQuote(leadId, createdBy, fields) {
  const { data, error } = await admin
    .from("quotes")
    .insert({
      lead_id: leadId,
      created_by: createdBy,
      price_per_ft: 23,
      box_price: 500,
      box_count: 1,
      gst_rate: 0.05,
      gst_enabled: false,
      valid_until: addDays(calgaryDay(), 14),
      ...fields,
    })
    .select("id")
    .single();
  if (error) throw new Error(`quote: ${error.message}`);
  return data.id;
}

// Removes everything the two throwaway setters made, in an order the
// foreign keys allow: earnings first (a booking fee names its meeting),
// then meetings, links and quotes, then leads, then the accounts.
async function cleanUp() {
  const ids = Object.values(people).map((person) => person.id).filter(Boolean);
  if (ids.length === 0) return;
  const { data: rows } = await admin.from("leads").select("id").in("created_by", ids);
  const leadIds = (rows ?? []).map((row) => row.id);
  await admin.from("earnings").delete().in("profile_id", ids);
  if (leadIds.length > 0) {
    await admin.from("earnings").delete().in("lead_id", leadIds);
    await admin.from("slot_holds").delete().in("lead_id", leadIds);
    await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
    await admin.from("meetings").delete().in("lead_id", leadIds);
    await admin.from("quote_links").delete().in("lead_id", leadIds);
    await admin.from("quotes").delete().in("lead_id", leadIds);
  }
  await admin.from("meetings").update({ rebooked_as: null }).in("host_id", ids);
  await admin.from("meetings").delete().in("host_id", ids);
  await admin.from("leads").delete().in("created_by", ids);
  await admin.from("knock_sessions").delete().in("user_id", ids);
  for (const id of ids) {
    const { data: files } = await admin.storage.from(BUCKET).list(id, { limit: 1000 });
    if (files && files.length > 0) await admin.storage.from(BUCKET).remove(files.map((file) => `${id}/${file.name}`));
    await admin.auth.admin.deleteUser(id);
  }
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
let ownerSession = null;
let page = null;
let op = null;

try {
  // ---------------------------------------------------------------- setup
  for (const person of Object.values(people)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
      user_metadata: { full_name: person.name },
      app_metadata: { role: "sales" },
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    person.id = data.user.id;
    // The first sign-in welcome has its own walk-through; this one starts after it.
    await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", person.id);
  }
  const a = people.a;
  const b = people.b;
  const { data: ownerRow } = await admin.from("profiles").select("id").eq("role", "owner").single();
  const ownerId = ownerRow.id;
  const { data: settings } = await admin.from("settings").select("commission_rate, booking_pay").eq("id", 1).single();
  const rateBasisPoints = Math.round(Number(settings.commission_rate) * 10000);
  // The commission on a base in whole cents, as the database works it out.
  const commissionOn = (baseCents) => Math.round((baseCents * rateBasisPoints) / 10000) / 100;
  const fee = Number(settings.booking_pay);
  const { data: colour } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order").limit(1).single();
  if (!colour) throw new Error("no active track colour");
  const today = calgaryDay();
  const installOn = addDays(today, 7);
  // The day the crew finished: yesterday, so no clock near midnight can
  // make it later than today in the database.
  const installedDay = addDays(today, -1);

  const addLead = async (lastName, address, extra) => {
    const { data, error } = await admin
      .from("leads")
      .insert({ first_name: TEST_LEAD, last_name: lastName, address_line: address, created_by: a.id, ...extra })
      .select("id")
      .single();
    if (error) throw new Error(`lead ${lastName}: ${error.message}`);
    return data.id;
  };
  // The sale: booked, met (a Qualified meeting a few hours ago, so the
  // booking fee is owed), with a track colour.
  const soldLead = await addLead("Sold", SOLD_STREET, { status: "meeting_booked", track_colour_id: colour.id });
  const declinedLead = await addLead("Declined", DECLINED_STREET, { status: "met" });
  const cancelledLead = await addLead("Cancelled", CANCELLED_STREET, { status: "met", track_colour_id: colour.id });
  const leadIds = [soldLead, declinedLead, cancelledLead];
  const SOLD_NAME = `${TEST_LEAD} Sold`;

  // The meeting sits on B's evenings as a stand-in host, never on Keenan's
  // board; the service role stands in for Keenan marking it Qualified.
  const heldAt = new Date(Date.now() - 3 * 3600_000);
  const { data: meeting, error: meetingError } = await admin
    .from("meetings")
    .insert({
      lead_id: soldLead,
      host_id: b.id,
      setter_id: a.id,
      booked_by: a.id,
      starts_at: heldAt.toISOString(),
      ends_at: new Date(heldAt.getTime() + 45 * 60_000).toISOString(),
      everyone_deciding_present: true,
    })
    .select("id")
    .single();
  if (meetingError) throw new Error(`meeting: ${meetingError.message}`);
  const qualified = await admin.rpc("set_meeting_outcome", { p_meeting_id: meeting.id, p_outcome: "qualified" });
  if (qualified.error) throw new Error(`outcome: ${qualified.error.message}`);
  const { data: afterMeeting } = await admin.from("leads").select("status").eq("id", soldLead).single();
  if (afterMeeting?.status !== "met") await admin.from("leads").update({ status: "met" }).eq("id", soldLead);

  // The sale's quote: two options, Full wrap (all three runs, 150 ft) and
  // Main floor (Front and Garage, 100 ft). They say yes to Main floor: 100
  // ft at $23 and one $500 control box, less a $150 neighbour discount, is
  // $2,650 of lights and boxes. The extra work lines, the rush colour, upper
  // access and a minimum above the total are all on it too, and all left
  // out of the commission.
  const SOLD_BASE_CENTS = (60 + 40) * 2300 + 50000 - 15000;
  const FULL_BASE_CENTS = (60 + 40 + 50) * 2300 + 50000 - 15000;
  const soldCommission = commissionOn(SOLD_BASE_CENTS);
  const soldQuote = await insertQuote(soldLead, a.id, {
    runs: [
      { name: "Front", feet: 60, level: "lower" },
      { name: "Garage", feet: 40, level: "lower" },
      { name: "Front upper", feet: 50, level: "upper" },
    ],
    total_feet: 150,
    adders: [
      { label: "Extra height", amount: 150, upper_only: true },
      { label: "Garage corner", amount: 75 },
    ],
    discounts: [{ label: "Neighbour discount", amount: 150 }],
    colour_timing: "rush",
    rush_fee_per_ft: 4,
    min_job_total: 9000,
    subtotal: 9000,
    total: 9000,
    offers: [
      { id: "main", name: "Main floor", runs: [0, 1] },
      { id: "full", name: "Full wrap", runs: [0, 1, 2] },
    ],
    // Chosen at the table, with a day: what the Accepted sheet starts from.
    meeting_offer: "main",
    meeting_install_on: installOn,
  });
  // The customer booked Full wrap on their link (a link made by the
  // throwaway setter, booked here by the service role).
  const bookedLink = await admin
    .from("quote_links")
    .insert({
      lead_id: soldLead,
      token: randomBytes(18).toString("base64url"),
      created_by: a.id,
      booked_at: new Date().toISOString(),
      booked_option: "Full wrap",
      booked_offer: "full",
      booked_selection: [0, 1, 2],
    })
    .select("id")
    .single();
  if (bookedLink.error) note(`the booked link could not be staged (${bookedLink.error.message}), so the sheet's "Booked on their link" line is not reached`);
  // The rush colour and upper access fees as the quote-link rework stores
  // them, where this database has those columns.
  const fees = await admin.from("quotes").update({ rush_fee: 350, upper_access_fee: 200 }).eq("id", soldQuote);
  if (fees.error) note(`the quote's rush_fee and upper_access_fee columns aren't in this database, so only the rest of the left-out parts are on the quote (${fees.error.message})`);
  // 100 ft and a box: $2,800, so its (voided) amount reads apart from the sale's.
  const CANCELLED_BASE_CENTS = 100 * 2300 + 50000;
  const cancelledCommission = commissionOn(CANCELLED_BASE_CENTS);
  const cancelledQuote = await insertQuote(cancelledLead, a.id, {
    runs: [{ name: "Front", feet: 100, level: "lower" }],
    total_feet: 100,
    subtotal: 2800,
    total: 2800,
  });
  const declinedQuote = await insertQuote(declinedLead, a.id, {
    runs: [{ name: "Front", feet: 80, level: "lower" }],
    total_feet: 80,
    subtotal: 2340,
    total: 2340,
  });

  // ---------------------------------------------------------------- Keenan's card before the answer (looks only)
  const before = await ownerFootprint(ownerId);
  const ownerContext = await browser.newContext(phone);
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  op = await ownerContext.newPage();
  await op.setViewportSize(IPAD);
  const statusMenu = (where) => where.locator("fieldset").filter({ has: where.locator("legend", { hasText: /^Status$/ }) });
  {
    const looked = await testFootprint(leadIds);
    await open(op, `/app/leads/${soldLead}`);
    const card = op.getByTestId("quote-outcome");
    check(
      "Keenan's lead page has the outcome card under the quote, with no answer yet: Accepted and Declined",
      (await card.getAttribute("data-state").catch(() => null)) === "open" &&
        squash(await op.getByTestId("outcome-accept").innerText().catch(() => "")) === "Accepted" &&
        (await op.getByTestId("outcome-decline").count()) === 1 &&
        (await op.getByTestId("outcome-installed").count()) === 0 &&
        (await op.getByTestId("outcome-undo").count()) === 0,
      await card.getAttribute("data-state").catch(() => "no card"),
    );
    check(
      "the status menu no longer offers Sold or Installed; Lost and the earlier statuses stay",
      (await statusMenu(op).count()) === 1 &&
        (await statusMenu(op).locator('input[value="sold"], input[value="installed"]').count()) === 0 &&
        (await statusMenu(op).locator('input[value="lost"]').count()) === 1,
    );
    await card.screenshot({ path: `${out}/outcome-owner-open-1180.png` }).catch(() => {});

    // The Accepted sheet, opened and looked at only (never Mark accepted).
    await op.getByTestId("outcome-accept").click();
    const sheet = op.getByTestId("outcome-accept-sheet");
    await sheet.waitFor({ timeout: 10000 }).catch(() => {});
    const optionRows = await sheet.getByTestId("outcome-option").evaluateAll((rows) =>
      rows.map((row) => ({
        offer: row.getAttribute("data-offer"),
        booked: row.getAttribute("data-booked"),
        meeting: row.getAttribute("data-meeting"),
        checked: Boolean(row.querySelector("input")?.checked),
        total: (row.querySelector('[data-testid="outcome-option-total"]')?.textContent ?? "").trim(),
        commission: (row.querySelector('[data-testid="outcome-option-commission"]')?.textContent ?? "").trim(),
      })),
    );
    const sources = (await sheet.getByTestId("outcome-choice-source").allInnerTexts()).map(squash);
    const sheetText = await textOf(sheet);
    check(
      "the Accepted sheet asks \"Which option did they say yes to?\" and lists the quote's options biggest first, each with its total and the commission it would make",
      sheetText.includes("Which option did they say yes to?") &&
        JSON.stringify(optionRows.map((row) => row.offer)) === JSON.stringify(["full", "main"]) &&
        optionRows.every((row) => /^\$[\d,]+/.test(row.total)) &&
        optionRows[0]?.commission === `${money(commissionOn(FULL_BASE_CENTS))} commission` &&
        optionRows[1]?.commission === `${money(commissionOn(SOLD_BASE_CENTS))} commission`,
      JSON.stringify(optionRows),
    );
    check(
      "it says where each choice came from, and starts on the meeting's choice (Main floor) over the one booked on the link (Full wrap)",
      JSON.stringify(sources) === JSON.stringify(["Chosen at the meeting: Main floor", "Booked on their link: Full wrap"]) &&
        optionRows.find((row) => row.meeting === "yes")?.offer === "main" &&
        optionRows.find((row) => row.booked === "yes")?.offer === "full" &&
        optionRows.find((row) => row.checked)?.offer === "main",
      `${sources.join(" | ")} ${JSON.stringify(optionRows.map((row) => [row.offer, row.checked]))}`,
    );
    check(
      "the install day starts from the day picked at the table, and the commission line names the chosen option's amount",
      (await op.getByTestId("outcome-planned-on").inputValue()) === installOn &&
        (await textOf(op.getByTestId("outcome-accept-commission"))).includes(money(commissionOn(SOLD_BASE_CENTS))),
      `${await op.getByTestId("outcome-planned-on").inputValue()} | ${await textOf(op.getByTestId("outcome-accept-commission"))}`,
    );
    await sheet.screenshot({ path: `${out}/outcome-owner-accept-sheet-1180.png` }).catch(() => {});
    await sheet.getByRole("button", { name: "Back" }).click();
    await sheet.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    check("looking at the card and the Accepted sheet wrote nothing", (await testFootprint(leadIds)) === looked);
  }

  // ---------------------------------------------------------------- Keenan's taps, the service role standing in
  const accepted = await admin.rpc("quote_accept_offer", { p_quote: soldQuote, p_offer: "main", p_install_on: installOn });
  if (accepted.error) throw new Error(`accept: ${accepted.error.message}`);
  check(
    "Accepted on Main floor makes the setter's commission at the rate of that option's lights and boxes after discounts, and says so to Keenan's screen",
    accepted.data?.commission?.profile_id === a.id && Number(accepted.data?.commission?.amount) === soldCommission && accepted.data?.reason === null,
    JSON.stringify(accepted.data),
  );
  const { data: soldQuoteAfter } = await admin.from("quotes").select("accepted_offer, accepted_runs, accepted_boxes").eq("id", soldQuote).single();
  check(
    "the quote records the option said yes to, its runs and its control boxes",
    soldQuoteAfter?.accepted_offer === "main" && JSON.stringify(soldQuoteAfter?.accepted_runs) === "[0,1]" && soldQuoteAfter?.accepted_boxes === 1,
    JSON.stringify(soldQuoteAfter),
  );
  const { data: soldEarnings } = await admin
    .from("earnings")
    .select("id, profile_id, quote_id, source_quote_id, rate, base_amount, amount, status, payable_at")
    .eq("lead_id", soldLead)
    .eq("type", "commission");
  const commissionRow = soldEarnings?.[0] ?? null;
  check(
    "one pending commission, to the lead's setter, coming once installed, on Main floor's lights and box: extra work, rush colour, upper access and the minimum left out",
    soldEarnings?.length === 1 &&
      commissionRow.profile_id === a.id &&
      commissionRow.quote_id === soldQuote &&
      commissionRow.source_quote_id === soldQuote &&
      Number(commissionRow.rate) === Number(settings.commission_rate) &&
      Number(commissionRow.base_amount) === SOLD_BASE_CENTS / 100 &&
      Number(commissionRow.amount) === soldCommission &&
      commissionRow.status === "pending" &&
      commissionRow.payable_at === null,
    JSON.stringify(soldEarnings),
  );
  const { data: soldAfter } = await admin.from("leads").select("status, install_on").eq("id", soldLead).single();
  check("the lead is Sold with its planned install day", soldAfter?.status === "sold" && soldAfter?.install_on === installOn, JSON.stringify(soldAfter));

  const declined = await admin.rpc("quote_decline", { p_quote: declinedQuote, p_reason: "price", p_note: null });
  if (declined.error) throw new Error(`decline: ${declined.error.message}`);
  // A quote saved with no options is one Full wrap ("full") of every run.
  const acceptedToCancel = await admin.rpc("quote_accept_offer", { p_quote: cancelledQuote, p_offer: "full", p_install_on: null });
  if (acceptedToCancel.error) throw new Error(`accept the sale to cancel: ${acceptedToCancel.error.message}`);
  const cancelled = await admin.rpc("quote_cancel", { p_quote: cancelledQuote, p_reason: "timing", p_note: null });
  if (cancelled.error) throw new Error(`cancel: ${cancelled.error.message}`);
  const { data: closedLeads } = await admin.from("leads").select("id, status, lost_reason").in("id", [declinedLead, cancelledLead]);
  const closedById = new Map((closedLeads ?? []).map((row) => [row.id, row]));
  check(
    "Declined for price and Cancelled for timing move the leads to Lost with the reason in words",
    closedById.get(declinedLead)?.status === "lost" &&
      closedById.get(declinedLead)?.lost_reason === "price" &&
      closedById.get(cancelledLead)?.status === "lost" &&
      closedById.get(cancelledLead)?.lost_reason === "cancelled, timing",
    JSON.stringify(closedLeads),
  );
  const { data: voided } = await admin.from("earnings").select("status, note, quote_id, amount").eq("lead_id", cancelledLead);
  check(
    "the cancelled sale's commission is voided with its reason and lets go of the quote; the declined quote made none",
    voided?.length === 1 && voided[0].status === "void" && voided[0].note === "Cancelled: timing" && voided[0].quote_id === null &&
      Number(voided[0].amount) === cancelledCommission &&
      (await admin.from("earnings").select("id").eq("lead_id", declinedLead)).data?.length === 0,
    JSON.stringify(voided),
  );

  // ---------------------------------------------------------------- the setter, Sold
  const setterContext = await browser.newContext(phone);
  page = await setterContext.newPage();
  await signIn(page, a);
  const saleLine = (where, address) => where.getByTestId("home-sale").filter({ hasText: address }).first();
  const payLine = (where, address) => where.getByTestId("pay-commission").filter({ hasText: address }).first();
  {
    const homeRow = await textOf(saleLine(page, SOLD_STREET));
    check(
      "Home, How mine went: the sale with the lead's name and street, \"Sold. $X commission once it's installed.\"",
      homeRow.includes(SOLD_NAME) && homeRow.includes(SOLD_STREET) && homeRow.includes(`Sold. ${money(soldCommission)} commission once it's installed.`),
      homeRow,
    );
    const cancelledRow = await textOf(saleLine(page, CANCELLED_STREET));
    check(
      "the cancelled sale reads \"Cancelled. No commission.\", with no amount",
      cancelledRow.includes("Cancelled. No commission.") && !cancelledRow.includes("$"),
      cancelledRow,
    );
    check("Home has no line for the declined quote: it never earned", (await saleLine(page, DECLINED_STREET).count()) === 0);
    await checkTargets(page, '[data-testid="how-mine-went"]', "How mine went");
    check("no sideways scroll on Home at 430 wide", (await sideways(page)) === 0);
    await page.screenshot({ path: `${out}/outcome-setter-home-sold-430.png`, fullPage: true }).catch(() => {});

    await open(page, "/app/pay");
    const totals = await textOf(page.getByTestId("pay-totals"));
    check(
      "My pay totals: the booking fee owed now, the commission coming once installed, nothing paid yet",
      totals.includes(`Owed now ${payMoney(fee)}`) && totals.includes(`Coming once installed ${payMoney(soldCommission)}`) && /Paid(, all time)? \$0\.00/.test(totals),
      totals,
    );
    const soldPay = await textOf(payLine(page, SOLD_STREET));
    check(
      "My pay's Commission list: the amount, the lead's name and street, \"Coming once it's installed\"",
      soldPay.includes(payMoney(soldCommission)) && soldPay.includes(SOLD_NAME) && soldPay.includes(SOLD_STREET) && soldPay.includes("Coming once it's installed"),
      soldPay,
    );
    const cancelledPay = await textOf(payLine(page, CANCELLED_STREET));
    check("a voided commission says why: \"Voided: cancelled, timing\"", cancelledPay.includes("Voided: cancelled, timing"), cancelledPay);
    await checkTargets(page, '[data-testid="pay-commissions"]', "My pay's Commission list");
    check("no sideways scroll on My pay at 430 wide", (await sideways(page)) === 0);
    await page.screenshot({ path: `${out}/outcome-setter-pay-sold-430.png`, fullPage: true }).catch(() => {});

    await open(page, "/app/leads?tab=closed");
    const soldCard = await textOf(leadRow(page, soldLead));
    const declinedCard = await textOf(leadRow(page, declinedLead));
    const cancelledCard = await textOf(leadRow(page, cancelledLead));
    check(
      "the lead cards under Closed read Sold with its day, \"Lost: price.\" and \"Lost: cancelled, timing.\"",
      soldCard.includes(`Sold ${formatDay(today)}.`) && declinedCard.includes("Lost: price.") && cancelledCard.includes("Lost: cancelled, timing."),
      `${soldCard} | ${declinedCard} | ${cancelledCard}`,
    );
    await page.screenshot({ path: `${out}/outcome-setter-closed-430.png`, fullPage: true }).catch(() => {});

    await open(page, `/app/leads/${soldLead}`);
    let leadText = await mainText(page);
    check(
      "the setter's lead page: the timeline says the quote was accepted and the planned install day, never an amount",
      leadText.includes(`Marked the quote accepted. Install planned for ${formatDay(installOn)}.`) && !/\$|commission/i.test(leadText),
      leadText.slice(Math.max(0, leadText.indexOf("Marked the quote")), leadText.indexOf("Marked the quote") + 120),
    );
    check("the setter gets no outcome card and no quote", (await page.getByTestId("quote-outcome").count()) === 0 && (await page.getByTestId("quote-card").count()) === 0);
    await open(page, `/app/leads/${cancelledLead}`);
    leadText = await mainText(page);
    check(
      "the cancelled lead's timeline: \"Cancelled the sale: timing, inside the 10-day window.\"",
      leadText.includes("Cancelled the sale: timing, inside the 10-day window.") && !leadText.includes("$"),
    );
    await open(page, `/app/leads/${declinedLead}`);
    leadText = await mainText(page);
    check("the declined lead's timeline: \"Marked the quote declined: price.\"", leadText.includes("Marked the quote declined: price.") && !leadText.includes("$"));

    const narrowContext = await browser.newContext(narrow);
    const narrowPage = await narrowContext.newPage();
    await signIn(narrowPage, a);
    check("no sideways scroll on Home at 390 wide", (await sideways(narrowPage)) === 0);
    await checkTargets(narrowPage, '[data-testid="how-mine-went"]', "How mine went at 390 wide");
    await narrowPage.getByTestId("how-mine-went").screenshot({ path: `${out}/outcome-setter-home-sold-390.png` }).catch(() => {});
    await open(narrowPage, "/app/pay");
    check("no sideways scroll on My pay at 390 wide", (await sideways(narrowPage)) === 0);
    await narrowContext.close();
  }

  // ---------------------------------------------------------------- the second setter
  {
    const otherContext = await browser.newContext(phone);
    const other = await otherContext.newPage();
    await signIn(other, b);
    const home = await mainText(other);
    check(
      "the second setter's Home has no sale lines and no amount",
      (await other.getByTestId("home-sale").count()) === 0 && !home.includes("$") && !/commission once|commission to be paid/.test(home),
      home.slice(0, 160),
    );
    await open(other, "/app/leads?tab=closed&who=everyone");
    const theirCards = [await textOf(leadRow(other, soldLead)), await textOf(leadRow(other, declinedLead)), await textOf(leadRow(other, cancelledLead))];
    check(
      "the team's Closed leads show the outcomes in words, Sold and \"Lost: price.\", with no amount",
      theirCards[0].includes(`Sold ${formatDay(today)}.`) && theirCards[1].includes("Lost: price.") && theirCards.every((card) => card !== "" && !card.includes("$")),
      theirCards.join(" | "),
    );
    check("nor the word commission anywhere on Leads", !/commission/i.test(await mainText(other)));
    await open(other, `/app/leads/${soldLead}`);
    const theirView = await mainText(other);
    check(
      "the setter's sold lead, to another setter: no outcome card, no quote, no commission and no amount",
      (await other.getByTestId("quote-outcome").count()) === 0 && (await other.getByTestId("quote-card").count()) === 0 && !/\$|commission/i.test(theirView),
    );
    await open(other, "/app/pay");
    const theirPay = await mainText(other);
    check(
      "the second setter's My pay is their own: nothing owed, coming or paid, and no commission lines",
      /Owed now \$0\.00/.test(theirPay) &&
        /Coming once installed \$0\.00/.test(theirPay) &&
        (await other.getByTestId("pay-commission").count()) === 0 &&
        ![payMoney(soldCommission), payMoney(cancelledCommission), SOLD_STREET, CANCELLED_STREET].some((bit) => theirPay.includes(bit)),
      theirPay.slice(0, 200),
    );
    await other.screenshot({ path: `${out}/outcome-other-setter-pay-430.png`, fullPage: true }).catch(() => {});
    await otherContext.close();
    const client = createClient(url, anonKey, noSession);
    const signedIn = await client.auth.signInWithPassword({ email: b.email, password: b.password });
    const { data: theirRows, error: theirError } = await client.from("earnings").select("id, amount").in("lead_id", leadIds);
    check("the second setter's own session reads none of the setter's earnings", !signedIn.error && !theirError && (theirRows ?? []).length === 0, theirError?.message ?? "");
    await client.auth.signOut({ scope: "local" });
  }

  // ---------------------------------------------------------------- Keenan's card and Pay, Sold (looks only)
  {
    const looked = await testFootprint(leadIds);
    await op.setViewportSize(IPAD);
    await open(op, `/app/leads/${soldLead}`);
    const card = op.getByTestId("quote-outcome");
    check(
      "Accepted: the card says when, the planned install day and the commission coming, to whom",
      (await card.getAttribute("data-state").catch(() => null)) === "accepted" &&
        (await textOf(op.getByTestId("quote-outcome-title"))) === `Accepted ${shortDay(today)}` &&
        (await textOf(op.getByTestId("quote-outcome-install-on"))).includes(formatDay(installOn)) &&
        (await textOf(op.getByTestId("quote-outcome-commission"))) === `${money(soldCommission)} to ${a.name}, coming once installed.`,
      `${await textOf(op.getByTestId("quote-outcome-title"))} | ${await textOf(op.getByTestId("quote-outcome-commission"))}`,
    );
    check(
      "and the option they said yes to, by name, with what it covers",
      (await textOf(op.getByTestId("quote-outcome-option"))).startsWith("Main floor") && (await textOf(op.getByTestId("quote-outcome-option"))).includes("100 ft"),
      await textOf(op.getByTestId("quote-outcome-option")),
    );
    check(
      "its buttons: Installed, Cancelled and Undo acceptance, and no Accepted or Declined",
      (await op.getByTestId("outcome-installed").count()) === 1 &&
        (await op.getByTestId("outcome-cancel").count()) === 1 &&
        (await op.getByTestId("outcome-undo").count()) === 1 &&
        (await op.getByTestId("outcome-accept").count()) === 0 &&
        (await op.getByTestId("outcome-decline").count()) === 0,
    );
    check(
      "on a Sold lead the status menu gives way to a pointer to the outcome card",
      (await op.getByTestId("status-from-outcome").count()) === 1 && (await statusMenu(op).count()) === 0,
    );
    check("no sideways scroll on Keenan's lead page at 1180 wide", (await sideways(op)) === 0);
    await checkTargets(op, '[data-testid="quote-outcome"]', "the outcome card at 1180 wide");
    await card.screenshot({ path: `${out}/outcome-owner-accepted-1180.png` }).catch(() => {});
    await op.setViewportSize(narrow.viewport);
    await open(op, `/app/leads/${soldLead}`);
    check("no sideways scroll on Keenan's lead page at 390 wide", (await sideways(op)) === 0);
    await checkTargets(op, '[data-testid="quote-outcome"]', "the outcome card at 390 wide");
    await op.getByTestId("quote-outcome").screenshot({ path: `${out}/outcome-owner-accepted-390.png` }).catch(() => {});
    await op.setViewportSize(IPAD);

    await open(op, `/app/leads/${declinedLead}`);
    check(
      "Declined: the card says when and why, and offers Accept again",
      (await op.getByTestId("quote-outcome").getAttribute("data-state").catch(() => null)) === "declined" &&
        (await textOf(op.getByTestId("quote-outcome-title"))) === `Declined ${shortDay(today)}` &&
        (await textOf(op.getByTestId("quote-outcome-reason"))) === "Price" &&
        (await textOf(op.getByTestId("outcome-accept"))) === "Accept again" &&
        (await op.getByTestId("outcome-decline").count()) === 0,
      await textOf(op.getByTestId("quote-outcome")),
    );
    check(
      "a Lost lead keeps the status menu, without Sold or Installed",
      (await statusMenu(op).count()) === 1 && (await statusMenu(op).locator('input[value="sold"], input[value="installed"]').count()) === 0,
    );
    await op.getByTestId("quote-outcome").screenshot({ path: `${out}/outcome-owner-declined-1180.png` }).catch(() => {});
    await open(op, `/app/leads/${cancelledLead}`);
    check(
      "Cancelled: the reason, inside the 10-day window, and the commission voided",
      (await op.getByTestId("quote-outcome").getAttribute("data-state").catch(() => null)) === "cancelled" &&
        (await textOf(op.getByTestId("quote-outcome-title"))) === `Cancelled ${shortDay(today)}` &&
        (await textOf(op.getByTestId("quote-outcome-reason"))) === "Timing, inside the 10-day window" &&
        (await textOf(op.getByTestId("quote-outcome-commission"))) === `${money(cancelledCommission)} to ${a.name}, voided.` &&
        (await textOf(op.getByTestId("outcome-accept"))) === "Accept again",
      await textOf(op.getByTestId("quote-outcome")),
    );

    await open(op, "/app/admin/pay");
    const payCard = op.getByTestId("pay-setter").filter({ hasText: a.name });
    const coming = await textOf(payCard.getByTestId("pay-commission-coming"));
    check(
      "Pay lists the commission coming on the sale: the lead, the base of lights and boxes after discounts, and the amount",
      coming.includes(`${SOLD_NAME}, ${SOLD_STREET}`) && coming.includes(`of ${payMoney(SOLD_BASE_CENTS / 100)}`) && coming.includes(payMoney(soldCommission)),
      coming,
    );
    check(
      "until it's installed only the booking fee is ready to tick",
      (await payCard.count()) === 1 && (await payCard.getByRole("checkbox").count()) === 1 && (await textOf(payCard)).includes(`Owed now ${payMoney(fee)}`),
    );
    const voidedLines = await textOf(payCard.getByTestId("pay-voided"));
    check("the voided commission shows with its reason", voidedLines.includes(payMoney(cancelledCommission)) && voidedLines.includes("cancelled, timing"), voidedLines);
    check("no sideways scroll on Pay at 1180 wide", (await sideways(op)) === 0);
    await payCard.screenshot({ path: `${out}/outcome-owner-pay-coming-1180.png` }).catch(() => {});
    check("Keenan's looks wrote nothing", (await testFootprint(leadIds)) === looked);
  }

  // ---------------------------------------------------------------- Installed
  const installed = await admin.rpc("lead_mark_installed", { p_lead: soldLead, p_on: installedDay });
  if (installed.error) throw new Error(`installed: ${installed.error.message}`);
  const { data: owedRow } = await admin.from("earnings").select("status, payable_at").eq("id", commissionRow.id).single();
  check("Installed makes the commission payable", owedRow?.status === "pending" && owedRow?.payable_at !== null, JSON.stringify(owedRow));
  {
    await open(page, "/app");
    const homeRow = await textOf(saleLine(page, SOLD_STREET));
    check("Home: \"Installed. $X commission to be paid.\"", homeRow.includes(`Installed. ${money(soldCommission)} commission to be paid.`), homeRow);
    await page.screenshot({ path: `${out}/outcome-setter-home-installed-430.png`, fullPage: true }).catch(() => {});
    await open(page, "/app/pay");
    const totals = await textOf(page.getByTestId("pay-totals"));
    check(
      "My pay: the commission joins the booking fee under Owed now, and nothing is coming",
      totals.includes(`Owed now ${payMoney(fee + soldCommission)}`) && totals.includes(`Coming once installed ${payMoney(0)}`),
      totals,
    );
    const soldPay = await textOf(payLine(page, SOLD_STREET));
    check("the commission line reads Owed", /\bOwed\b/.test(soldPay) && !soldPay.includes("Coming once"), soldPay);
    await open(page, "/app/leads?tab=closed");
    const card = await textOf(leadRow(page, soldLead));
    check("the lead card now reads Installed with the day the crew finished", card.includes(`Installed ${formatDay(installedDay)}.`), card);
  }
  {
    const looked = await testFootprint(leadIds);
    await open(op, `/app/leads/${soldLead}`);
    check(
      "Installed: the card says when, and that the commission is owed",
      (await op.getByTestId("quote-outcome").getAttribute("data-state").catch(() => null)) === "installed" &&
        (await textOf(op.getByTestId("quote-outcome-title"))) === `Installed ${shortDay(installedDay)}` &&
        (await textOf(op.getByTestId("quote-outcome-commission"))) === `${money(soldCommission)} to ${a.name}, owed now. Mark it paid in Pay.`,
      `${await textOf(op.getByTestId("quote-outcome-title"))} | ${await textOf(op.getByTestId("quote-outcome-commission"))}`,
    );
    check(
      "once installed: Cancelled and Not installed yet stay on offer, and there is no Undo or Installed to tap",
      (await op.getByTestId("outcome-undo").count()) === 0 &&
        (await op.getByTestId("outcome-installed").count()) === 0 &&
        (await op.getByTestId("outcome-cancel").count()) === 1 &&
        (await textOf(op.getByTestId("outcome-not-installed"))) === "Not installed yet",
    );
    await op.getByTestId("quote-outcome").screenshot({ path: `${out}/outcome-owner-installed-1180.png` }).catch(() => {});
    await open(op, "/app/admin/pay");
    const payCard = op.getByTestId("pay-setter").filter({ hasText: a.name });
    const owedCommission = await textOf(payCard.getByTestId("mark-paid").locator("label").filter({ hasText: "Commission" }));
    check(
      "Pay: the commission is owed, ready to tick beside the booking fee",
      (await payCard.getByRole("checkbox").count()) === 2 &&
        owedCommission.includes(SOLD_STREET) &&
        owedCommission.includes(payMoney(soldCommission)) &&
        (await payCard.getByTestId("pay-commission-coming").count()) === 0 &&
        (await textOf(payCard)).includes(`Owed now ${payMoney(fee + soldCommission)}`),
      owedCommission,
    );
    await payCard.screenshot({ path: `${out}/outcome-owner-pay-owed-1180.png` }).catch(() => {});
    check("Keenan's looks wrote nothing", (await testFootprint(leadIds)) === looked);
  }

  // ---------------------------------------------------------------- View as the setter
  {
    const looked = await testFootprint(leadIds);
    await op.setViewportSize(phone.viewport);
    await open(op, "/app/admin/people");
    await op.locator("tr", { hasText: a.email }).getByRole("button", { name: "View as" }).click();
    await op.waitForURL("**/app", { timeout: 30000 });
    await settle(op);
    check(
      "View as opens under the gold bar",
      (await op.getByRole("status").filter({ hasText: `Viewing as ${a.name}. Read only.` }).count()) === 1,
    );
    for (const [label, path] of [
      ["Home", "/app"],
      ["My pay", "/app/pay"],
    ]) {
      await open(page, path);
      const real = await capture(page);
      await open(op, path);
      const viewed = await capture(op);
      const same =
        real.text === viewed.text && JSON.stringify(real.controls) === JSON.stringify(viewed.controls) && JSON.stringify(real.images) === JSON.stringify(viewed.images);
      check(
        `View as shows ${label} exactly as the setter sees it, commission included`,
        same && viewed.text.includes(label === "Home" ? `Installed. ${money(soldCommission)} commission to be paid.` : payMoney(soldCommission)),
        real.text === viewed.text ? (same ? "" : "controls or photos differ") : firstDifference(real.text, viewed.text),
      );
      if (label === "Home") {
        const rest = viewed.text.replace(OWN_COMMISSION_LINE, "");
        check("View as Home shows no amount but the setter's own commission lines", !/\$|Price per foot|Booking pay|Commission/.test(rest), rest.slice(0, 160));
      } else {
        check("View as My pay is the setter's own, nobody else's", !viewed.text.includes(b.name) && !/Price per foot|Booking pay/.test(viewed.text));
      }
      await op.screenshot({ path: `${out}/outcome-view-as-${label === "Home" ? "home" : "pay"}-430.png`, fullPage: true }).catch(() => {});
    }
    await open(op, "/app");
    await op.getByRole("status").filter({ hasText: "Viewing as" }).getByRole("button", { name: "Exit" }).click();
    await op.waitForURL("**/app/admin/people", { timeout: 20000 });
    check("Exit ends View as", !(await ownerContext.cookies()).some((cookie) => cookie.name === VIEW_AS_COOKIE));
    check("viewing wrote nothing", (await testFootprint(leadIds)) === looked);
  }
  await ownerSession.close();
  ownerSession = null;
  check("nothing of the owner's changed", (await ownerFootprint(ownerId)) === before);
  note("Keenan's outcome buttons and Mark paid are looked at only, because the owner session is view only; the service role stands in for his taps here, and the database tests prove each function.");

  // ---------------------------------------------------------------- Paid
  const paid = await admin.rpc("mark_earnings_paid", { p_ids: [commissionRow.id] });
  check("Mark paid pays the commission", !paid.error && paid.data === 1, paid.error?.message ?? String(paid.data));
  const { data: paidRow } = await admin.from("earnings").select("paid_at").eq("id", commissionRow.id).single();
  {
    await open(page, "/app");
    const homeRow = await textOf(saleLine(page, SOLD_STREET));
    check("Home: \"Paid. $X commission.\"", homeRow.includes(`Paid. ${money(soldCommission)} commission.`), homeRow);
    await page.screenshot({ path: `${out}/outcome-setter-home-paid-430.png`, fullPage: true }).catch(() => {});
    await open(page, "/app/pay");
    const totals = await textOf(page.getByTestId("pay-totals"));
    check(
      "My pay: the commission moves to Paid, and the booking fee is still owed",
      totals.includes(`Owed now ${payMoney(fee)}`) &&
        totals.includes(`Coming once installed ${payMoney(0)}`) &&
        new RegExp(`Paid(, all time)? \\${payMoney(soldCommission)}`).test(totals),
      totals,
    );
    const soldPay = await textOf(payLine(page, SOLD_STREET));
    check("the commission line reads Paid with the day", paidRow?.paid_at ? soldPay.includes(`Paid ${formatDate(paidRow.paid_at)}`) : false, soldPay);
  }

  // ---------------------------------------------------------------- the timeline carries no money
  // Every setter reads these leads' timelines, so no event may carry a
  // money key or one of the amounts as a number.
  const { data: events } = await admin.from("lead_events").select("type, payload").in("lead_id", leadIds);
  const amounts = [soldCommission, cancelledCommission, SOLD_BASE_CENTS / 100, CANCELLED_BASE_CENTS / 100, 9000, 2800, 2340];
  const money_found = [];
  const walk = (value, key = "") => {
    if (/amount|commission|total|price|rate|base|fee/i.test(key)) money_found.push(key);
    if (typeof value === "number" && amounts.includes(value)) money_found.push(`${key}=${value}`);
    if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  for (const event of events ?? []) walk(event.payload);
  const outcomeEvents = (events ?? []).filter((event) => ["quote_accepted", "quote_declined", "quote_cancelled"].includes(event.type));
  check(
    "the outcome events carry the quote and fixed-list facts only, never an amount",
    outcomeEvents.length === 4 && money_found.length === 0,
    `${outcomeEvents.length} outcome events; ${money_found.join(", ")} ${JSON.stringify(outcomeEvents.map((event) => event.payload)).slice(0, 240)}`,
  );
  await setterContext.close();
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)}${page ? ` at ${page.url()}` : ""}${op ? ` / owner at ${op.url()}` : ""}`);
  if (page) await page.screenshot({ path: `${out}/outcome-failure.png`, fullPage: true }).catch(() => {});
  if (op) await op.screenshot({ path: `${out}/outcome-owner-failure.png`, fullPage: true }).catch(() => {});
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  await cleanUp().catch((error) => results.push(`SCRIPT ERROR cleanup: ${error?.message ?? String(error)}`));
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const leftoverUsers = (data?.users ?? []).filter((user) => (user.email ?? "").startsWith("outcome-live-"));
  const { count: leftoverLeads } = await admin.from("leads").select("id", { count: "exact", head: true }).ilike("address_line", `%Outcometest${stamp}%`);
  check("the throwaway setters, their leads, quotes, meeting and earnings are gone", leftoverUsers.length === 0 && leftoverLeads === 0, `${leftoverUsers.length} accounts, ${leftoverLeads} leads left`);
  await browser.close();
}

console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
