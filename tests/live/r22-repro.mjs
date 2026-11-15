import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
const base = process.env.BASE ?? "http://localhost:3400";
const out = process.env.OUT;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now().toString(36);
const email = `r22-repro-${stamp}@example.com`;
const password = `maple-river-stone-${String(Date.now() % 10000).padStart(4, "0")}`;
const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "R22 Repro" }, app_metadata: { role: "sales" } });
const id = data.user.id;
await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", id);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300)); });
  await page.goto(`${base}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30000 });
  await page.goto(`${base}/app/leads/new`);
  await page.waitForLoadState("networkidle");
  console.log("sw", await page.evaluate(() => navigator.serviceWorker?.controller ? "controlled" : "none"));
  await page.fill("#lead-address", `1 Reprotest${stamp} Lane NW (TEST)`);
  await page.fill("#lead-first_name", "TEST LEAD (automated)");
  await page.getByTestId("mark-rest").click();
  const mode = process.env.MODE ?? "offline";
  if (mode === "offline") await context.setOffline(true);
  else {
    await page.route("**/app/leads/new", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const resp = await route.fetch();
      console.log("action answered", resp.status(), JSON.stringify(resp.headers()).slice(0, 300));
      await context.setOffline(true);
      await route.fulfill({ response: resp });
    });
  }
  await page.getByRole("button", { name: process.env.BUTTON ?? "Save lead" }).click();
  await page.waitForTimeout(6000);
  console.log("url", page.url());
  console.log("text", (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 400));
  await page.screenshot({ path: `${out}/repro-${process.env.MODE ?? "offline"}-${(process.env.BUTTON ?? "save").replace(/ /g, "")}.png` });
  console.log("leads made", (await admin.from("leads").select("id").eq("created_by", id)).data?.length);
  await context.setOffline(false);
} finally {
  await browser.close();
  await admin.from("leads").delete().eq("created_by", id);
  await admin.from("knock_sessions").delete().eq("user_id", id);
  await admin.auth.admin.deleteUser(id);
}
