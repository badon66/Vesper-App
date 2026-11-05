// Live walk-through of M2 on a phone-sized screen against a running
// production build: the knock session counters, a new lead with a typed
// address and phone, the door process (the step notes behind the "?", the
// seven Find out questions, the four guided photos with a retake and More
// photos), search,
// the Everyone view, the status rules and the timeline, the track colour as
// a setter sees it, tap-target sizes, and the Google address path with the
// duplicate warning; last, New lead's save with its answer lost to the
// signal, and with no answer at all until the 25-second limit (2026-11-04),
// saved again without making a copy. Two throwaway setters do the work. Their leads are named
// "TEST LEAD (automated)" so a real setter who sees one knows to ignore it,
// and everything they create is deleted at the end of the run.
//
// Run with `npm run test:live` after `npm run build`. Needs the three
// Supabase variables; the Google key is needed for the address path.
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import sharp from "sharp";
import { interceptFetches } from "./drop.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The M2 walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const TEST_PLACE = "TEST (automated)";
const TYPED_ADDRESS = "300 Testing Lane NW (TEST)";
const OTHER_ADDRESS = "200 Testing Lane NW (TEST)";
const GOOGLE_QUERY = "123 Evanston Way NW Calgary";
const BUCKET = "lead-photos";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const SLOT_HINT = "Hold the phone sideways and get the whole roofline in. At night, hold still while night mode finishes.";
const people = {
  a: { email: `m2-live-a-${stamp}@example.com`, password: `maple-river-stone-${digits}`, name: "Live Test A", id: null },
  b: { email: `m2-live-b-${stamp}@example.com`, password: `cedar-brook-pearl-${digits}`, name: "Live Test B", id: null },
};

