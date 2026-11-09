// Live walk-through of the soffit colour code (Keenan, 2026-11-09) against a
// running build. A throwaway setter types the soffit's RAL number on their
// own lead and sees its name, saves it, and adds a photo of the colour book
// held up to each colour of a split soffit; a second throwaway setter sees
// all of it read only. Keenan's side uses the one-time owner session he
// approved (owner-session.mjs): it looks at Use for the track on the lead
// page and the prep list and never taps it, since the owner's session writes
// nothing; the "track colour is that already" state is staged with the
// service role. Then View as the setter: the section exactly as the setter
// sees it, a Save refused calmly, a photo acted out, and nothing written.
// The leads are named "TEST LEAD (automated)" and everything made here is
// removed at the end.
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
  console.error("The soffit colour code walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const BUCKET = "lead-photos";
const VIEW_AS_COOKIE = "vesper_view_as";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const people = {
  a: { email: `soffit-live-a-${stamp}@example.com`, password: `maple-river-stone-${digits}`, name: "Soffit Test A", id: null },
  b: { email: `soffit-live-b-${stamp}@example.com`, password: `cedar-harbor-lantern-${digits}`, name: "Soffit Test B", id: null },
};

const phone = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const narrow = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const ipad = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true };

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

const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// Every control in the section at least 44 px each way.
function smallTargets(page) {
  return page.evaluate(() => {
    const offenders = [];
    for (const element of document.querySelectorAll('[data-testid="soffit-code"] :is(a[href], button, input:not([type="hidden"]))')) {
      if (element.closest('[aria-hidden="true"]') || element.matches('[aria-hidden="true"]')) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      if (box.width < 44 || box.height < 44) {
        offenders.push(`${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return offenders;
  });
}

// The section as a person sees it: its words, its controls and its pictures.
function sectionView(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="soffit-code"]');
    if (!root) return null;
    return {
      text: root.innerText.replace(/\s+/g, " ").trim(),
      controls: [...root.querySelectorAll("button, input:not([type=hidden])")]
        .filter((el) => getComputedStyle(el).display !== "none")
        .map((el) => [(el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || "").replace(/\s+/g, " ").trim(), el.matches(":disabled")]),
      images: [...root.querySelectorAll("img")].map((img) => img.getAttribute("alt") ?? ""),
    };
  });
}

async function ownerFootprint(ownerId) {
  const [profile, leads, events, settings, colours] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).single(),
    admin.from("leads").select("id, updated_at").eq("created_by", ownerId).order("id"),
    admin.from("lead_events").select("id").eq("actor_id", ownerId).order("id"),
    admin.from("settings").select("*").eq("id", 1).single(),
    admin.from("track_colours").select("*").order("id"),
  ]);
  return JSON.stringify({ profile: profile.data, leads: leads.data, events: events.data, settings: settings.data, colours: colours.data });
}

async function removeEverythingOf(id) {
  await admin.from("meetings").delete().eq("host_id", id);
  await admin.from("leads").delete().eq("created_by", id);
  const { data: files } = await admin.storage.from(BUCKET).list(id, { limit: 1000 });
  if (files && files.length > 0) await admin.storage.from(BUCKET).remove(files.map((file) => `${id}/${file.name}`));
  await admin.auth.admin.deleteUser(id);
}

await mkdir(out, { recursive: true });
const fixture = `${out}/soffit-book-fixture.jpg`;
await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#ece6d6" } }).jpeg({ quality: 80 }).toFile(fixture);
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
  const { data: ownerRow } = await admin.from("profiles").select("id").eq("role", "owner").single();
  const ownerId = ownerRow.id;
  // A split soffit: off-white or cream, and white, with the note the
  // database asks for.
  const { data: leadRow, error: leadError } = await admin
    .from("leads")
    .insert({
      first_name: TEST_LEAD,
      last_name: "Soffit",
      address_line: `7 Soffittest${stamp} Crescent SW`,
      created_by: a.id,
      soffit_colour: "off_white",
      soffit_colour_2: "white",
      soffit_note: "Front is cream, garage is white (automated)",
    })
    .select("id")
    .single();
  if (leadError) throw new Error(`lead: ${leadError.message}`);
  const leadId = leadRow.id;
  const { data: colours } = await admin.from("track_colours").select("id, name, ral_code, sort_order, active");
  const stockFor = (code) =>
    (colours ?? []).filter((colour) => colour.active && colour.ral_code === code).sort((x, y) => x.sort_order - y.sort_order || x.name.localeCompare(y.name))[0] ?? null;

  // ---------------------------------------------------------------- the setter
  const setterContext = await browser.newContext(phone);
  page = await setterContext.newPage();
  await signIn(page, a);
  await page.goto(`${base}/app/leads/${leadId}`);
  await settle(page);
  const section = page.getByTestId("soffit-code");
  check(
    "the lead page has the soffit colour code in the Find out card, one for each colour of a split soffit, each named",
    (await page.locator("#find-out").getByTestId("soffit-code").count()) === 1 &&
      (await section.getByRole("heading", { name: "Off-white or cream" }).count()) === 1 &&
      (await section.getByRole("heading", { name: "White", exact: true }).count()) === 1,
  );
  check("the six questions still count six, and the code isn't one of them", (await page.getByTestId("completeness").innerText()).includes("of 6 collected"));
  const field = page.getByTestId("soffit-code-1-input");
  await field.fill("ral 9001");
  check("typing the number names its colour at once", (await page.getByTestId("soffit-code-1-name").innerText()).trim() === "RAL 9001 Cream");
  await field.fill("12");
  await page.getByTestId("soffit-code-1-save").click();
  await page.getByTestId("soffit-code-1-form").getByRole("alert").first().waitFor({ timeout: 10000 }).catch(() => {});
  const { data: stillEmpty } = await admin.from("leads").select("soffit_ral_code").eq("id", leadId).single();
  check(
    "a number that isn't four digits is refused in plain words, and what was typed stays",
    (await field.inputValue()) === "12" && stillEmpty?.soffit_ral_code === null &&
      (await page.getByTestId("soffit-code-1-form").getByRole("alert").first().innerText()).includes("four digits"),
  );
  await field.fill("9001");
  await page.getByTestId("soffit-code-1-save").click();
  await page.getByTestId("soffit-code-1-form").getByText("Saved.").waitFor({ timeout: 20000 }).catch(() => {});
  const { data: saved } = await admin.from("leads").select("soffit_ral_code, soffit_ral_code_2").eq("id", leadId).single();
  check("Save stores the code on the lead", saved?.soffit_ral_code === "9001" && saved?.soffit_ral_code_2 === null, JSON.stringify(saved));
  await page.getByTestId("soffit-code-2-input").fill("9016");
  await page.getByTestId("soffit-code-2-save").click();
  await page.getByTestId("soffit-code-2-form").getByText("Saved.").waitFor({ timeout: 20000 }).catch(() => {});
  const { data: savedTwo } = await admin.from("leads").select("soffit_ral_code_2").eq("id", leadId).single();
  check("the second colour has its own code", savedTwo?.soffit_ral_code_2 === "9016");

  // The colour book photo, through the same upload as every lead photo.
  await page.setInputFiles('[data-testid="soffit-book-1-input"]', fixture);
  let book = null;
  for (let i = 0; i < 30 && !book; i += 1) {
    const { data } = await admin.from("lead_photos").select("storage_path, slot").eq("lead_id", leadId).eq("slot", "soffit_book").maybeSingle();
    book = data;
    if (!book) await page.waitForTimeout(500);
  }
  check("a colour book photo goes into its slot, from the setter's own folder", Boolean(book) && book.storage_path.startsWith(`${a.id}/`));
  await page.reload();
  await settle(page);
  check(
    "after a reload the photo shows with the colour it belongs to, and the code is named",
    (await section.locator('img[alt="The colour book held up to the soffit, Off-white or cream"]').count()) === 1 &&
      (await page.getByTestId("soffit-code-1-name").innerText()).trim() === "RAL 9001 Cream",
  );
  await page.getByRole("button", { name: /Show the colour book photo larger, Off-white or cream/ }).click();
  check("a tap on the photo shows it large", await page.getByTestId("soffit-book-1-large").isVisible().catch(() => false));
  await page.getByTestId("soffit-book-1-large").getByRole("button", { name: "Close", exact: true }).click();
  const { data: timeline } = await admin.from("lead_events").select("type, payload").eq("lead_id", leadId).order("created_at");
  // Edits carry field names only; a photo carries its id and slot.
  const editedText = JSON.stringify((timeline ?? []).filter((event) => event.type === "edited").map((event) => event.payload));
  check(
    "the timeline names the fields and the photo's slot, never the code",
    editedText.includes("soffit_ral_code") &&
      (timeline ?? []).some((event) => event.type === "photo_added" && event.payload?.slot === "soffit_book") &&
      !editedText.includes("9001") && !editedText.includes("9016"),
    editedText,
  );
  check("the setter gets no Use for the track", (await page.getByTestId("soffit-code-1-use").count()) === 0 && (await page.getByTestId("soffit-code-2-use").count()) === 0);
  check("tap targets in the section are at least 44 px at 430 wide", (await smallTargets(page)).length === 0, (await smallTargets(page)).join("; "));
  check("no sideways scroll at 430 wide", (await sideways(page)) === 0);
  await section.screenshot({ path: `${out}/soffit-setter-430.png` }).catch(() => {});
  const setterSees = await sectionView(page);

  const narrowContext = await browser.newContext(narrow);
  const narrowPage = await narrowContext.newPage();
  await signIn(narrowPage, a);
  await narrowPage.goto(`${base}/app/leads/${leadId}`);
  await settle(narrowPage);
  check("no sideways scroll at 390 wide", (await sideways(narrowPage)) === 0);
  check("tap targets in the section are at least 44 px at 390 wide", (await smallTargets(narrowPage)).length === 0, (await smallTargets(narrowPage)).join("; "));
  await narrowPage.getByTestId("soffit-code").screenshot({ path: `${out}/soffit-setter-390.png` }).catch(() => {});
  await narrowContext.close();

  // ---------------------------------------------------------------- another setter
  const otherContext = await browser.newContext(phone);
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, people.b);
  await otherPage.goto(`${base}/app/leads/${leadId}`);
  await settle(otherPage);
  const theirs = otherPage.getByTestId("soffit-code");
  check(
    "another setter reads the codes by name and sees the photo, with nothing to change",
    (await otherPage.getByTestId("soffit-code-1-label").innerText()).trim() === "RAL 9001 Cream" &&
      (await otherPage.getByTestId("soffit-code-2-label").innerText()).trim() === "RAL 9016 Traffic white" &&
      (await theirs.locator("img").count()) === 1 &&
      (await theirs.locator("input:not([type=hidden])").count()) === 0 &&
      (await theirs.getByRole("button", { name: /Take photo|Retake|Upload|Save|Use for the track/ }).count()) === 0,
  );
  await theirs.screenshot({ path: `${out}/soffit-other-setter-430.png` }).catch(() => {});
  await otherContext.close();

  // ---------------------------------------------------------------- Keenan (looks only)
  // Staged with the service role: the track colour is already what the
  // second code would set, so that block says so instead of offering it.
  const stock2 = stockFor("9016");
  const staged = await admin
    .from("leads")
    .update(stock2 ? { track_colour_id: stock2.id, track_ral_code: null } : { track_colour_id: null, track_ral_code: "9016" })
    .eq("id", leadId);
  if (staged.error) throw new Error(`staged track colour: ${staged.error.message}`);
  const before = await ownerFootprint(ownerId);
  const { data: leadBefore } = await admin.from("leads").select("updated_at, track_colour_id, track_ral_code, soffit_ral_code, soffit_ral_code_2").eq("id", leadId).single();
  const ownerContext = await browser.newContext(ipad);
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  op = await ownerContext.newPage();
  const stock1 = stockFor("9001");
  const offer1 = stock1 ? `Sets the track colour to ${stock1.name}` : "Sets the track colour to Custom, RAL 9001 Cream. Needs powder coating.";
  for (const [where, path] of [
    ["the lead page", `/app/leads/${leadId}`],
    ["the prep list", `/app/meetings/prep/${leadId}`],
  ]) {
    await op.goto(`${base}${path}`);
    await settle(op);
    const mine = op.getByTestId("soffit-code");
    check(
      `${where}: Keenan sees Use for the track beside the first code, saying what it sets`,
      (await op.getByTestId("soffit-code-1-use").count()) === 1 && (await op.getByTestId("soffit-code-1-track").innerText()).includes(offer1),
      await op.getByTestId("soffit-code-1-track").innerText().catch(() => ""),
    );
    check(
      `${where}: where the track colour is that already, it says so instead`,
      (await op.getByTestId("soffit-code-2-use").count()) === 0 && (await op.getByTestId("soffit-code-2-track-set").innerText()).trim().startsWith("Track colour is "),
    );
    check(`${where}: Keenan can change the codes and photos too`, (await op.getByTestId("soffit-code-1-input").count()) === 1 && (await op.getByTestId("soffit-book-1-take").count()) === 1);
    check(`${where}: no swatches, only names`, (await mine.locator('[style*="background"]').count()) === 0);
    check(`${where}: no sideways scroll at 1180 wide`, (await sideways(op)) === 0);
    check(`${where}: tap targets at least 44 px`, (await smallTargets(op)).length === 0, (await smallTargets(op)).join("; "));
    await mine.screenshot({ path: `${out}/soffit-owner-${where === "the prep list" ? "prep" : "lead"}-1180.png` }).catch(() => {});
  }
  check(
    "the prep list keeps the soffit colour code with the track colour item",
    (await op.getByTestId("prep-item-track_colour").getByTestId("soffit-code").count()) === 1,
  );

  // ---------------------------------------------------------------- View as the setter
  await op.goto(`${base}/app/admin/people`);
  await settle(op);
  await op.locator("tr", { hasText: a.email }).getByRole("button", { name: "View as" }).click();
  await op.waitForURL("**/app", { timeout: 30000 });
  await settle(op);
  await op.setViewportSize(phone.viewport);
  await op.goto(`${base}/app/leads/${leadId}`);
  await settle(op);
  const viewed = await sectionView(op);
  // The setter's own page, loaded again now the photo is saved, to compare.
  await page.reload();
  await settle(page);
  const real = await sectionView(page);
  check(
    "View as shows the soffit colour code exactly as the setter sees it",
    JSON.stringify(real) === JSON.stringify(viewed) && JSON.stringify(setterSees.text) === JSON.stringify(real.text),
    JSON.stringify(real) === JSON.stringify(viewed) ? "" : `${real?.text.slice(0, 120)} | ${viewed?.text.slice(0, 120)}`,
  );
  check("View as gives no Use for the track", (await op.getByTestId("soffit-code-1-use").count()) === 0);
  await op.getByTestId("soffit-code-1-input").fill("9010");
  await op.getByTestId("soffit-code-1-save").click();
  const refused = await op
    .getByTestId("soffit-code")
    .getByTestId("view-as-nothing-saved")
    .first()
    .innerText({ timeout: 10000 })
    .then((text) => text.trim())
    .catch(() => "");
  check(
    "a Save while viewing is refused calmly with \"View as: nothing was saved.\", and the box keeps what was typed",
    refused === "View as: nothing was saved." && (await op.getByTestId("soffit-code-1-input").inputValue()) === "9010" && (await op.getByTestId("soffit-code").getByRole("alert").count()) === 0,
    refused,
  );
  await op.setInputFiles('[data-testid="soffit-book-2-input"]', fixture);
  await op.getByTestId("soffit-book-2").locator("img").first().waitFor({ timeout: 10000 }).catch(() => {});
  check("a colour book photo while viewing is shown here only", (await op.getByTestId("soffit-book-2").getByTestId("view-as-nothing-saved").count()) === 1);
  await op.waitForTimeout(1500);
  const { data: leadAfter } = await admin.from("leads").select("updated_at, track_colour_id, track_ral_code, soffit_ral_code, soffit_ral_code_2").eq("id", leadId).single();
  const { data: books } = await admin.from("lead_photos").select("slot").eq("lead_id", leadId).in("slot", ["soffit_book", "soffit_book_2"]);
  check(
    "nothing was written while Keenan looked or viewed: the lead, its track colour and its photos are as they were",
    JSON.stringify(leadAfter) === JSON.stringify(leadBefore) && (books ?? []).map((photo) => photo.slot).join() === "soffit_book",
    `${JSON.stringify(leadAfter)} vs ${JSON.stringify(leadBefore)}`,
  );
  await op.goto(`${base}/app`);
  await settle(op);
  await op.getByRole("status").filter({ hasText: "Viewing as" }).getByRole("button", { name: "Exit" }).click();
  await op.waitForURL("**/app/admin/people", { timeout: 20000 });
  check("Exit ends View as", !(await ownerContext.cookies()).some((cookie) => cookie.name === VIEW_AS_COOKIE));
  await ownerSession.close();
  ownerSession = null;
  check("nothing of the owner's changed", (await ownerFootprint(ownerId)) === before);
  await setterContext.close();
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)}${page ? ` at ${page.url()}` : ""}${op ? ` / owner at ${op.url()}` : ""}`);
  if (page) await page.screenshot({ path: `${out}/soffit-failure.png`, fullPage: true }).catch(() => {});
  if (op) await op.screenshot({ path: `${out}/soffit-owner-failure.png`, fullPage: true }).catch(() => {});
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  for (const person of Object.values(people)) {
    if (person.id) await removeEverythingOf(person.id);
  }
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const leftoverUsers = (data?.users ?? []).filter((user) => (user.email ?? "").startsWith("soffit-live-"));
  const { count: leftoverLeads } = await admin.from("leads").select("id", { count: "exact", head: true }).ilike("address_line", `%Soffittest${stamp}%`);
  check("the throwaway setters, their lead and photos are gone", leftoverUsers.length === 0 && leftoverLeads === 0, `${leftoverUsers.length} accounts, ${leftoverLeads} leads left`);
  await browser.close();
}

console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
