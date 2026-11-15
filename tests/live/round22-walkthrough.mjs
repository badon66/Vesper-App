// Live walk-through of round 22 (Keenan, 2026-11-15): hardening, against a
// running build.
//
// 1. New lead never loses what was typed. A throwaway setter, on a phone,
//    fills in New lead and taps Save:
//      - with no signal at all: nothing is sent, the form stays as typed and
//        says there's no signal, and no lead exists;
//      - with the network cut mid-save (the save reaches the server, the
//        signal goes before the answer comes back): the form stays as typed
//        and says it may not have saved;
//      - with the save landing and the signal gone before the next page can
//        open: the form stays as typed and says it saved;
//      - back in signal, Save again opens Leads, and there is still exactly
//        one lead, the same one (its save key), never a copy.
//    Never "This page couldn't load".
// 2. Owner pages and actions check the role themselves. As the throwaway
//    setter, every owner page (the Admin pages, Meetings, prep and meeting
//    mode), fetched both as a page and as the app's own in-app request,
//    shows "Not for your role" with none of the owner's data in it; then
//    every owner-only server action in the build is called directly, by its
//    id, and each one refuses, with nothing written. Keenan's one-time
//    session (owner-session.mjs, view only) then opens each page View as
//    the setter: the same answer.
// 3. Signing out takes the offline copies off the device: the meeting pages
//    and photos caches and the meeting drafts go, the app's own files and a
//    lead draft stay. The sign-in page clears them too, for a session that
//    ended some other way.
//
// Everything is on test leads named "TEST LEAD (automated)" and throwaway
// @example.com setters, removed at the end.
import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3400";
const out = process.env.OUT ?? "test-results/live";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The round 22 walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
const local = base.startsWith("http://localhost");
// PARTS picks parts to run (newlead, signout, pages, actions, viewas); all by default.
const parts = new Set((process.env.PARTS ?? "newlead,signout,pages,actions,viewas").split(","));
// The server action ids come from the build being tested.
const manifestPath = process.env.ACTION_MANIFEST ?? path.join(process.cwd(), ".next/server/server-reference-manifest.json");

const TEST_LEAD = "TEST LEAD (automated)";
const VIEW_AS_COOKIE = "vesper_view_as";
const NO_SIGNAL_NEW = "No signal, so it isn't saved yet. Everything you typed is still here: tap Save again once you have signal. It won't make a copy.";
const LOST_SIGNAL_NEW = "The signal dropped, so it may not have saved. Everything you typed is still here: tap Save again once you have signal. It won't make a copy.";
const SAVED_NO_SIGNAL_NEW = "Saved, but there's no signal to open it. Everything you typed is still here: tap Save again once you have signal. It won't make a copy.";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const note = (text) => results.push(`NOTE ${text}`);
const stamp = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");
const people = {
  a: { email: `r22-live-a-${stamp}@example.com`, password: `maple-river-stone-${digits}`, name: "Round Twentytwo A", id: null },
  b: { email: `r22-live-b-${stamp}@example.com`, password: `cedar-harbor-lantern-${digits}`, name: "Round Twentytwo B", id: null },
};
const STREET = `Roundtwentytwo${stamp}`;
const street = (n) => `${n} ${STREET} Way SW`;
const narrow = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const IPAD = { viewport: { width: 1180, height: 820 }, hasTouch: true };