// Every visible control must be at least 44 by 44 px. Visually hidden
// inputs are measured through the label or button that operates them.
function tapTargetsTooSmall(page) {
  return page.evaluate(() => {
    const offenders = [];
    const selector =
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="option"], label:has(input[type="radio"])';
    for (const element of document.querySelectorAll(selector)) {
      if (element.matches('input[type="radio"]')) continue;
      if (element.closest('[aria-hidden="true"]')) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      if (box.width < 44 || box.height < 44) {
        const label = (element.getAttribute("aria-label") || element.textContent || element.getAttribute("name") || "")
          .trim()
          .slice(0, 30);
        offenders.push(`${element.tagName.toLowerCase()} "${label}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return offenders;
  });
}

async function checkTapTargets(page, screen) {
  const small = await tapTargetsTooSmall(page);
  check(`tap targets on ${screen} are at least 44 px`, small.length === 0, small.join("; "));
}

// A Find out question, found by its legend.
const question = (page, legend) =>
  page.locator("fieldset").filter({ has: page.locator("legend", { hasText: new RegExp(`^${legend}$`) }) });

async function answer(page, legend, choice) {
  await question(page, legend).getByText(choice, { exact: true }).click();
}

async function checkedValue(page, legend) {
  return question(page, legend).locator("input:checked").evaluateAll((inputs) => inputs.map((input) => input.value).join(","));
}

// Tabs show a loading screen the moment they are tapped, so the address
// changes before the content arrives. Every check waits for the screen to
// finish loading first.
async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}

async function removeEverythingOf(id) {
  await admin.from("leads").delete().eq("created_by", id);
  await admin.from("knock_sessions").delete().eq("user_id", id);
  const { data: files } = await admin.storage.from(BUCKET).list(id, { limit: 1000 });
  if (files && files.length > 0) {
    await admin.storage.from(BUCKET).remove(files.map((file) => `${id}/${file.name}`));
  }
  await admin.auth.admin.deleteUser(id);
}

await mkdir(out, { recursive: true });
const fixture = `${out}/door-fixture.jpg`;
await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#5b7083" } })
  .withExif({ IFD0: { ImageDescription: "TEST (automated) photo with metadata", Copyright: "Vesper test" } })
  .jpeg({ quality: 90 })
  .toFile(fixture);
const fixtureMeta = await sharp(fixture).metadata();

let googleLeadId = null;
const browser = await chromium.launch();
const { defaultBrowserType, ...iphone } = devices["iPhone 14"];
void defaultBrowserType;
const context = await browser.newContext(iphone);
const page = await context.newPage();
const viewport = page.viewportSize();

try {
  // Setup: two setters. B adds a lead through the database API as themself.
  for (const key of ["a", "b"]) {
    const person = people[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
      user_metadata: { full_name: person.name },
      app_metadata: { role: "sales" },
    });
    if (error) throw new Error(`createUser ${key}: ${error.message}`);
    person.id = data.user.id;
    // The first sign-in welcome has its own walk-through; this one starts after it.
    await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", person.id);
  }
  const bClient = createClient(url, anonKey, noSession);
  await bClient.auth.signInWithPassword({ email: people.b.email, password: people.b.password });
  const { data: bLead, error: bLeadError } = await bClient
    .from("leads")
    .insert({ first_name: TEST_LEAD, address_line: OTHER_ADDRESS, neighbourhood: TEST_PLACE, phone: "+14035550100", created_by: people.b.id })
    .select("id")
    .single();
  if (bLeadError) throw new Error(`B's lead: ${bLeadError.message}`);

  // B is out knocking already, since 30 minutes ago, so Session's Out today
  // has someone in it. The service key keeps the times given.
  const B_PLACE = "TEST Out Today (automated)";
  const bStart = new Date(Date.now() - 30 * 60_000).toISOString();
  const { error: bSessionError } = await admin
    .from("knock_sessions")
    .insert({ user_id: people.b.id, neighbourhood: B_PLACE, started_at: bStart, doors_knocked: 12, conversations: 3 });
  if (bSessionError) throw new Error(`B's session: ${bSessionError.message}`);

  // 1. Sign in, open Session (the gold tab, 2026-11-05) and start knocking.
  await page.goto(`${base}/login`);
  await settle(page);
  await page.fill("#email", people.a.email);
  await page.fill("#password", people.a.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 20000 });
  await settle(page);
  check("Home no longer holds the knock session", (await page.locator("#knock-neighbourhood").count()) === 0 && (await page.getByRole("button", { name: /^Add one to doors/ }).count()) === 0);
  await page.locator('nav[aria-label="Tabs"]:visible').getByRole("link", { name: "Session", exact: true }).click();
  await page.waitForURL("**/app/session", { timeout: 20000 });
  await settle(page);
  const outRow = page.getByTestId("out-today-row").filter({ hasText: people.b.name });
  const outText = (await outRow.innerText().catch(() => "")).replace(/\s+/g, " ");
  check(
    "Out today shows who else is out: name, neighbourhood, since when, doors and conversations",
    outText.includes(B_PLACE) && outText.includes("Since ") && outText.includes("12 doors") && outText.includes("3 conversations"),
    outText,
  );
  check("Out today leaves the setter themselves out", (await page.getByTestId("out-today-row").filter({ hasText: people.a.name }).count()) === 0);
  await checkTapTargets(page, "Session, not knocking");
  await page.screenshot({ path: `${out}/m2-session-start.png`, fullPage: true });
  await page.fill("#knock-neighbourhood", TEST_PLACE);
  await page.getByRole("button", { name: "Start knocking" }).click();
  await page.getByRole("heading", { name: `Knocking in ${TEST_PLACE}` }).waitFor({ timeout: 20000 });
  check("a knock session starts with a neighbourhood", true);

  // 2. Counters: fast taps show at once and all land in the database.
  const addDoor = page.getByRole("button", { name: /^Add one to doors/ });
  const addTalk = page.getByRole("button", { name: /^Add one to conversations/ });
  for (let i = 0; i < 5; i += 1) await addDoor.click({ delay: 0 });
  await addTalk.click();
  await addTalk.click();
  await page.getByRole("button", { name: "Take one off doors" }).click();
  const shownDoors = (await addDoor.getAttribute("aria-label")) ?? "";
  const shownTalks = (await addTalk.getAttribute("aria-label")) ?? "";
  check("counters update the moment they are tapped", shownDoors.endsWith("now 4") && shownTalks.endsWith("now 2"), `${shownDoors} | ${shownTalks}`);
  await page.getByText("All taps saved.").waitFor({ timeout: 20000 });
  const { data: sessionRow } = await admin
    .from("knock_sessions")
    .select("id, doors_knocked, conversations")
    .eq("user_id", people.a.id)
    .is("ended_at", null)
    .single();
  check("every tap is saved: 4 doors and 2 conversations", sessionRow?.doors_knocked === 4 && sessionRow?.conversations === 2, JSON.stringify(sessionRow));
  for (const name of [/^Add one to doors/, /^Add one to conversations/]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    check(`the ${String(name).includes("doors") ? "doors" : "conversations"} counter is on screen without scrolling`, box !== null && box.y >= 0 && box.y + box.height <= viewport.height, box ? `${Math.round(box.y)}-${Math.round(box.y + box.height)} of ${viewport.height}` : "missing");
  }
  await checkTapTargets(page, "Session while knocking");
  await page.screenshot({ path: `${out}/m2-session-knocking.png`, fullPage: true });

  // The knocking view fits one screen at 430 wide (Keenan, 2026-11-05): End
  // knocking clears the tab bar, with room for the status bar and home
  // indicator an iPhone 15 Pro Max adds in the installed app (59 + 34 px).
  // Up to six times tonight; more is Keenan's choice and only noted.
  const slotsTonight = await page.getByTestId("session-times").locator("button[data-time]").count();
  for (const size of [{ width: 430, height: 932, inset: 93 }, { width: 390, height: 844, inset: 81 }]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(300);
    const fit = await page.evaluate(() => {
      const end = [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "End knocking");
      const bar = [...document.querySelectorAll('nav[aria-label="Tabs"]')].find((nav) => getComputedStyle(nav).display !== "none");
      return { end: end ? Math.round(end.getBoundingClientRect().bottom + window.scrollY) : null, bar: bar ? Math.round(bar.getBoundingClientRect().top) : null };
    });
    const fits = fit.end !== null && fit.bar !== null && fit.end <= fit.bar - size.inset;
    const detail = `End knocking ends at ${fit.end}, the tab bar starts at ${fit.bar}, ${size.inset} px kept for the phone, ${slotsTonight} times tonight`;
    if (size.width === 430 && slotsTonight <= 6) check("the knocking view fits one screen at 430 x 932, in the installed app", fits, detail);
    else note(`At ${size.width} x ${size.height} the knocking view ${fits ? "fits one screen" : "scrolls a little"} (${detail}).`);
    await page.screenshot({ path: `${out}/m2-session-knocking-${size.width}.png`, fullPage: false });
  }
  await page.setViewportSize(viewport);
  await page.waitForTimeout(300);

  // Fix the start time (Keenan, 2026-11-05): never in the future; any
  // earlier time today saves.
  await page.getByTestId("fix-start").click();
  await page.fill("#fix-start-time", "23:59");
  await page.getByTestId("fix-start-panel").getByRole("button", { name: "Save", exact: true }).click();
  const calgaryMinutes = (Math.floor((Date.now() - 6 * 3600_000) / 60_000) % 1440 + 1440) % 1440;
  if (calgaryMinutes < 23 * 60 + 58) {
    check("a start time in the future is refused, and says so", (await page.getByTestId("fix-start-panel").getByRole("alert").innerText().catch(() => "")).includes("hasn't happened yet"));
  }
  if (calgaryMinutes >= 15) {
    const earlier = calgaryMinutes - 10;
    const hhmm = `${String(Math.floor(earlier / 60)).padStart(2, "0")}:${String(earlier % 60).padStart(2, "0")}`;
    await page.fill("#fix-start-time", hhmm);
    await page.getByTestId("fix-start-panel").getByRole("button", { name: "Save", exact: true }).click();
    await page.getByTestId("fix-start-panel").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const { data: fixedRow } = await admin.from("knock_sessions").select("started_at").eq("id", sessionRow.id).single();
    const fixedCalgary = new Date(new Date(fixedRow?.started_at ?? 0).getTime() - 6 * 3600_000);
    const fixedHhmm = `${String(fixedCalgary.getUTCHours()).padStart(2, "0")}:${String(fixedCalgary.getUTCMinutes()).padStart(2, "0")}`;
    check("fixing the start time saves the earlier time today", fixedHhmm === hhmm, `${fixedHhmm} for ${hhmm}`);
    check("and the time out counts from it", /Out (9|10|11) min\./.test(await page.getByTestId("session-started").innerText()), await page.getByTestId("session-started").innerText());
  } else {
    note("Fixing the start time was not checked: it is within 15 minutes of midnight in Calgary.");
  }

  // 3. New lead: the step notes, a typed address and phone, the Find out
  // questions and the guided photos.
  const { data: noteRow } = await admin.from("settings").select("step_note_at_door, step_note_after_door, step_note_book").eq("id", 1).single();
  const started = Date.now();
  await page.getByRole("link", { name: "New lead" }).first().click();
  await page.waitForURL("**/app/leads/new", { timeout: 20000 });
  await settle(page);
  check("New lead has no separate Book a meeting button: Save and book opens the booking sheet", (await page.getByText(/book a meeting/i).count()) === 0);
  check("the single Door guide is gone from New lead", (await page.getByTestId("door-guide").count()) === 0);
  const notesButton = page.getByTestId("step-notes");
  const notesBox = await notesButton.boundingBox();
  const addressBox = await page.locator("#lead-address").boundingBox();
  check("the ? with what to talk about sits at the top of New lead, above the address", notesBox !== null && addressBox !== null && notesBox.y < addressBox.y);
  await notesButton.click();
  const notesPanel = page.getByRole("dialog", { name: "What to talk about" });
  await notesPanel.waitFor({ timeout: 10000 });
  const notesText = (await notesPanel.innerText()).replace(/\s+/g, " ");
  const squash = (text) => (text ?? "").replace(/\s+/g, " ").trim();
  check(
    "tapping it shows Keenan's three step notes from Settings: At the door, After the door, Book",
    ["At the door", "After the door", "Book"].every((label) => notesText.includes(label)) &&
      [noteRow?.step_note_at_door, noteRow?.step_note_after_door, noteRow?.step_note_book].every((note) => notesText.includes(squash(note).slice(0, 40))),
    notesText.slice(0, 80),
  );
  await page.screenshot({ path: `${out}/m26-step-notes.png`, fullPage: false });
  await notesPanel.getByRole("button", { name: "Close" }).click();
  await page.fill("#lead-address", TYPED_ADDRESS);
  await page.keyboard.press("Escape");
  await page.fill("#lead-first_name", TEST_LEAD);
  await page.fill("#lead-phone", "403 555 0199");
  await page.locator("#lead-phone").blur();
  check("the phone shows in the local format as soon as it is typed", (await page.inputValue("#lead-phone")) === "(403) 555-0199", await page.inputValue("#lead-phone"));

  const legends = (await page.getByTestId("find-out").locator("legend").allTextContents()).map((t) => t.trim());
  check(
    "Find out asks the questions in the order of the door, then the soffit",
    JSON.stringify(legends) === JSON.stringify(["Owns the home", "Wants a price", "Everyone who decides will be there", "Christmas lights now", "Looked into it before", "Which areas", "Timing", "Soffit colour"]),
    legends.join(", "),
  );
  const offeredSoffit = (await question(page, "Soffit colour").locator("label").allTextContents()).map((t) => t.trim());
  check("the soffit question offers White, Off-white or cream, Other and Not sure", JSON.stringify(offeredSoffit) === JSON.stringify(["White", "Off-white or cream", "Other", "Not sure"]), offeredSoffit.join(", "));
  const withNotCollected = await page.getByTestId("find-out").locator("fieldset").evaluateAll((sets) =>
    sets.map((set) => [set.querySelector("legend")?.textContent?.trim(), Boolean(set.querySelector('input[value="not_collected"]'))]),
  );
  check(
    "every counted question offers Not collected, and the soffit keeps Not sure instead",
    withNotCollected.every(([legend, offered]) => (legend === "Soffit colour" ? !offered : offered)) && (await page.getByTestId("phone-not-collected").count()) === 1,
    JSON.stringify(withNotCollected),
  );
  // Answered out of order, as at a real door.
  await answer(page, "Timing", "Before Christmas");
  await answer(page, "Owns the home", "Yes");
  await answer(page, "Which areas", "Front and sides");
  await answer(page, "Wants a price", "Yes");
  await answer(page, "Everyone who decides will be there", "Yes");
  await answer(page, "Soffit colour", "Off-white or cream");
  await answer(page, "Christmas lights now", "Hires someone");
  await answer(page, "Looked into it before", "Got quotes");
  check("each answer takes one tap, in any order", (await checkedValue(page, "Christmas lights now")) === "hires" && (await checkedValue(page, "Owns the home")) === "yes");
  await answer(page, "Christmas lights now", "Hires someone");
  check("tapping an answer again clears it", (await checkedValue(page, "Christmas lights now")) === "");

  const slotLabels = await page.getByRole("list", { name: "Guided photos" }).locator("li").evaluateAll((items) => items.map((item) => item.querySelector("p").textContent.trim()));
  check("the photos are four labelled slots: Front, Left corner, Right corner, Soffit close-up", JSON.stringify(slotLabels) === JSON.stringify(["Front", "Left corner", "Right corner", "Soffit close-up"]), slotLabels.join(", "));
  const slotParts = await Promise.all(
    ["Front", "Left corner", "Right corner", "Soffit close-up"].map(async (label) => [
      await page.getByRole("button", { name: `Take photo, ${label}` }).count(),
      await page.getByRole("button", { name: `Upload a photo from the phone, ${label}` }).count(),
    ]),
  );
  check(
    "each slot keeps the big Take photo button, adds a smaller Upload button, and shows a line drawing of the angle",
    slotParts.every(([take, upload]) => take === 1 && upload === 1) && (await page.locator("main svg[data-guide]").count()) === 4,
    JSON.stringify(slotParts),
  );
  const takeBox = await page.getByRole("button", { name: "Take photo, Front" }).boundingBox();
  const uploadBox = await page.getByRole("button", { name: "Upload a photo from the phone, Front" }).boundingBox();
  check("Upload is the smaller of the two", takeBox && uploadBox && uploadBox.width < takeBox.width, `${uploadBox?.width} vs ${takeBox?.width}`);
  check("the hint sits under the slots", (await page.getByText(SLOT_HINT, { exact: true }).count()) === 1);
  const slotPath = (slot) => page.locator(`input[name="photo_slot_${slot}"]`).inputValue({ timeout: 30000 });
  await page.setInputFiles('[data-testid="slot-input-front"]', fixture);
  const firstFront = await slotPath("front");
  await page.locator('img[alt="Front photo of the house"]').waitFor({ timeout: 20000 });
  check("a slot shows its photo once taken and offers a retake", (await page.getByRole("button", { name: "Retake, Front" }).count()) === 1);
  await page.getByRole("button", { name: "Retake, Front" }).click({ trial: true });
  await page.setInputFiles('[data-testid="slot-input-front"]', fixture);
  await page.waitForFunction((first) => {
    const input = document.querySelector('input[name="photo_slot_front"]');
    return input && input.value && input.value !== first;
  }, firstFront, { timeout: 30000 });
  check("a retake replaces the slot's photo", (await page.locator('input[name="photo_slot_front"]').count()) === 1);
  // Upload takes a photo already on the phone (the input with no camera).
  check("Upload opens the phone's photos, not the camera", (await page.locator('[data-testid="slot-upload-left_corner"]').getAttribute("capture")) === null);
  await page.setInputFiles('[data-testid="slot-upload-left_corner"]', fixture);
  await slotPath("left_corner");
  await page.setInputFiles('[data-testid="slot-input-right_corner"]', fixture);
  await slotPath("right_corner");
  check("More photos is still there for extras", (await page.getByRole("button", { name: "More photos" }).count()) === 1);
  await page.setInputFiles('[data-testid="photo-input"]', fixture);
  await page.waitForFunction(() => document.querySelectorAll('input[name="photo_paths"]').length === 1, null, { timeout: 30000 });
  check("the photos upload while the form is still open", true);
  await page.locator("fieldset", { hasText: "House type" }).getByText("Bungalow", { exact: true }).click();
  await checkTapTargets(page, "New lead");
  const save = page.getByRole("button", { name: "Save lead" });
  const saveBox = await save.boundingBox();
  check("Save sits in the lower half of the screen, within thumb reach", saveBox !== null && saveBox.y > viewport.height / 2 && saveBox.y + saveBox.height <= viewport.height, saveBox ? `${Math.round(saveBox.y)} of ${viewport.height}` : "missing");
  await page.screenshot({ path: `${out}/m2-new-lead.png`, fullPage: false });
  // The cleared question has neither an answer nor Not collected: Save says so first.
  await save.click();
  const stillOpen = (await page.getByTestId("questions-still-open").innerText({ timeout: 10000 }).catch(() => "")).trim();
  check(
    "Save is refused while a question has no answer, naming it, and nothing is saved",
    stillOpen === "Christmas lights now needs an answer, or mark it Not collected." && new URL(page.url()).pathname === "/app/leads/new",
    stillOpen,
  );
  check("the open question says what it needs", (await question(page, "Christmas lights now").getByText("Answer this, or mark it Not collected.").count()) === 1);
  await question(page, "Christmas lights now").getByText("Not collected", { exact: true }).click();
  check("Not collected is one tap, and the notice goes once nothing is open", (await checkedValue(page, "Christmas lights now")) === "not_collected" && (await page.getByTestId("questions-still-open").count()) === 0);
  await save.click();
  await page.waitForURL("**/app/session?added=*", { timeout: 30000 });
  await settle(page);
  const seconds = (Date.now() - started) / 1000;
  check("while knocking, save returns to Session", true, `${seconds.toFixed(1)} s for the scripted flow`);
  check("the scripted new-lead flow takes well under 30 seconds", seconds < 30, `${seconds.toFixed(1)} s`);
  await page.getByTestId("lead-saved").waitFor({ timeout: 10000 });
  check("Session says the lead is saved, and on to the next door", (await page.getByTestId("lead-saved").innerText()).includes("Lead saved. On to the next door."));
  // Session's order while knocking (Keenan, 2026-11-05): the saved line, where
  // and since when, the counters, tonight's open times, New lead and End.
  const tops = await page.evaluate(() => {
    const top = (element) => (element ? Math.round(element.getBoundingClientRect().top + window.scrollY) : null);
    const button = (text) => [...document.querySelectorAll("button, a")].find((el) => el.textContent.trim() === text);
    const doors = [...document.querySelectorAll("button")].find((el) => (el.getAttribute("aria-label") ?? "").startsWith("Add one to doors"));
    return {
      saved: top(document.querySelector('[data-testid="lead-saved"]')),
      heading: top(document.querySelector("main h1")),
      doors: top(doors),
      times: top(document.querySelector('[data-testid="session-times"]')),
      newLead: top(button("New lead")),
      end: top(button("End knocking")),
    };
  });
  const order = [tops.saved, tops.heading, tops.doors, tops.times, tops.newLead];
  check(
    "Session names the saved lead first, then where and since when, the counters, tonight's open times, and New lead beside End knocking",
    order.every((value) => value !== null) && order.every((value, index) => index === 0 || value > order[index - 1]) && tops.end === tops.newLead,
    JSON.stringify(tops),
  );

  const { data: typedLead } = await admin
    .from("leads")
    .select("id, created_by, knock_session_id, phone, lat, lng, place_id, neighbourhood, address_line, status, house_type, soffit_colour, owns_home, wants_price, both_decision_makers, christmas_lights_now, looked_into_before, areas_wanted, install_timing, not_collected, track_colour_id, track_ral_code")
    .eq("created_by", people.a.id)
    .eq("address_line", TYPED_ADDRESS)
    .single();
  check("the lead is saved as New by the setter", typedLead?.status === "new" && typedLead?.created_by === people.a.id);
  check("the lead links to the open knock session", typedLead?.knock_session_id === sessionRow?.id);
  check("the phone is stored as E.164 with Canada as the default", typedLead?.phone === "+14035550199", typedLead?.phone);
  check("a typed address saves without a map position", typedLead?.lat === null && typedLead?.lng === null && typedLead?.place_id === null);
  check("the neighbourhood comes from the knock session", typedLead?.neighbourhood === TEST_PLACE, typedLead?.neighbourhood);
  check("the house type is saved", typedLead?.house_type === "bungalow");
  const savedAnswers = {
    owns_home: typedLead?.owns_home,
    wants_price: typedLead?.wants_price,
    both_decision_makers: typedLead?.both_decision_makers,
    soffit_colour: typedLead?.soffit_colour,
    christmas_lights_now: typedLead?.christmas_lights_now,
    looked_into_before: typedLead?.looked_into_before,
    areas_wanted: typedLead?.areas_wanted,
    install_timing: typedLead?.install_timing,
    not_collected: typedLead?.not_collected,
  };
  check(
    "the answers are saved, everyone who decides included, and the one marked Not collected is stored as such",
    JSON.stringify(savedAnswers) ===
      JSON.stringify({
        owns_home: true,
        wants_price: true,
        both_decision_makers: true,
        soffit_colour: "off_white",
        christmas_lights_now: null,
        looked_into_before: "got_quotes",
        areas_wanted: "front_and_sides",
        install_timing: "before_christmas",
        not_collected: ["christmas_lights_now"],
      }),
    JSON.stringify(savedAnswers),
  );
  check("a setter's new lead has no track colour", typedLead?.track_colour_id === null && typedLead?.track_ral_code === null);
  const { data: photoRows } = await admin.from("lead_photos").select("storage_path, slot").eq("lead_id", typedLead.id).order("created_at");
  const slotsSaved = (photoRows ?? []).map((photo) => photo.slot ?? "extra").sort();
  check("the three slot photos and one extra are attached, each with its slot", JSON.stringify(slotsSaved) === JSON.stringify(["extra", "front", "left_corner", "right_corner"]), slotsSaved.join(", "));
  const frontRow = (photoRows ?? []).find((photo) => photo.slot === "front");
  check("the front slot holds the retake, not the first try", Boolean(frontRow) && frontRow.storage_path !== firstFront);
  if (frontRow) {
    const { data: file } = await admin.storage.from(BUCKET).download(frontRow.storage_path);
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    check("the photo was shrunk to 1600 px on its long edge", meta.width === 1600 && meta.height === 1200, `${meta.width}x${meta.height} from ${fixtureMeta.width}x${fixtureMeta.height}`);
    check("the photo's metadata, such as location, was removed", Boolean(fixtureMeta.exif) && !meta.exif);
    check("the photos sit in the uploader's own folder", photoRows.every((photo) => photo.storage_path.startsWith(`${people.a.id}/`)));
  }

  // 4. Leads: grouping, search, Everyone.
  await page.getByRole("navigation", { name: "Tabs" }).filter({ visible: true }).getByRole("link", { name: "Leads", exact: true }).click();
  await page.waitForURL((u) => new URL(u).pathname === "/app/leads", { timeout: 20000 });
  await settle(page);
  check("the saved lead is on Leads too", (await page.getByText(TYPED_ADDRESS).count()) >= 1);
  await checkTapTargets(page, "Leads");
  await page.screenshot({ path: `${out}/m2-leads.png`, fullPage: true });
  await page.fill('input[name="q"]', "TEST LEAD");
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/q=TEST\+LEAD/, { timeout: 20000 });
  await settle(page);
  check("search by name finds the lead", (await page.getByRole("link", { name: new RegExp(TYPED_ADDRESS.replace(/[()]/g, "\\$&")) }).count()) === 1);
  await page.fill('input[name="q"]', "5550199");
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/q=5550199/, { timeout: 20000 });
  await settle(page);
  check("search by phone digits finds the lead", (await page.getByText(TYPED_ADDRESS).count()) === 1);
  check("Mine does not show another setter's lead", (await page.getByText(OTHER_ADDRESS).count()) === 0);
  await page.goto(`${base}/app/leads?scope=everyone`);
  await settle(page);
  const otherRow = page.getByRole("link", { name: new RegExp(OTHER_ADDRESS.replace(/[()]/g, "\\$&")) });
  check("Everyone shows another setter's lead with who added it", (await otherRow.count()) === 1 && (await otherRow.innerText()).includes("by Live Test B, read only"));
  await otherRow.click();
  await page.waitForURL(`**/app/leads/${bLead.id}`, { timeout: 20000 });
  await settle(page);
  await page.getByText("Read only. This is Live Test B's lead.").waitFor({ timeout: 20000 }).catch(() => {});
  check("another setter's lead opens read only", (await page.getByText("Read only. This is Live Test B's lead.").count()) === 1);
  check("a read-only lead offers no edit, status, note or photo controls", (await page.getByRole("link", { name: "Edit lead" }).count()) + (await page.getByRole("button", { name: /Save status|Add note|Add photo|Take photo|Retake|More photos|Save track colour/ }).count()) === 0);
  await checkTapTargets(page, "another setter's lead, read only");
  await page.screenshot({ path: `${out}/m2-read-only.png`, fullPage: true });

  // 5. Own lead: photo shows, statuses offered, timeline with who and when.
  await page.goto(`${base}/app/leads/${typedLead.id}`);
  await settle(page);
  await page.getByRole("heading", { name: TEST_LEAD }).waitFor({ timeout: 20000 });
  check("the call button shows the formatted phone", (await page.getByRole("link", { name: "Call (403) 555-0199" }).count()) === 1);
  check("a lead with a typed address says it has no map position yet", (await page.getByText("No map position yet.").count()) === 1);
  const image = page.locator('img[alt="Front photo of the house"]');
  await image.waitFor({ timeout: 20000 });
  const loaded = await image.evaluate((el) => new Promise((resolve) => (el.complete ? resolve(el.naturalWidth) : el.addEventListener("load", () => resolve(el.naturalWidth)))));
  check("the front photo shows in its slot on the lead page", loaded > 0, `${loaded} px wide`);
  check("the extra photo shows under More photos", (await page.locator('img[alt="Extra photo 1 of the house"]').count()) === 1);
  const answersShown = (await page.getByTestId("find-out-answers").innerText()).replace(/\s+/g, " ").trim();
  check(
    "the lead page lists the eight questions in order, with Not collected where it was marked, then the soffit",
    answersShown ===
      "Phone (403) 555-0199 Owns the home Yes Wants a price Yes Everyone who decides will be there Yes Christmas lights now Not collected Looked into it before Got quotes Which areas Front and sides Timing Before Christmas Soffit colour Off-white or cream",
    answersShown,
  );
  const completeness = (await page.getByTestId("completeness").innerText()).trim();
  check("the lead page says how complete the lead is: 7 of 8 collected", completeness === "7 of 8 collected", completeness);
  const trackShown = (await page.getByTestId("track-colour").innerText()).replace(/\s+/g, " ").trim();
  check("a setter sees the track colour is not set, and that Keenan sets it", trackShown.startsWith("Not set yet") && trackShown.includes("Keenan sets the track colour."), trackShown);
  check("a setter gets no track colour controls", (await page.getByTestId("track-colour-form").count()) === 0 && (await page.getByRole("button", { name: "Save track colour" }).count()) === 0);
  check("the soffit slot is empty and offers Take photo", (await page.getByRole("button", { name: "Take photo, Soffit close-up" }).count()) === 1);
  await page.setInputFiles('[data-testid="slot-input-soffit"]', fixture);
  await page.getByText("Added the soffit close-up photo.").waitFor({ timeout: 30000 });
  const { data: soffitPhoto } = await admin.from("lead_photos").select("id").eq("lead_id", typedLead.id).eq("slot", "soffit");
  check("a slot photo taken on the lead page goes into its slot, and the timeline names it", soffitPhoto?.length === 1);
  const statusGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^Status$/ }) });
  const offered = (await statusGroup.locator("label").allTextContents()).map((t) => t.trim());
  check("a setter is offered only New, Follow up and Lost", JSON.stringify(offered) === JSON.stringify(["New", "Follow up", "Lost"]), offered.join(", "));
  await checkTapTargets(page, "the lead page");
  await statusGroup.getByText("Follow up", { exact: true }).click();
  const whenGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: "When to follow up?" }) });
  const whenLabels = (await whenGroup.locator("label").allInnerTexts()).map((t) => t.split("\n")[0].trim());
  check("choosing Follow up asks when", JSON.stringify(whenLabels) === JSON.stringify(["Tomorrow", "In 3 days", "Next week", "On a date"]), whenLabels.join(", "));
  await page.getByRole("button", { name: "Save status" }).click();
  await page.getByText("Moved from New to Follow up.").waitFor({ timeout: 20000 });
  const followEntry = page.locator("li", { hasText: "Moved from New to Follow up." });
  check("a status change shows in the timeline with who and when, your own as You", (await followEntry.innerText()).includes("You,"), (await followEntry.innerText()).replace(/\n/g, " | "));
  await page.fill("#lead-note", "TEST note (automated). Come back Thursday.");
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByText("TEST note (automated). Come back Thursday.").waitFor({ timeout: 20000 });
  check("a note shows in the timeline", true);
  const statusAgain = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^Status$/ }) });
  await statusAgain.getByText("Lost", { exact: true }).click();
  const waiting = page.getByRole("button", { name: "Pick why it was lost" });
  check("Lost asks for a reason before it can be saved", (await waiting.count()) === 1 && (await waiting.isDisabled()));
  await page.locator("fieldset", { hasText: "Why was it lost?" }).getByText("Price", { exact: true }).click();
  await page.getByRole("button", { name: "Save status" }).click();
  await page.getByText("Moved from Follow up to Lost. Reason: price.").waitFor({ timeout: 20000 });
  check("Lost with a reason shows in the timeline", true);
  await page.screenshot({ path: `${out}/m2-lead-page.png`, fullPage: true });
  const { data: events } = await admin
    .from("lead_events")
    .select("type, actor_id")
    .eq("lead_id", typedLead.id)
    .order("created_at");
  check(
    "the database timeline holds created, five photos, two status changes and the note, all by the setter",
    JSON.stringify(events?.map((e) => e.type).sort()) ===
      JSON.stringify(["created", "note", "photo_added", "photo_added", "photo_added", "photo_added", "photo_added", "status_change", "status_change"]) &&
      events.every((e) => e.actor_id === people.a.id),
    events?.map((e) => e.type).join(","),
  );

  // 5b. Edit lead keeps the answers and changes them.
  await page.goto(`${base}/app/leads/${typedLead.id}/edit`);
  await settle(page);
  await page.getByRole("heading", { name: "Edit lead" }).waitFor({ timeout: 20000 });
  const prefilled = [
    await checkedValue(page, "Owns the home"),
    await checkedValue(page, "Wants a price"),
    await checkedValue(page, "Everyone who decides will be there"),
    await checkedValue(page, "Soffit colour"),
    await checkedValue(page, "Christmas lights now"),
    await checkedValue(page, "Looked into it before"),
    await checkedValue(page, "Which areas"),
    await checkedValue(page, "Timing"),
  ];
  check(
    "Edit lead opens with the saved answers, Not collected included",
    JSON.stringify(prefilled) === JSON.stringify(["yes", "yes", "yes", "off_white", "not_collected", "got_quotes", "front_and_sides", "before_christmas"]),
    prefilled.join(", "),
  );
  check("Edit lead has no photo slots; photos are added on the lead page", (await page.getByRole("list", { name: "Guided photos" }).count()) === 0);
  await answer(page, "Christmas lights now", "None");
  await question(page, "Timing").getByText("Not collected", { exact: true }).click();
  await checkTapTargets(page, "Edit lead with Find out");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`**/app/leads/${typedLead.id}`, { timeout: 30000 });
  await settle(page);
  const editedLine = "Updated Find out: Christmas lights now, timing and what wasn't collected.";
  await page.getByText(editedLine).waitFor({ timeout: 20000 }).catch(() => {});
  check("the timeline names the changed questions, not the answers", (await page.getByText(editedLine).count()) === 1);
  const { data: edited } = await admin.from("leads").select("christmas_lights_now, install_timing, owns_home, not_collected").eq("id", typedLead.id).single();
  check(
    "an answer replaces Not collected, and a question marked Not collected is stored as such",
    edited?.christmas_lights_now === "none" && edited?.install_timing === null && edited?.owns_home === true && JSON.stringify(edited?.not_collected) === JSON.stringify(["install_timing"]),
    JSON.stringify(edited),
  );

  // 5c. Once Keenan sets a custom track colour, the setter sees it by name.
  // The service role stands in for him here; the walk-through never signs in as him.
  await admin.from("leads").update({ track_ral_code: "7016" }).eq("id", typedLead.id);
  await page.reload();
  await settle(page);
  const customShown = (await page.getByTestId("track-colour").innerText()).replace(/\s+/g, " ").trim();
  check("a setter sees a custom track colour by its RAL name, as needing powder coating", customShown.startsWith("Custom, RAL 7016 Anthracite grey Needs powder coating."), customShown);
  check("no colour swatch is shown", (await page.locator('[data-testid="track-colour"] [style*="background"]').count()) === 0);
  await page.screenshot({ path: `${out}/m26-lead-page.png`, fullPage: true });

  // 6. Google address path and the duplicate warning.
  if (!mapsKey) {
    check("Google address suggestions can be tested", false, "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set in this environment");
  } else {
    await page.goto(`${base}/app/leads/new`);
    await settle(page);
    await page.fill("#lead-address", GOOGLE_QUERY);
    const firstOption = page.getByRole("option").first();
    await firstOption.waitFor({ timeout: 15000 });
    const suggestion = (await firstOption.innerText()).replace(/\n/g, " ");
    await checkTapTargets(page, "New lead with address suggestions open");
    check("Google suggestions carry the Powered by Google credit", (await page.getByText("Powered by Google").count()) === 1);
    await firstOption.click();
    await page.getByText("Map position saved.").waitFor({ timeout: 15000 });
    const picked = {
      address: await page.inputValue("#lead-address"),
      neighbourhood: await page.inputValue("#lead-neighbourhood"),
      lat: await page.inputValue('input[name="lat"]'),
      lng: await page.inputValue('input[name="lng"]'),
      place: await page.inputValue('input[name="place_id"]'),
    };
    check("picking a suggestion fills the address, neighbourhood and map position", Boolean(picked.address && picked.neighbourhood && picked.lat && picked.lng && picked.place), JSON.stringify({ suggestion, ...picked, place: picked.place ? "set" : "" }));
    note(`Google gave "${picked.neighbourhood}" as the neighbourhood for "${suggestion}"${picked.neighbourhood === TEST_PLACE ? ", which is the knock session fallback" : ""}.`);
    await page.fill("#lead-first_name", TEST_LEAD);
    await page.getByTestId("mark-rest").click();
    await page.getByRole("button", { name: "Save lead" }).click();
    await page.waitForURL("**/app/session?added=*", { timeout: 30000 });
    await settle(page);
    const { data: googleLead } = await admin
      .from("leads")
      .select("id, lat, lng, place_id, address_line, city")
      .eq("created_by", people.a.id)
      .not("place_id", "is", null)
      .single();
    check("the picked address saves with its map position", googleLead?.lat !== null && googleLead?.lng !== null && googleLead?.place_id === picked.place, JSON.stringify({ address: googleLead?.address_line, city: googleLead?.city }));
    googleLeadId = googleLead?.id ?? null;

    await page.goto(`${base}/app/leads/new`);
    await settle(page);
    await page.fill("#lead-address", GOOGLE_QUERY);
    await page.getByRole("option").first().waitFor({ timeout: 15000 });
    await page.getByRole("option").first().click();
    await page.getByText("This address already has a lead.").waitFor({ timeout: 15000 });
    const warning = page.locator('[role="status"]', { hasText: "This address already has a lead." });
    check("picking an address that already has a lead shows who has it", (await warning.innerText()).includes(TEST_LEAD) && (await warning.innerText()).includes("added by Live Test A"), (await warning.innerText()).replace(/\n/g, " | "));
    check("the warning links to that lead", (await warning.getByRole("link").getAttribute("href")) === `/app/leads/${googleLead?.id}`);
    await page.screenshot({ path: `${out}/m2-duplicate-warning.png`, fullPage: false });
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByTestId("discard-lead").getByRole("button", { name: "Discard" }).click();
    await page.waitForURL("**/app/leads", { timeout: 20000 });
    await settle(page);

    // The typed lead gets its map position once its address is picked.
    await page.goto(`${base}/app/leads/${typedLead.id}/edit`);
    await settle(page);
    await page.getByRole("heading", { name: "Edit lead" }).waitFor({ timeout: 20000 });
    await checkTapTargets(page, "Edit lead");
    await page.fill("#lead-address", GOOGLE_QUERY);
    await page.getByRole("option").first().waitFor({ timeout: 15000 });
    await page.getByRole("option").first().click();
    await page.getByText("Map position saved.").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(`**/app/leads/${typedLead.id}`, { timeout: 30000 });
    await settle(page);
    const { data: placed } = await admin.from("leads").select("lat, lng, place_id").eq("id", typedLead.id).single();
    check("a typed address gets its map position once it is picked from the suggestions", placed?.lat !== null && placed?.lng !== null && placed?.place_id === picked.place);
    await page.getByRole("heading", { name: TEST_LEAD }).waitFor({ timeout: 20000 });
    check("the lead page then drops the no map position note", (await page.getByText("No map position yet.").count()) === 0);
    await page.getByText(/^Changed the .*address.*map position/).waitFor({ timeout: 20000 }).catch(() => {});
    check("the timeline says the address and map position changed", (await page.getByText(/^Changed the .*address.*map position/).count()) === 1);
  }

  // 7. Active hides Lost; All groups by status, newest first within a group.
  await page.goto(`${base}/app/leads`);
  await settle(page);
  const activeHeadings = (await page.getByRole("heading", { level: 2 }).allTextContents()).map((t) => t.trim());
  check("Leads opens to Active, which leaves Lost out", !activeHeadings.some((h) => h.startsWith("Lost")), activeHeadings.join(", "));
  await page.goto(`${base}/app/leads?view=all`);
  await settle(page);
  const headings = (await page.getByRole("heading", { level: 2 }).allTextContents()).map((t) => t.trim());
  check("All groups by status in status order", headings[headings.length - 1] === "Lost (1)" && (!mapsKey || headings[0] === "New (1)"), headings.join(", "));
  if (googleLeadId) {
    // Everyone's New group holds B's lead and A's later Google lead.
    await page.goto(`${base}/app/leads?scope=everyone&view=all`);
    await settle(page);
    const order = await page.locator('section[aria-labelledby="group-new"] a').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const newer = order.indexOf(`/app/leads/${googleLeadId}`);
    const older = order.indexOf(`/app/leads/${bLead.id}`);
    check("within a group the newest lead comes first", newer !== -1 && older !== -1 && newer < older, `positions ${newer} and ${older}`);
  }
  await page.goto(`${base}/app/session`);
  await settle(page);
  await page.getByRole("button", { name: "End knocking" }).click();
  await page.getByRole("button", { name: "Yes, end it" }).click();
  await page.getByTestId("session-summary").waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Start knocking" }).waitFor({ timeout: 20000 });
  const { data: ended } = await admin.from("knock_sessions").select("ended_at, doors_knocked, conversations").eq("id", sessionRow.id).single();
  const { count: linked } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("knock_session_id", sessionRow.id);
  check("ending the session stamps its end", ended?.ended_at !== null);
  check("every lead added during the session is linked to it", linked === (mapsKey ? 2 : 1), `${linked} linked`);
  const summaryText = (await page.getByTestId("session-summary").innerText()).replace(/\s+/g, " ");
  check(
    "End knocking shows a short summary: time out, doors, conversations, leads and bookings",
    summaryText.includes(`Done in ${TEST_PLACE}`) && /Out \d/.test(summaryText) && summaryText.includes(`Doors ${ended?.doors_knocked}`) &&
      summaryText.includes(`Conversations ${ended?.conversations}`) && summaryText.includes(`Leads ${linked}`) && summaryText.includes("Bookings 0"),
    summaryText,
  );
  const summaryBox = await page.getByTestId("session-summary").boundingBox();
  check("the summary shows at the top of the screen, not scrolled away", summaryBox !== null && summaryBox.y >= 0 && summaryBox.y < viewport.height / 2, summaryBox ? `${Math.round(summaryBox.y)}` : "missing");
  check("Start knocking offers the neighbourhood just knocked", (await page.inputValue("#knock-neighbourhood")) === TEST_PLACE && (await page.getByRole("group", { name: "Recent neighbourhoods" }).getByRole("button", { name: TEST_PLACE }).count()) === 1);
  await page.screenshot({ path: `${out}/m2-session-summary.png`, fullPage: false });

  // 8. New lead's save, its answer lost to the signal (2026-11-04). The
  // server makes the lead and the answer never reaches the phone: the form
  // stays as typed and says so, and Save again sends the same save key and
  // gets back that lead, brought up to date, never a copy.
  const ONCE_ADDRESS = "301 Testing Lane NW (TEST)";
  const onceLeads = async () =>
    (await admin.from("leads").select("id, save_key, last_name").eq("created_by", people.a.id).eq("address_line", ONCE_ADDRESS)).data ?? [];
  await page.goto(`${base}/app/leads/new`);
  await settle(page);
  await page.fill("#lead-address", ONCE_ADDRESS);
  await page.fill("#lead-first_name", TEST_LEAD);
  await page.getByTestId("mark-rest").click();
  const saveTry = { drop: true, seen: 0 };
  const stopDropping = await interceptFetches(page, (request, stage) => {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/app/leads/new") return null;
    if (request.body && !request.body.includes(ONCE_ADDRESS)) return null;
    if (stage === "request") saveTry.seen += 1;
    return saveTry.drop && stage === "response" ? "drop" : null;
  });
  await page.getByRole("button", { name: "Save lead" }).click();
  const lostMessage = page.getByRole("alert").filter({ hasText: "No answer, so it may have saved." });
  await lostMessage.waitFor({ timeout: 30000 });
  const madeOnce = await onceLeads();
  check(
    "New lead's save with its answer lost: the server made the lead once, and the form stays as typed and says Save again won't make a copy",
    madeOnce.length === 1 &&
      Boolean(madeOnce[0].save_key) &&
      new URL(page.url()).pathname === "/app/leads/new" &&
      (await page.inputValue("#lead-first_name")) === TEST_LEAD &&
      (await lostMessage.innerText()).trim() === "No answer, so it may have saved. Tap Save again once you have signal: it won't make a copy." &&
      saveTry.seen === 1,
    `${madeOnce.length} lead(s)`,
  );
  await page.fill("#lead-last_name", "Once");
  saveTry.drop = false;
  await page.getByRole("button", { name: "Save lead" }).click();
  await page.waitForURL("**/app/**added=*", { timeout: 30000 });
  await stopDropping();
  await settle(page);
  const keptOnce = await onceLeads();
  const { count: createdEvents } = await admin
    .from("lead_events")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", madeOnce[0]?.id ?? "00000000-0000-0000-0000-000000000000")
    .eq("type", "created");
  check(
    "Save again gets back the same lead with what was added since, never a copy",
    keptOnce.length === 1 &&
      keptOnce[0].id === madeOnce[0]?.id &&
      keptOnce[0].last_name === "Once" &&
      new URL(page.url()).searchParams.get("added") === keptOnce[0].id &&
      createdEvents === 1 &&
      saveTry.seen === 2,
    `${keptOnce.length} lead(s), ${createdEvents} created event(s), ${saveTry.seen} saves`,
  );

  // 9. New lead's save with no answer at all (2026-11-04): the answer hangs,
  // as on a stalled signal. Within the 25-second answer limit the form says
  // the same as a lost answer, instead of Saving for ever. Once the stalled
  // request finally drops, Save again gets back the lead the server made.
  const HANG_ADDRESS = "303 Testing Lane NW (TEST)";
  const hangLeads = async () =>
    (await admin.from("leads").select("id").eq("created_by", people.a.id).eq("address_line", HANG_ADDRESS)).data ?? [];
  await page.goto(`${base}/app/leads/new`);
  await settle(page);
  await page.fill("#lead-address", HANG_ADDRESS);
  await page.fill("#lead-first_name", TEST_LEAD);
  await page.getByTestId("mark-rest").click();
  const hang = { hold: true, seen: 0 };
  const stopHanging = await interceptFetches(page, (request, stage) => {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/app/leads/new") return null;
    if (request.body && !request.body.includes(HANG_ADDRESS)) return null;
    if (stage === "request") hang.seen += 1;
    return hang.hold && stage === "response" ? "hold" : null;
  });
  const startedAt = Date.now();
  await page.getByRole("button", { name: "Save lead" }).click();
  const hungMessage = page.getByRole("alert").filter({ hasText: "No answer, so it may have saved." });
  await hungMessage.waitFor({ timeout: 45000 }).catch(() => {});
  const waited = Math.round((Date.now() - startedAt) / 1000);
  const shownAfterHang = (await hungMessage.count()) === 1;
  const saveAgain = page.getByRole("button", { name: "Save lead" });
  const saveBack = (await saveAgain.count()) === 1 && (await saveAgain.isEnabled());
  const madeWhileHung = await hangLeads();
  check(
    "New lead's save with no answer at all: at the 25-second limit the form says it may have saved, with Save back, instead of Saving for ever",
    shownAfterHang && waited >= 24 && waited <= 40 && saveBack && stopHanging.held() === 1 && madeWhileHung.length === 1,
    `${shownAfterHang ? "message" : "no message"} after ${waited} s; Save ${saveBack ? "back" : "not back"}; ${madeWhileHung.length} lead(s)`,
  );
  // The stalled request finally drops, as when the signal comes back.
  hang.hold = false;
  await stopHanging.release("fail");
  await page.getByRole("button", { name: "Save lead" }).click();
  await page.waitForURL("**/app/**added=*", { timeout: 30000 });
  await stopHanging();
  await settle(page);
  const keptAfterHang = await hangLeads();
  check(
    "once the stalled request drops, Save again gets back the lead the server made: one lead",
    keptAfterHang.length === 1 &&
      keptAfterHang[0].id === madeWhileHung[0]?.id &&
      new URL(page.url()).searchParams.get("added") === keptAfterHang[0].id &&
      hang.seen === 2,
    `${keptAfterHang.length} lead(s), ${hang.seen} saves`,
  );
} catch (error) {
  results.push(`SCRIPT ERROR ${error?.message ?? String(error)} at ${page.url()}`);
  await page.screenshot({ path: `${out}/m2-failure.png`, fullPage: true }).catch(() => {});
} finally {
  for (const person of Object.values(people)) {
    if (person.id) await removeEverythingOf(person.id);
  }
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const leftoverUsers = (list?.users ?? []).filter((u) => (u.email ?? "").startsWith("m2-live-"));
  const { count: leftoverLeads } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("first_name", TEST_LEAD);
  check("the throwaway setters, their leads, sessions and photos are gone", leftoverUsers.length === 0 && leftoverLeads === 0, `${leftoverUsers.length} accounts, ${leftoverLeads} test leads left`);
  results.push(`accounts remaining: ${JSON.stringify((list?.users ?? []).map((u) => u.email))}`);
  await browser.close();
}

console.log(results.join("\n"));
process.exit(results.some((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")) ? 1 : 0);
