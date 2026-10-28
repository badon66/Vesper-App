// Measures how long a tab switch takes on a phone-sized screen, signed in as
// a throwaway setter. For each switch it records:
//   response  tap until the screen visibly changes (new address or a loading
//             screen), which is what makes a tap feel instant or not
//   content   tap until the new screen's own content is on screen
//   server    how long the server took to send the new screen's data in full
//             (the navigation request, not prefetches)
// Run against production with BASE set, before and after a change. The
// throwaway account and its TEST LEAD (automated) leads are deleted after.
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";

const base = process.env.BASE ?? "http://localhost:3300";
const rounds = Number(process.env.ROUNDS ?? 10);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const TEST_LEAD = "TEST LEAD (automated)";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const stamp = Date.now().toString(36);
const person = {
  email: `perf-live-${stamp}@example.com`,
  password: `harbour-meadow-flint-${String(Date.now() % 10000).padStart(4, "0")}`,
  id: null,
};

// The tab bar, whichever version of the app is running.
const TAB_BAR = 'nav[aria-label="Phone"], nav[aria-label="Tabs"]';
const screens = {
  "/app": { tab: "Home", ready: "#knock-neighbourhood" },
  "/app/leads": { tab: "Leads", ready: 'input[name="q"]' },
  "/app/leads/new": { tab: "New lead", ready: "#lead-address" },
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const browser = await chromium.launch();
const { defaultBrowserType, ...iphone } = devices["iPhone 14"];
void defaultBrowserType;
const context = await browser.newContext(iphone);
const page = await context.newPage();
const samples = {};
let exitCode = 0;

async function switchTo(path) {
  const target = screens[path];
  const navigationUrls = [];
  const onRequest = (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.pathname === path && requestUrl.searchParams.has("_rsc") && !request.headers()["next-router-prefetch"]) {
      navigationUrls.push(request.url());
    }
  };
  page.on("request", onRequest);
  const link = page.locator(TAB_BAR).getByRole("link", { name: target.tab, exact: true });
  const started = Date.now();
  const response = page
    .waitForFunction(
      (p) => location.pathname === p || document.querySelector("[data-loading-screen]") !== null,
      path,
      { timeout: 30000, polling: "raf" },
    )
    .then(() => Date.now() - started);
  // Checked on every animation frame from the tap, like the response, so the
  // moment the content shows is caught to the frame. (Playwright's own waits
  // check less and less often, which hides anything after the first switch.)
  const content = page
    .waitForFunction(
      (selector) =>
        [...document.querySelectorAll(selector)].some((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        }),
      target.ready,
      { timeout: 30000, polling: "raf" },
    )
    .then(() => Date.now() - started);
  await link.click();
  const [responseMs, contentMs] = await Promise.all([response, content]);
  await page.waitForLoadState("networkidle").catch(() => {});
  page.off("request", onRequest);
  const serverMs = await page.evaluate((urls) => {
    const entries = performance.getEntriesByType("resource").filter((entry) => urls.includes(entry.name));
    return entries.length ? Math.round(Math.max(...entries.map((entry) => entry.responseEnd - entry.startTime))) : null;
  }, navigationUrls);
  return { responseMs, contentMs, serverMs };
}

function record(name, result) {
  samples[name] ??= { response: [], content: [], server: [] };
  samples[name].response.push(result.responseMs);
  samples[name].content.push(result.contentMs);
  if (result.serverMs !== null) samples[name].server.push(result.serverMs);
}

try {
  const { data, error } = await admin.auth.admin.createUser({
    email: person.email,
    password: person.password,
    email_confirm: true,
    user_metadata: { full_name: "Perf Test" },
    app_metadata: { role: "sales" },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  person.id = data.user.id;
  const client = createClient(url, anonKey, noSession);
  await client.auth.signInWithPassword({ email: person.email, password: person.password });
  const leads = Array.from({ length: 6 }, (_, i) => ({
    first_name: TEST_LEAD,
    address_line: `${100 + i} Timing Street NW (TEST)`,
    neighbourhood: "TEST (automated)",
    created_by: person.id,
  }));
  const { error: leadError } = await client.from("leads").insert(leads);
  if (leadError) throw new Error(`leads: ${leadError.message}`);

  await page.goto(`${base}/login`);
  await page.fill("#email", person.email);
  await page.fill("#password", person.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30000 });
  await page.locator(screens["/app"].ready).first().waitFor({ state: "visible", timeout: 30000 });

  // Warm up: every screen once, so cold starts do not count.
  await switchTo("/app/leads");
  await switchTo("/app");

  for (let i = 0; i < rounds; i += 1) {
    record("Home to Leads", await switchTo("/app/leads"));
    record("Leads to Home", await switchTo("/app"));
    if (i % 2 === 0) {
      record("Home to New lead", await switchTo("/app/leads/new"));
      await page.goto(`${base}/app`);
      await page.locator(screens["/app"].ready).first().waitFor({ state: "visible", timeout: 30000 });
      await page.waitForLoadState("networkidle").catch(() => {});
    }
  }
} catch (error) {
  console.log(`SCRIPT ERROR ${error?.message ?? String(error)} at ${page.url()}`);
  exitCode = 1;
} finally {
  if (person.id) {
    await admin.from("leads").delete().eq("created_by", person.id);
    await admin.from("knock_sessions").delete().eq("user_id", person.id);
    await admin.auth.admin.deleteUser(person.id);
  }
  await browser.close();
}

const all = { response: [], content: [], server: [] };
console.log(`Tab switches on ${base}, iPhone 14 size, ${rounds} rounds, milliseconds (median / slowest):`);
for (const [name, s] of Object.entries(samples)) {
  for (const key of Object.keys(all)) all[key].push(...s[key]);
  console.log(
    `  ${name.padEnd(17)} response ${median(s.response)} / ${Math.max(...s.response)}   content ${median(s.content)} / ${Math.max(...s.content)}   server ${s.server.length ? `${median(s.server)} / ${Math.max(...s.server)}` : "n/a"}   (${s.content.length} switches)`,
  );
}
if (all.content.length) {
  console.log(
    `  ${"All switches".padEnd(17)} response ${median(all.response)} / ${Math.max(...all.response)}   content ${median(all.content)} / ${Math.max(...all.content)}   server ${all.server.length ? `${median(all.server)} / ${Math.max(...all.server)}` : "n/a"}   (${all.content.length} switches)`,
  );
}
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const leftovers = (list?.users ?? []).filter((u) => (u.email ?? "").startsWith("perf-live-"));
console.log(`perf accounts left: ${leftovers.length}`);
process.exit(exitCode || leftovers.length ? 1 : 0);