const squash = (text) => (text ?? "").replace(/\s+/g, " ").trim();
const mask = (text) => String(text).replace(/\/q\/[A-Za-z0-9_-]{16,}/g, "/q/<token>");

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(150);
  await page.locator("[data-loading-screen]").first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
}
async function open(page, where) {
  await page.goto(`${base}${where}`);
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
async function shot(page, name) {
  await page.screenshot({ path: `${out}/r22-${name}.png` }).catch(() => {});
}

// ---------------------------------------------------------------- staging

async function makePerson(key) {
  const p = people[key];
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email,
    password: p.password,
    email_confirm: true,
    user_metadata: { full_name: p.name },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create ${key}: ${error?.message}`);
  p.id = data.user.id;
  // The first sign-in welcome has its own walk-through.
  await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", p.id);
}

async function makeLead(owner, label, n, extra = {}) {
  const { data, error } = await admin
    .from("leads")
    .insert({ first_name: TEST_LEAD, last_name: label, address_line: street(n), neighbourhood: "TEST (automated)", created_by: owner, phone: "+14035550101", ...extra })
    .select("id")
    .single();
  if (error || !data) throw new Error(`lead ${label}: ${error?.message}`);
  return data.id;
}

async function removeEverything() {
  const ids = Object.values(people).map((p) => p.id).filter(Boolean);
  const { data: rows } = await admin.from("leads").select("id").like("address_line", `%${STREET}%`);
  const leadIds = (rows ?? []).map((row) => row.id);
  if (ids.length > 0) {
    const { data: theirs } = await admin.from("leads").select("id").in("created_by", ids);
    for (const row of theirs ?? []) if (!leadIds.includes(row.id)) leadIds.push(row.id);
  }
  if (leadIds.length > 0) {
    await admin.from("earnings").delete().in("lead_id", leadIds);
    await admin.from("slot_holds").delete().in("lead_id", leadIds);
    await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
    await admin.from("meetings").delete().in("lead_id", leadIds);
    await admin.from("quote_links").delete().in("lead_id", leadIds);
    await admin.from("quotes").delete().in("lead_id", leadIds);
    await admin.from("lead_photos").delete().in("lead_id", leadIds);
    await admin.from("lead_events").delete().in("lead_id", leadIds);
    await admin.from("leads").delete().in("id", leadIds);
  }
  for (const id of ids) {
    await admin.from("knock_sessions").delete().eq("user_id", id);
    await admin.from("push_subscriptions").delete().eq("profile_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

// What an owner-only action could change, read before and after the calls.
async function footprint(leadIds) {
  const ids = Object.values(people).map((p) => p.id);
  const [settings, profiles, leads, quotes, links, earnings, meetings, colours, blocks, days, events, docs] = await Promise.all([
    admin.from("settings").select("*").eq("id", 1).single(),
    admin.from("profiles").select("id, role, active, welcome_done_at, full_name").in("id", ids).order("id"),
    admin.from("leads").select("*").in("id", leadIds).order("id"),
    admin.from("quotes").select("id, updated_at").in("lead_id", leadIds).order("id"),
    admin.from("quote_links").select("id, revoked_at").in("lead_id", leadIds).order("id"),
    admin.from("earnings").select("id, status").in("lead_id", leadIds).order("id"),
    admin.from("meetings").select("id, outcome, status").in("lead_id", leadIds).order("id"),
    admin.from("track_colours").select("*").order("id"),
    admin.from("time_blocks").select("id", { count: "exact", head: true }),
    admin.from("day_schedules").select("*").order("id"),
    admin.from("lead_events").select("id").in("lead_id", leadIds).order("id"),
    admin.from("link_documents").select("*").order("id"),
  ]);
  return JSON.stringify({
    settings: settings.data,
    profiles: profiles.data,
    leads: leads.data,
    quotes: quotes.data,
    links: links.data,
    earnings: earnings.data,
    meetings: meetings.data,
    colours: colours.data,
    blocks: blocks.count,
    days: days.data,
    events: events.data,
    docs: docs.data ?? docs.error?.message,
  });
}

// Every owner-only server action, by file. The rest of each file (a
// setter's own lead, hold, booking or knock session) is for members.
const OWNER_ACTIONS = {
  "app/(app)/app/(owner)/admin/people/actions.ts": ["createPerson", "resetPassword", "resetWelcome", "setPersonActive", "startViewAs"],
  "app/(app)/app/(owner)/admin/settings/actions.ts": ["changeOwnPassword", "updateSettings"],
  "app/(app)/app/(owner)/admin/settings/presentation/actions.ts": ["saveDeck", "addDeckPhoto", "moveDeckPhoto", "removeDeckPhoto", "setDeckPhotoCaption", "setDeckPhotoFocus", "updateReference"],
  "app/(app)/app/(owner)/admin/settings/track-colour-actions.ts": ["addTrackColour", "moveTrackColour", "setTrackColourActive", "updateTrackColour"],
  "app/(app)/app/(owner)/meetings/actions.ts": ["searchLeadsForMeeting", "startMeetingForNewPerson", "confirmMeeting", "fillMissingAnswers"],
  "app/(app)/app/leads/actions.ts": ["setTrackColour"],
  "app/(app)/app/leads/delete-actions.ts": ["deleteLead", "restoreLead"],
  "app/(app)/app/leads/link-documents-actions.ts": ["addLibraryDocument", "renameLibraryDocument", "retireLibraryDocument", "saveAgreementText", "addLeadUpload", "removeLeadUpload", "setAgreementToSign", "setLeadDocument"],
  "app/(app)/app/leads/mockup-actions.ts": ["addLeadMockups", "setOfferPicture", "removeLeadMockup", "renameLeadMockup", "setLeadMockupRole"],
  "app/(app)/app/leads/polish-actions.ts": ["polishOfferDescription"],
  "app/(app)/app/leads/quote-link-actions.ts": ["sendQuoteLink", "turnOffQuoteLink"],
  "app/(app)/app/leads/quote-outcome-actions.ts": ["acceptQuote", "cancelSale", "declineQuote", "markInstalled", "markNotInstalled", "setInstallDay", "setSiteVisitDay", "setSiteVisitDone", "undoAcceptance"],
  "app/(app)/app/leads/soffit-code-actions.ts": ["setTrackFromSoffitCode"],
  "app/(app)/app/schedule/actions.ts": ["setOutcome", "markPaid", "addTimeBlock", "previewDaySchedule", "removeTimeBlock", "setDaySchedule"],
  "app/(app)/meeting/actions.ts": ["confirmColourInitials", "saveQuoteDraft"],
};
const REFUSALS = ["Not for your role", "Only Keenan"];

// A page route from a manifest worker key: route groups dropped, dynamic
// segments filled with a test lead.
function routeOf(worker, leadId) {
  const parts = worker
    .replace(/^app/, "")
    .replace(/\/page$/, "")
    .split("/")
    .filter((part) => part && !(part.startsWith("(") && part.endsWith(")")))
    .map((part) => (part.startsWith("[") ? leadId : part));
  return `/${parts.join("/")}`;
}

// ---------------------------------------------------------------- the walk-through

let browser;
let ownerSession = null;
try {
  await mkdir(out, { recursive: true });
  await makePerson("a");
  await makePerson("b");
  const leadA = await makeLead(people.a.id, "Setterone", 1, { assigned_to: people.a.id });
  const leadB = await makeLead(people.b.id, "Settertwo", 2, { assigned_to: people.b.id });
  const deletedLabel = `Deletedmarker${stamp}`;
  const gone = await makeLead(people.b.id, deletedLabel, 3, { deleted_at: new Date().toISOString() });
  const { data: settingsRow } = await admin.from("settings").select("warranty_text").eq("id", 1).single();
  const warranty = squash(settingsRow?.warranty_text ?? "").slice(0, 40);
  browser = await chromium.launch();

  // ---------------------------------------------------------------- 1. New lead with the signal gone
  if (parts.has("newlead") || parts.has("signout")) {
    const context = await browser.newContext(narrow);
    const page = await context.newPage();
    const crashed = [];
    page.on("pageerror", (error) => crashed.push(error.message.slice(0, 160)));
    await signIn(page, people.a);
    await open(page, "/app/leads/new");
    const address = `9 ${STREET} Lane NW`;
    await page.fill("#lead-address", address);
    await page.fill("#lead-first_name", TEST_LEAD);
    await page.fill("#lead-last_name", "Nosignal");
    await page.fill("#lead-phone", "403 555 0142");
    await page.getByTestId("mark-rest").click();
    const typed = async () => ({
      address: await page.inputValue("#lead-address").catch(() => ""),
      first: await page.inputValue("#lead-first_name").catch(() => ""),
      last: await page.inputValue("#lead-last_name").catch(() => ""),
      phone: (await page.inputValue("#lead-phone").catch(() => "")).replace(/\D/g, ""),
    });
    const intact = (t) => t.address === address && t.first === TEST_LEAD && t.last === "Nosignal" && t.phone.endsWith("4035550142");
    const mine = async () => (await admin.from("leads").select("id").eq("created_by", people.a.id).eq("last_name", "Nosignal")).data ?? [];
    const alert = page.locator('[role="alert"]').filter({ hasText: "signal" }).first();
    const brokenPage = async () => (await page.locator("body").innerText().catch(() => "")).includes("couldn’t load") || (await page.locator("body").innerText().catch(() => "")).includes("couldn't load");
    const save = page.getByRole("button", { name: "Save lead" });

    // No signal at all.
    await context.setOffline(true);
    await save.click();
    await alert.waitFor({ timeout: 15000 }).catch(() => {});
    const noSignal = squash(await alert.innerText().catch(() => ""));
    check(
      "no signal: Save keeps everything typed, says there's no signal, and saves nothing",
      noSignal === NO_SIGNAL_NEW && intact(await typed()) && page.url().endsWith("/app/leads/new") && !(await brokenPage()) && (await mine()).length === 0,
      `${noSignal} | ${JSON.stringify(await typed())} | ${(await mine()).length}`,
    );
    await shot(page, "no-signal");
    await context.setOffline(false);

    // The network cut mid-save: the save reaches the server, the answer never
    // comes back. The test machine reaches only a local server this way.
    let firstId = null;
    if (local) {
    await page.route("**/app/leads/new", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fetch().catch(() => null);
      await context.setOffline(true);
      await route.abort("internetdisconnected").catch(() => {});
    });
    await save.click();
    await alert.waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some((el) => el.textContent.includes("dropped")), null, { timeout: 30000 }).catch(() => {});
    const lost = squash(await alert.innerText().catch(() => ""));
    const afterLost = await mine();
    check(
      "network cut mid-save: the form stays as typed and says it may not have saved (it did, once)",
      lost === LOST_SIGNAL_NEW && intact(await typed()) && page.url().endsWith("/app/leads/new") && !(await brokenPage()) && afterLost.length === 1,
      `${lost} | ${afterLost.length}`,
    );
    await shot(page, "signal-dropped");
    await page.unroute("**/app/leads/new");
    await context.setOffline(false);

    // The save lands and answers, then the signal goes before the next page can open.
    await page.route("**/app/leads/new", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const answer = await route.fetch();
      await context.setOffline(true);
      await route.fulfill({ response: answer });
    });
    await save.click();
    await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some((el) => el.textContent.includes("Saved, but")), null, { timeout: 30000 }).catch(() => {});
    const savedNoSignal = squash(await alert.innerText().catch(() => ""));
    const afterSaved = await mine();
    check(
      "saved, then no signal for the next page: the form stays as typed and says it saved, with no copy",
      savedNoSignal === SAVED_NO_SIGNAL_NEW && intact(await typed()) && page.url().endsWith("/app/leads/new") && !(await brokenPage()) && afterSaved.length === 1 && afterSaved[0].id === afterLost[0]?.id,
      `${savedNoSignal} | ${afterSaved.length}`,
    );
    await shot(page, "saved-no-signal");
    await page.unroute("**/app/leads/new");
    await context.setOffline(false);
    firstId = afterLost[0]?.id ?? null;
    } else note("the network cuts mid-save run against the local build only (the test machine can't intercept a remote save)");

    // Back in signal: Save again opens Leads, still the one lead.
    await save.click();
    await page.waitForURL((u) => u.pathname === "/app/leads" && u.searchParams.has("added"), { timeout: 30000 }).catch(() => {});
    await settle(page);
    const final = await mine();
    check(
      "back in signal, Save again opens Leads, and it's still the one lead, never a copy",
      new URL(page.url()).pathname === "/app/leads" && final.length === 1 && (firstId === null || final[0].id === firstId),
      `${new URL(page.url()).pathname} | ${final.length}`,
    );
    check("never \"This page couldn't load\" and nothing crashed", crashed.length === 0, crashed.join(" | "));

    // ---------------------------------------------------------------- 3. Sign out takes the offline copies off
    const seed = () =>
      page.evaluate(async () => {
        const put = async (name, key) => (await caches.open(name)).put(key, new Response("test"));
        await put("vesper-pages-v1", "/meeting/test-page");
        await put("vesper-images-v1", "/test-image.jpg");
        await put("vesper-assets-v1", "/test-asset.js");
        localStorage.setItem("vesper.meeting.test", "x");
        localStorage.setItem("vesper.test.keep", "x");
      });
    const left = () =>
      page.evaluate(async () => ({
        caches: (await caches.keys()).filter((name) => name.startsWith("vesper-")),
        meeting: localStorage.getItem("vesper.meeting.test"),
        keep: localStorage.getItem("vesper.test.keep"),
      }));
    await open(page, "/app");
    await seed();
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.getByTestId("sign-out").getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login**", { timeout: 20000 }).catch(() => {});
    await settle(page);
    const afterOut = await left();
    check(
      "signing out clears the meeting pages and photos, and the meeting drafts; the app's files and other things stay",
      !afterOut.caches.some((name) => name.startsWith("vesper-pages") || name.startsWith("vesper-images")) && afterOut.caches.includes("vesper-assets-v1") && afterOut.meeting === null && afterOut.keep === "x",
      JSON.stringify(afterOut),
    );
    await seed();
    await open(page, "/login");
    await page.waitForTimeout(500);
    const afterLogin = await left();
    check(
      "the sign-in page clears them too (a session that ended some other way)",
      !afterLogin.caches.some((name) => name.startsWith("vesper-pages") || name.startsWith("vesper-images")) && afterLogin.meeting === null,
      JSON.stringify(afterLogin),
    );
    await page.evaluate(async () => {
      await caches.delete("vesper-assets-v1").catch(() => {});
      localStorage.removeItem("vesper.test.keep");
    });
    await context.close();
  }

  // ---------------------------------------------------------------- 2. Owner pages and actions, as a setter
  const PAGES = [
    "/app/admin",
    "/app/admin/people",
    "/app/admin/settings",
    "/app/admin/settings/documents",
    "/app/admin/settings/presentation",
    "/app/admin/settings/rehearsal",
    "/app/admin/pay",
    "/app/admin/deleted",
    "/app/meetings",
    `/app/meetings/prep/${leadA}`,
    `/meeting/${leadA}`,
  ];
  const markers = [people.b.email, deletedLabel, 'data-testid="pay-setter"', 'href="/app/admin/people"', 'href="/app/admin/settings/documents"', ...(warranty.length >= 20 ? [warranty] : [])];
  const leaks = (body) => markers.filter((marker) => body.includes(marker));
  const refused = (body) => body.includes("Not for your role");
  // The app's own in-app request (what a tap on a link fetches). Next.js
  // first answers it with a redirect that adds its cache key; follow that,
  // and only a real in-app answer counts.
  // Fetched from inside the signed-in browser, with its cookies.
  const fetchIn = (page, where, headers = {}) =>
    page.evaluate(
      async ({ target, headers }) => {
        const answer = await fetch(target, { headers, credentials: "same-origin" });
        return { status: answer.status, url: answer.url, kind: answer.headers.get("content-type") ?? "", body: await answer.text() };
      },
      { target: `${base}${where}`, headers },
    );
  const inApp = async (page, where) => {
    const answer = await fetchIn(page, where, { RSC: "1" });
    return { status: answer.status, body: answer.body, flight: answer.kind.includes("text/x-component") };
  };
  if (parts.has("pages") || parts.has("actions")) {
    const context = await browser.newContext(narrow);
    const page = await context.newPage();
    await signIn(page, people.a);
    for (const where of parts.has("pages") ? PAGES : []) {
      const html = await fetchIn(page, where);
      const rsc = await inApp(page, where);
      const pageOk = html.status === 200 && new URL(html.url).pathname === where && refused(html.body) && leaks(html.body).length === 0;
      const rscOk = rsc.status === 200 && rsc.flight && refused(rsc.body) && leaks(rsc.body).length === 0;
      check(`setter gets nothing from ${where.replace(leadA, "<lead>")}: "Not for your role", no owner data, as a page and in-app`, pageOk && rscOk, `${html.status} ${rsc.status} ${rsc.flight ? "in-app" : "not in-app"} ${[...leaks(html.body), ...leaks(rsc.body)].join(", ")}`);
    }

    // The action ids belong to one build: only the local one is called.
    let manifest = null;
    if (!parts.has("actions")) {
      // Not asked for this run.
    } else if (!local) note("the action calls run against the local build only (their ids belong to that build)");
    else {
      try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      } catch {
        note(`no server action manifest at ${manifestPath}; the action calls need a local build`);
      }
    }
    if (manifest) {
      const leadIds = [leadA, leadB, gone];
      const before = await footprint(leadIds);
      const entries = Object.entries(manifest.node);
      let called = 0;
      const bad = [];
      for (const [file, names] of Object.entries(OWNER_ACTIONS)) {
        for (const exportedName of names) {
          const found = entries.find(([, entry]) => entry.filename === file && entry.exportedName === exportedName);
          if (!found) {
            bad.push(`${exportedName}: not in the build`);
            continue;
          }
          const [id, entry] = found;
          const workers = Object.keys(entry.workers).filter((worker) => worker.endsWith("/page"));
          const worker = workers.find((w) => !w.includes("[")) ?? workers[0];
          const route = routeOf(worker, leadA);
          // Arguments shaped like the real ones: a lead, a few strings.
          const args = JSON.stringify([leadA, "x", "x"]);
          const answer = await page.evaluate(
            async ({ target, id, args }) => {
              const r = await fetch(target, {
                method: "POST",
                headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
                body: args,
                credentials: "same-origin",
                redirect: "manual",
              });
              return { status: r.status, body: await r.text() };
            },
            { target: `${base}${route}`, id, args },
          );
          const body = answer.body;
          called += 1;
          const ok = answer.status === 200 && REFUSALS.some((phrase) => body.includes(phrase)) && !body.includes('"ok":true');
          if (!ok) bad.push(`${exportedName} @ ${route}: ${answer.status} ${squash(body).slice(0, 160)}`);
        }
      }
      const total = Object.values(OWNER_ACTIONS).flat().length;
      check(`every owner-only action refuses a setter (${called} of ${total} called)`, bad.length === 0 && called === total, bad.join(" || "));
      const after = await footprint(leadIds);
      const changed = Object.keys(JSON.parse(before)).filter((key) => JSON.stringify(JSON.parse(before)[key]) !== JSON.stringify(JSON.parse(after)[key]));
      check("and none of them wrote anything", after === before, changed.join(", "));
    }
    await context.close();
  }

  // ---------------------------------------------------------------- 2. The same pages, View as the setter (Keenan's view-only session)
  if (parts.has("viewas")) {
    const context = await browser.newContext(IPAD);
    ownerSession = await openOwnerSession({ url, anonKey, admin, base, context });
    const page = await context.newPage();
    await open(page, "/app/admin/people");
    await page.locator("tr", { hasText: people.a.email }).getByRole("button", { name: "View as" }).click();
    await page.waitForURL("**/app", { timeout: 30000 });
    await settle(page);
    for (const where of PAGES) {
      const response = await page.goto(`${base}${where}`);
      await settle(page);
      const body = await page.content();
      const rsc = await inApp(page, where);
      const pageOk = new URL(page.url()).pathname === where && refused(body) && leaks(body).length === 0;
      const rscOk = rsc.status === 200 && rsc.flight && refused(rsc.body) && leaks(rsc.body).length === 0;
      check(`View as the setter, ${where.replace(leadA, "<lead>")} shows "Not for your role" and no owner data, as a page and in-app`, pageOk && rscOk, `${response?.status()} ${rsc.status} ${rsc.flight ? "in-app" : "not in-app"} ${new URL(page.url()).pathname.replace(leadA, "<lead>")} ${[...leaks(body), ...leaks(rsc.body)].join(", ")}`);
    }
    await open(page, "/app");
    await page.getByRole("status").filter({ hasText: "Viewing as" }).getByRole("button", { name: "Exit" }).click();
    await page.waitForURL("**/app/admin/people", { timeout: 20000 }).catch(() => {});
    check("Exit ends View as", !(await context.cookies()).some((cookie) => cookie.name === VIEW_AS_COOKIE));
    await ownerSession.close();
    ownerSession = null;
    await context.close();
  }
} catch (error) {
  check("walk-through ran to the end", false, mask(error?.stack ?? error));
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await removeEverything().catch((error) => note(`cleanup: ${error?.message}`));
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).like("address_line", `%${STREET}%`);
  check("cleanup left no test leads", (count ?? 0) === 0);
  for (const line of results) console.log(mask(line));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log(`${results.filter((line) => line.startsWith("PASS")).length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
