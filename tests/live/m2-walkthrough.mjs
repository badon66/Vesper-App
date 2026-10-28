// Live walk-through of M2 on a phone-sized screen against a running
// production build: the knock session counters, a new lead with a typed
// address, phone and photo, search, the Everyone view, the status rules and
// the timeline, tap-target sizes, and the Google address path with the
// duplicate warning. Two throwaway setters do the work. Their leads are named
// "TEST LEAD (automated)" so a real setter who sees one knows to ignore it,
// and everything they create is deleted at the end of the run.
//
// Run with `npm run test:live` after `npm run build`. Needs the three
// Supabase variables; the Google key is needed for the address path.
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import sharp from "sharp";

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
  }
  const bClient = createClient(url, anonKey, noSession);
  await bClient.auth.signInWithPassword({ email: people.b.email, password: people.b.password });
  const { data: bLead, error: bLeadError } = await bClient
    .from("leads")
    .insert({ first_name: TEST_LEAD, address_line: OTHER_ADDRESS, neighbourhood: TEST_PLACE, phone: "+14035550100", created_by: people.b.id })
    .select("id")
    .single();
  if (bLeadError) throw new Error(`B's lead: ${bLeadError.message}`);

  // 1. Sign in and start a knock session.
  await page.goto(`${base}/login`);
  await page.fill("#email", people.a.email);
  await page.fill("#password", people.a.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 20000 });
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
  await checkTapTargets(page, "Home with a session running");
  await page.screenshot({ path: `${out}/m2-home-session.png`, fullPage: true });

  // 3. New lead with a typed address, phone and photo.
  const started = Date.now();
  await page.getByRole("link", { name: "New lead" }).first().click();
  await page.waitForURL("**/app/leads/new", { timeout: 20000 });
  check("there is no Book a meeting button before M3", (await page.getByText(/book a meeting/i).count()) === 0);
  await page.fill("#lead-address", TYPED_ADDRESS);
  await page.keyboard.press("Escape");
  await page.fill("#lead-first_name", TEST_LEAD);
  await page.fill("#lead-phone", "403 555 0199");
  await page.locator("#lead-phone").blur();
  check("the phone shows in the local format as soon as it is typed", (await page.inputValue("#lead-phone")) === "(403) 555-0199", await page.inputValue("#lead-phone"));
  await page.setInputFiles('[data-testid="photo-input"]', fixture);
  await page.waitForFunction(() => document.querySelectorAll('input[name="photo_paths"]').length === 1, null, { timeout: 30000 });
  check("the photo uploads while the form is still open", true);
  await page.locator("fieldset", { hasText: "House type" }).getByText("Bungalow", { exact: true }).click();
  await page.locator("fieldset", { hasText: "Soffit colour" }).getByText("White", { exact: true }).click();
  await checkTapTargets(page, "New lead");
  const save = page.getByRole("button", { name: "Save lead" });
  const saveBox = await save.boundingBox();
  check("Save sits in the lower half of the screen, within thumb reach", saveBox !== null && saveBox.y > viewport.height / 2 && saveBox.y + saveBox.height <= viewport.height, saveBox ? `${Math.round(saveBox.y)} of ${viewport.height}` : "missing");
  await page.screenshot({ path: `${out}/m2-new-lead.png`, fullPage: false });
  await save.click();
  await page.waitForURL("**/app/leads?added=*", { timeout: 30000 });
  const seconds = (Date.now() - started) / 1000;
  check("save returns to Leads", true, `${seconds.toFixed(1)} s for the scripted flow`);
  check("the scripted new-lead flow takes well under 30 seconds", seconds < 30, `${seconds.toFixed(1)} s`);
  await page.getByText("Lead saved.").waitFor({ timeout: 10000 });

  const { data: typedLead } = await admin
    .from("leads")
    .select("id, created_by, knock_session_id, phone, lat, lng, place_id, neighbourhood, address_line, status, house_type, soffit_colour")
    .eq("created_by", people.a.id)
    .eq("address_line", TYPED_ADDRESS)
    .single();
  check("the lead is saved as New by the setter", typedLead?.status === "new" && typedLead?.created_by === people.a.id);
  check("the lead links to the open knock session", typedLead?.knock_session_id === sessionRow?.id);
  check("the phone is stored as E.164 with Canada as the default", typedLead?.phone === "+14035550199", typedLead?.phone);
  check("a typed address saves without a map position", typedLead?.lat === null && typedLead?.lng === null && typedLead?.place_id === null);
  check("the neighbourhood comes from the knock session", typedLead?.neighbourhood === TEST_PLACE, typedLead?.neighbourhood);
  check("house type and soffit colour are saved", typedLead?.house_type === "bungalow" && typedLead?.soffit_colour === "white");
  const { data: photoRows } = await admin.from("lead_photos").select("storage_path").eq("lead_id", typedLead.id);
  check("one photo is attached to the lead", photoRows?.length === 1);
  if (photoRows?.length === 1) {
    const { data: file } = await admin.storage.from(BUCKET).download(photoRows[0].storage_path);
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    check("the photo was shrunk to 1600 px on its long edge", meta.width === 1600 && meta.height === 1200, `${meta.width}x${meta.height} from ${fixtureMeta.width}x${fixtureMeta.height}`);
    check("the photo's metadata, such as location, was removed", Boolean(fixtureMeta.exif) && !meta.exif);
    check("the photo sits in the uploader's own folder", photoRows[0].storage_path.startsWith(`${people.a.id}/`));
  }

  // 4. Leads: grouping, search, Everyone.
  await checkTapTargets(page, "Leads");
  await page.screenshot({ path: `${out}/m2-leads.png`, fullPage: true });
  await page.fill('input[name="q"]', "TEST LEAD");
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/q=TEST\+LEAD/, { timeout: 20000 });
  check("search by name finds the lead", (await page.getByRole("link", { name: new RegExp(TYPED_ADDRESS.replace(/[()]/g, "\\$&")) }).count()) === 1);
  await page.fill('input[name="q"]', "5550199");
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/q=5550199/, { timeout: 20000 });
  check("search by phone digits finds the lead", (await page.getByText(TYPED_ADDRESS).count()) === 1);
  check("Mine does not show another setter's lead", (await page.getByText(OTHER_ADDRESS).count()) === 0);
  await page.goto(`${base}/app/leads?scope=everyone`);
  const otherRow = page.getByRole("link", { name: new RegExp(OTHER_ADDRESS.replace(/[()]/g, "\\$&")) });
  check("Everyone shows another setter's lead with who added it", (await otherRow.count()) === 1 && (await otherRow.innerText()).includes("by Live Test B, read only"));
  await otherRow.click();
  await page.waitForURL(`**/app/leads/${bLead.id}`, { timeout: 20000 });
  check("another setter's lead opens read only", (await page.getByText("Read only. This is Live Test B's lead.").count()) === 1);
  check("a read-only lead offers no edit, status or note controls", (await page.getByRole("link", { name: "Edit lead" }).count()) + (await page.getByRole("button", { name: /Save status|Add note|Add photo/ }).count()) === 0);
  await page.screenshot({ path: `${out}/m2-read-only.png`, fullPage: true });

  // 5. Own lead: photo shows, statuses offered, timeline with who and when.
  await page.goto(`${base}/app/leads/${typedLead.id}`);
  await page.getByRole("heading", { name: TEST_LEAD }).waitFor({ timeout: 20000 });
  check("the call button shows the formatted phone", (await page.getByRole("link", { name: "Call (403) 555-0199" }).count()) === 1);
  const image = page.locator('img[alt="Photo 1 of the house"]');
  await image.waitFor({ timeout: 20000 });
  const loaded = await image.evaluate((el) => new Promise((resolve) => (el.complete ? resolve(el.naturalWidth) : el.addEventListener("load", () => resolve(el.naturalWidth)))));
  check("the photo shows on the lead page", loaded > 0, `${loaded} px wide`);
  const statusGroup = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^Status$/ }) });
  const offered = (await statusGroup.locator("label").allTextContents()).map((t) => t.trim());
  check("a setter is offered only New, Follow up and Lost", JSON.stringify(offered) === JSON.stringify(["New", "Follow up", "Lost"]), offered.join(", "));
  await checkTapTargets(page, "the lead page");
  await statusGroup.getByText("Follow up", { exact: true }).click();
  await page.getByRole("button", { name: "Save status" }).click();
  await page.getByText("Moved from New to Follow up.").waitFor({ timeout: 20000 });
  const followEntry = page.locator("li", { hasText: "Moved from New to Follow up." });
  check("a status change shows in the timeline with who and when", (await followEntry.innerText()).includes("Live Test A,"), (await followEntry.innerText()).replace(/\n/g, " | "));
  await page.fill("#lead-note", "TEST note (automated). Come back Thursday.");
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByText("TEST note (automated). Come back Thursday.").waitFor({ timeout: 20000 });
  check("a note shows in the timeline", true);
  const statusAgain = page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^Status$/ }) });
  await statusAgain.getByText("Lost", { exact: true }).click();
  await page.getByRole("button", { name: "Save status" }).click();
  await page.getByText("Pick a reason for Lost.").waitFor({ timeout: 20000 });
  check("Lost asks for a reason", true);
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
    "the database timeline holds created, photo, two status changes and the note, all by the setter",
    JSON.stringify(events?.map((e) => e.type).sort()) === JSON.stringify(["created", "note", "photo_added", "status_change", "status_change"]) &&
      events.every((e) => e.actor_id === people.a.id),
    events?.map((e) => e.type).join(","),
  );

  // 6. Google address path and the duplicate warning.
  if (!mapsKey) {
    check("Google address suggestions can be tested", false, "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set in this environment");
  } else {
    await page.goto(`${base}/app/leads/new`);
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
    await page.getByRole("button", { name: "Save lead" }).click();
    await page.waitForURL("**/app/leads?added=*", { timeout: 30000 });
    const { data: googleLead } = await admin
      .from("leads")
      .select("id, lat, lng, place_id, address_line, city")
      .eq("created_by", people.a.id)
      .not("place_id", "is", null)
      .single();
    check("the picked address saves with its map position", googleLead?.lat !== null && googleLead?.lng !== null && googleLead?.place_id === picked.place, JSON.stringify({ address: googleLead?.address_line, city: googleLead?.city }));
    googleLeadId = googleLead?.id ?? null;

    await page.goto(`${base}/app/leads/new`);
    await page.fill("#lead-address", GOOGLE_QUERY);
    await page.getByRole("option").first().waitFor({ timeout: 15000 });
    await page.getByRole("option").first().click();
    await page.getByText("This address already has a lead.").waitFor({ timeout: 15000 });
    const warning = page.locator('[role="status"]', { hasText: "This address already has a lead." });
    check("picking an address that already has a lead shows who has it", (await warning.innerText()).includes(TEST_LEAD) && (await warning.innerText()).includes("added by Live Test A"), (await warning.innerText()).replace(/\n/g, " | "));
    check("the warning links to that lead", (await warning.getByRole("link").getAttribute("href")) === `/app/leads/${googleLead?.id}`);
    await page.screenshot({ path: `${out}/m2-duplicate-warning.png`, fullPage: false });
    await page.getByRole("link", { name: "Cancel" }).click();
    await page.waitForURL("**/app/leads", { timeout: 20000 });
  }

  // 7. Grouping on Leads, newest first within a group, then end the session.
  await page.goto(`${base}/app/leads`);
  const headings = (await page.getByRole("heading", { level: 2 }).allTextContents()).map((t) => t.trim());
  check("Leads groups by status in status order", headings[headings.length - 1] === "Lost (1)" && (!mapsKey || headings[0] === "New (1)"), headings.join(", "));
  if (googleLeadId) {
    // Everyone's New group holds B's lead and A's later Google lead.
    await page.goto(`${base}/app/leads?scope=everyone`);
    const order = await page.locator('section[aria-labelledby="group-new"] a').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const newer = order.indexOf(`/app/leads/${googleLeadId}`);
    const older = order.indexOf(`/app/leads/${bLead.id}`);
    check("within a group the newest lead comes first", newer !== -1 && older !== -1 && newer < older, `positions ${newer} and ${older}`);
  }
  await page.goto(`${base}/app`);
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Yes, end it" }).click();
  await page.getByRole("button", { name: "Start knocking" }).waitFor({ timeout: 20000 });
  const { data: ended } = await admin.from("knock_sessions").select("ended_at").eq("id", sessionRow.id).single();
  const { count: linked } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("knock_session_id", sessionRow.id);
  check("ending the session stamps its end", ended?.ended_at !== null);
  check("every lead added during the session is linked to it", linked === (mapsKey ? 2 : 1), `${linked} linked`);
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
