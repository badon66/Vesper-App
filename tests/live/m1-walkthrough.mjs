// Live walk-through of sign-in, roles, themes, password reset and deactivation
// against a running production build, using throwaway accounts created and
// deleted through the Auth admin API. Only emails starting with a test prefix
// are ever created or deleted; real accounts are never touched.
//
// Run with `npm run test:live` (starts and stops the server) or point BASE at
// a server you started yourself. Needs the three variables from .env.example.
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Live walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
const TEST_PREFIX = /^(rls-|m1-live-|m1-probe-|m1-ban-|m0-smoke|m2-live-)/;

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " [" + extra + "]" : ""}`);
const stamp = Date.now().toString(36);
const email = `m1-live-${stamp}@example.com`;
const firstPassword = `maple-river-stone-${String(Date.now() % 10000).padStart(4, "0")}`;
const secondPassword = `cedar-brook-pearl-${String((Date.now() + 7) % 10000).padStart(4, "0")}`;
let userId = null;

async function signIn(page, pw) {
  await page.goto(`${base}/login`);
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await page.click("button[type=submit]");
}
const settled = (page) => page.waitForURL((u) => !u.pathname.startsWith("/login") || u.search.length > 0, { timeout: 20000 }).catch(() => {});

const { mkdir } = await import("node:fs/promises");
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const { defaultBrowserType, ...iphone } = devices["iPhone 14"]; void defaultBrowserType;
const ctx = await browser.newContext(iphone);
const page = await ctx.newPage();
try {
  // a. create as People does: generated password, confirmed email, role in app_metadata
  const created = await admin.auth.admin.createUser({
    email, password: firstPassword, email_confirm: true,
    user_metadata: { full_name: "Live Test", phone: null },
    app_metadata: { role: "sales" },
  });
  if (created.error) throw new Error("createUser: " + created.error.message);
  userId = created.data.user.id;
  check("a. created with email confirmed", created.data.user.email_confirmed_at != null);
  const { data: prof } = await admin.from("profiles").select("role, active, full_name").eq("id", userId).single();
  check("a. trigger made a sales profile from app_metadata", prof?.role === "sales" && prof?.active && prof?.full_name === "Live Test", JSON.stringify(prof));

  // b. the generated password signs in straight to /app, no password change step
  await signIn(page, firstPassword);
  await page.waitForURL("**/app", { timeout: 20000 });
  check("b. generated password lands on /app with no set-password step", page.url().endsWith("/app"), page.url());
  const old = await page.request.get(`${base}/set-password`);
  check("b. /set-password no longer exists", old.status() === 404, String(old.status()));

  // c. dark by default, sales home, no owner tabs
  await page.getByRole("heading", { name: /Hello, Live/ }).waitFor({ timeout: 15000 });
  const htmlClass = await page.evaluate(() => document.documentElement.className);
  const hello = await page.getByRole("heading", { name: /Hello, Live/ }).count();
  const tabs = await page.getByRole("link", { name: /^(People|Settings|Dashboard)$/ }).count();
  check("c. dark theme by default", /\bdark\b/.test(htmlClass), htmlClass);
  check("c. home shows Hello, Live and Sales associate with no owner tabs", hello === 1 && (await page.getByText("Sales associate").count()) >= 1 && tabs === 0, `tabs=${tabs}`);
  await page.screenshot({ path: `${out}/sales-home-dark.png`, fullPage: true });

  // d. light stays available and is remembered
  await page.click('button[aria-label="Switch to light theme"]');
  await page.waitForTimeout(300);
  await page.reload(); await page.waitForLoadState("networkidle");
  const lightClass = await page.evaluate(() => document.documentElement.className);
  check("d. light theme survives a reload", /\blight\b/.test(lightClass) && !/\bdark\b/.test(lightClass), lightClass);
  await page.screenshot({ path: `${out}/sales-home-light.png`, fullPage: true });
  await page.click('button[aria-label="Switch to dark theme"]');

  // e. owner pages refused on the server
  for (const path of ["/app/settings", "/app/people", "/app/dashboard"]) {
    await page.goto(`${base}${path}`);
    const heading = await page.getByRole("heading", { name: "Not for your role" }).count();
    const leaked = (await page.getByText("Save settings").count()) + (await page.getByText("Add a Vesper member").count());
    check(`e. ${path} shows Not for your role`, heading === 1 && leaked === 0 && page.url().endsWith(path), page.url());
  }

  // f. reset: new password set by the admin, sessions ended, old session dies at once
  const upd = await admin.auth.admin.updateUserById(userId, { password: secondPassword });
  if (upd.error) throw new Error("reset: " + upd.error.message);
  const ended = await admin.rpc("end_user_sessions", { target_user: userId });
  check("f. end_user_sessions ran (admin password change may already have ended them)", !ended.error, ended.error?.message || `rows=${ended.data}`);
  await page.goto(`${base}/app`);
  await page.waitForURL("**/login?reason=session_ended", { timeout: 20000 });
  check("f. the open session is signed out with the signed-out notice", (await page.getByText(/signed out/).count()) >= 1, page.url());
  await page.screenshot({ path: `${out}/session-ended.png`, fullPage: true });
  await signIn(page, firstPassword);
  await page.getByText(/did not match/).first().waitFor({ timeout: 20000 });
  check("f. the old password no longer works", true);
  await signIn(page, secondPassword);
  await page.waitForURL("**/app", { timeout: 20000 });
  check("f. the new password works", page.url().endsWith("/app"), page.url());

  // g. sign out and the redirect back
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login**", { timeout: 20000 });
  await page.goto(`${base}/app`);
  check("g. signed out, /app redirects to login with next", /\/login\?next=%2Fapp$/.test(page.url()), page.url());

  // h. deactivate as People does: ban, flag, end sessions; sign-in refused with the message
  await signIn(page, secondPassword);
  await page.waitForURL("**/app", { timeout: 20000 });
  const ban = await admin.auth.admin.updateUserById(userId, { ban_duration: "876600h" });
  if (ban.error) throw new Error("ban: " + ban.error.message);
  await admin.from("profiles").update({ active: false }).eq("id", userId);
  await admin.rpc("end_user_sessions", { target_user: userId });
  await page.goto(`${base}/app`);
  await settled(page);
  check("h. deactivated person is signed out at once", /\/login\?reason=(session_ended|deactivated)$/.test(page.url()), page.url());
  await signIn(page, secondPassword);
  await page.getByText(/has been deactivated/).first().waitFor({ timeout: 20000 });
  check("h. deactivated person cannot sign in and sees why", true);
  await page.screenshot({ path: `${out}/deactivated.png`, fullPage: true });

  // i. an account with no role gets no access at all
  const roleless = await admin.auth.admin.createUser({
    email: `m1-live-norole-${stamp}@example.com`, password: firstPassword, email_confirm: true,
    user_metadata: { full_name: "No Role", role: "sales" },
  });
  if (roleless.error) throw new Error("roleless: " + roleless.error.message);
  try {
    const fresh = await ctx.newPage();
    await fresh.goto(`${base}/login`);
    await fresh.fill("#email", `m1-live-norole-${stamp}@example.com`);
    await fresh.fill("#password", firstPassword);
    await fresh.click("button[type=submit]");
    await fresh.waitForURL("**/login?reason=no_profile", { timeout: 20000 });
    check("i. an account without a role is signed out as not set up", (await fresh.getByText(/not set up/).count()) >= 1, fresh.url());
    await fresh.close();
  } finally {
    await admin.auth.admin.deleteUser(roleless.data.user.id);
  }
} catch (e) {
  results.push("SCRIPT ERROR " + (e && e.message ? e.message : String(e)) + " at " + page.url());
} finally {
  if (userId) {
    const del = await admin.auth.admin.deleteUser(userId);
    check("j. throwaway user deleted", !del.error, del.error?.message || "");
  }
  const list = await admin.auth.admin.listUsers({ perPage: 1000 });
  const left = (list.data?.users || []).filter((u) => TEST_PREFIX.test(u.email || ""));
  check("j. no throwaway users remain", !list.error && left.length === 0, list.error?.message || left.map((u) => u.email).join(","));
  results.push("accounts remaining: " + JSON.stringify((list.data?.users || []).map((u) => u.email)));
  await browser.close();
}
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL") || r.startsWith("SCRIPT ERROR")) ? 1 : 0);
