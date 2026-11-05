// Live walk-through of "Use where I'm standing" (round 3, Keenan,
// 2026-11-05: in the field it seemed to do nothing), on New lead at a
// setter's phone size. It shows working at once, keeps listening past rough
// readings and takes the first within 50 m, and ends every other way with a
// clear reason: location off (with the iPhone steps), still too rough after
// 15 seconds, and only an area-sized reading (Precise Location off, with its
// steps). The phone's position comes from the browser's own geolocation, set
// by the test. The nearest-address lookup needs Google's key, which only the
// live site has; there it's checked after the deploy. A throwaway TEST
// setter is made and deleted; nothing is saved.
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";

const base = process.env.BASE ?? "http://localhost:3300";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("The location walk-through needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const stamp = Date.now().toString(36);
const person = { email: `location-live-${stamp}@example.com`, password: `birch-lantern-cove-${String(Date.now() % 10000).padStart(4, "0")}` };
const CALGARY = { latitude: 51.0447, longitude: -114.0719 };

// The browser first, then the throwaway setter, inside the try whose
// finally deletes it, so a browser that fails to start never leaves an
// account behind on production.
const browser = await chromium.launch();
let userId = null;
const text = (locator) => locator.innerText().then((value) => value.replace(/\s+/g, " ").trim()).catch(() => "");
async function newLead(context) {
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.fill("#email", person.email);
  await page.fill("#password", person.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30000 });
  await page.goto(`${base}/app/leads/new`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "Use where I'm standing" }).waitFor({ timeout: 20000 });
  return page;
}
const status = (page) => text(page.getByTestId("position-status"));
const button = (page) => page.getByTestId("use-my-position").getByRole("button");

try {
  const { data: made, error } = await admin.auth.admin.createUser({
    email: person.email,
    password: person.password,
    email_confirm: true,
    user_metadata: { full_name: "TEST Location" },
    app_metadata: { role: "sales" },
  });
  if (error) throw error;
  userId = made.user.id;
  await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", userId);

  // 1. Location off: the reason at once, with the iPhone steps.
  {
    const context = await browser.newContext({ ...devices["iPhone 13"], permissions: [] });
    const page = await newLead(context);
    await button(page).click();
    await page.getByTestId("position-problem").waitFor({ timeout: 10000 });
    const said = await text(page.getByTestId("position-problem"));
    check(
      "with location off, it says so at once with the iPhone steps: Location Services, Safari Websites with Precise Location, Safari's Location",
      said.startsWith("Location is off for Vesper.") && /Privacy & Security/.test(said) && /Safari Websites/.test(said) && /Precise Location/.test(said) && /Apps, then Safari, then Location/.test(said),
      said.slice(0, 160),
    );
    check("and the button offers to try again", ((await button(page).innerText()).trim()) === "Try again");
    await context.close();
  }

  // 2. A rough first reading, then a good one: it keeps listening and takes it.
  {
    const context = await browser.newContext({ ...devices["iPhone 13"], permissions: ["geolocation"], geolocation: { ...CALGARY, accuracy: 220 } });
    const page = await newLead(context);
    const started = Date.now();
    await button(page).click();
    const atOnce = await status(page);
    check("the moment it's tapped, it says it's finding where you are", atOnce.startsWith("Finding where you are"), atOnce);
    await page.waitForFunction(() => document.querySelector('[data-testid="position-status"]')?.textContent?.includes("220 m so far"), null, { timeout: 8000 }).catch(() => {});
    const rough = await status(page);
    check("a rough first reading isn't turned away: it shows how close it is and keeps listening", rough.includes("about 220 m so far, getting closer") && (await button(page).getAttribute("aria-disabled")) === "true" && (await button(page).innerText()).includes("up to 15 seconds"), rough);
    await context.setGeolocation({ ...CALGARY, accuracy: 8 });
    await page.getByText(/Position saved from this phone at the door, accurate to about 8 m\./).waitFor({ timeout: 15000 });
    const took = Date.now() - started;
    check("then the first reading within 50 m is taken, and it says the position saved", took < 15000, `${(took / 1000).toFixed(1)} s`);
    // The nearest address from Google, when this site's key may ask it;
    // otherwise it asks for the house number and street. Either way the
    // position stays saved and nothing typed is ever written over.
    await page.waitForFunction(() => document.querySelector('[data-testid="nearest-address"]')?.getAttribute("data-state") !== "looking", null, { timeout: 15000 }).catch(() => {});
    const state = await page.getByTestId("nearest-address").getAttribute("data-state").catch(() => null);
    const nearest = await text(page.getByTestId("nearest-address"));
    const filled = await page.inputValue("#lead-address");
    check(
      "after the position, the empty address is filled in with the nearest address to check, or it asks for the house number and street",
      (state === "filled" && filled.trim() !== "" && /Check the house number|add the house number/i.test(nearest)) || (state === "none" && nearest === "Type the house number and street."),
      `${state}: ${nearest}${state === "filled" ? ` (${filled})` : ""}`,
    );
    await context.close();
  }

  // 3. Readings that stay rough: after 15 seconds, how close it got and what to do.
  {
    const context = await browser.newContext({ ...devices["iPhone 13"], permissions: ["geolocation"], geolocation: { ...CALGARY, accuracy: 90 } });
    const page = await newLead(context);
    await button(page).click();
    await page.getByTestId("position-problem").waitFor({ timeout: 20000 });
    const said = await text(page.getByTestId("position-problem"));
    check("readings that stay rough end after about 15 seconds with how close it got and to step away from the house", said.startsWith("It only got to about 90 m. It needs 50 m or better.") && said.includes("Step out to the sidewalk"), said);
    await context.close();
  }

  // 4. Only an area: Precise Location is off.
  {
    const context = await browser.newContext({ ...devices["iPhone 13"], permissions: ["geolocation"], geolocation: { ...CALGARY, accuracy: 4200 } });
    const page = await newLead(context);
    await button(page).click();
    await page.getByTestId("position-problem").waitFor({ timeout: 20000 });
    const said = await text(page.getByTestId("position-problem"));
    check("an area-sized reading says Precise Location is off, with its steps", said.includes("only giving a rough area (about 4.2 km)") && said.includes("Precise Location is off") && said.includes("turn on Precise Location"), said);
    await context.close();
  }
} catch (failure) {
  results.push(`SCRIPT ERROR ${failure?.message ?? String(failure)}`);
} finally {
  await browser.close();
  const { error: gone } = userId ? await admin.auth.admin.deleteUser(userId) : { error: null };
  check("the throwaway setter is gone", !gone, gone?.message ?? "");
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  console.log(`accounts remaining: ${JSON.stringify(users.users.map((user) => user.email))}`);
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")).length;
  console.log(`${results.filter((line) => line.startsWith("PASS")).length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
