// Live walk-through of round 4's session changes (Keenan, 2026-11-05), on a
// setter's phone size against the real database:
//   - 15 minutes into a session with no tap, a quiet reminder in the
//     counters' own words; gone at the first tap, and after a reload;
//   - a session left open past midnight ends itself (the database job's
//     function, run here as the job would), at its last tap or its start, and
//     its summary says so the next day, with its day;
//   - the team's neighbourhoods are suggested as a setter types, and a session
//     keeps the first spelling whatever the capital letters;
//   - View as shows the reminder and the summary as the setter sees them, and
//     writes nothing (the owner's one-time session, rule 10).
// Three throwaway TEST setters, deleted after with everything they made.
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("The sessions walk-through needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` [${extra}]` : ""}`);
const stamp = Date.now().toString(36);
const HOOD = `TEST Hood ${stamp}`;
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms) => new Date(ms).toISOString();
const text = (locator) => locator.innerText().then((value) => value.replace(/\s+/g, " ").trim()).catch(() => "");
const people = {
  quiet: { email: `sessions-live-q-${stamp}@example.com`, name: "TEST Quiet Setter", id: null },
  overnight: { email: `sessions-live-o-${stamp}@example.com`, name: "TEST Overnight Setter", id: null },
  typer: { email: `sessions-live-t-${stamp}@example.com`, name: "TEST Typing Setter", id: null },
};
const password = `maple-river-cove-${String(Date.now() % 10000).padStart(4, "0")}`;

const browser = await chromium.launch();
let ownerSession = null;
// Each setter in a browser of their own, signed in from scratch.
async function signIn(_context, person) {
  const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
  await page.goto(`${base}/login`);
  await page.fill("#email", person.email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30000 });
  return page;
}
async function openSession(page) {
  await page.goto(`${base}/app/session`);
  await page.waitForLoadState("networkidle").catch(() => {});
}

try {
  for (const person of Object.values(people)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: person.name },
      app_metadata: { role: "sales" },
    });
    if (error) throw error;
    person.id = data.user.id;
    await admin.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", person.id);
  }
  // The quiet setter started 20 minutes ago and hasn't tapped. The overnight
  // setter's session started yesterday at 5:07 pm, tapped last at 6:50 pm,
  // and was never ended. The first spelling of the test place is the
  // overnight setter's.
  const now = Date.now();
  // Yesterday at 5:07 pm, Calgary time (Alberta Time, UTC-6 all year).
  // The app's own rule (lib/time.ts): Alberta Time is UTC-6 all year, which
  // the test browser's own time zone data may not know yet.
  const calgaryDay = (ms) => new Date(ms - 6 * HOUR).toISOString().slice(0, 10);
  const yesterday = calgaryDay(now - 24 * HOUR);
  const yesterdayStart = Date.parse(`${yesterday}T17:07:00-06:00`);
  await admin.from("knock_sessions").insert({ user_id: people.overnight.id, neighbourhood: HOOD, started_at: iso(yesterdayStart), doors_knocked: 12, conversations: 4, last_tap_at: iso(yesterdayStart + 100 * MIN) });
  await admin.from("knock_sessions").insert({ user_id: people.quiet.id, neighbourhood: `${HOOD} North`, started_at: iso(now - 20 * MIN) });

  const context = await browser.newContext({ ...devices["iPhone 13"] });

  // 1. The reminder.
  const quiet = await signIn(context, people.quiet);
  await openSession(quiet);
  const reminder = await text(quiet.getByTestId("tap-reminder"));
  check(
    "20 minutes in with no tap, a quiet line says to tap the counters, in their own words",
    reminder === "Tap Doors +1 at every door, and Conversations +1 when someone answers.",
    reminder,
  );
  const doorsBox = await quiet.getByRole("button", { name: /^Doors \+1/ }).boundingBox();
  await quiet.getByRole("button", { name: /^Doors \+1/ }).click();
  const after = await quiet.getByTestId("tap-reminder").count();
  const doorsAfter = await quiet.getByRole("button", { name: /^Doors \+1/ }).boundingBox();
  check("the first tap takes it away at once, and the counters don't move", after === 0 && doorsBox?.y === doorsAfter?.y, `${after} lines; ${doorsBox?.y} then ${doorsAfter?.y}`);
  await quiet.locator('[data-testid="tap-status"][data-pending="0"]').waitFor({ timeout: 20000 }).catch(() => {});
  const { data: tapped } = await admin.from("knock_sessions").select("last_tap_at").eq("user_id", people.quiet.id).is("ended_at", null).single();
  check("the tap is recorded with its time", Boolean(tapped?.last_tap_at));
  await quiet.getByTestId("tap-status").getByRole("button", { name: "Undo door" }).click();
  await quiet.locator('[data-testid="tap-status"][data-pending="0"]').waitFor({ timeout: 20000 }).catch(() => {});
  await openSession(quiet);
  check("after an undo and a reload, back at no doors, it doesn't come back", (await quiet.getByTestId("tap-reminder").count()) === 0);

  // 2. A session left open past midnight.
  const { data: ran, error: runError } = await admin.rpc("end_open_knock_sessions");
  const { data: ended } = await admin.from("knock_sessions").select("ended_at, last_tap_at, ended_automatically").eq("user_id", people.overnight.id).single();
  check(
    "the job ends a session left open from yesterday at its last tap, marked automatic",
    // The row's state, not the count: the five-minute job on this database
    // may have ended it a moment before this call did.
    !runError && typeof ran === "number" && ended?.ended_automatically === true && new Date(ended.ended_at).getTime() === new Date(ended.last_tap_at).getTime(),
    `${runError?.message ?? ""} ${JSON.stringify(ended)}`,
  );
  const overnight = await signIn(context, people.overnight);
  await openSession(overnight);
  const summary = await text(overnight.getByTestId("session-summary"));
  const yesterdayDay = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(yesterdayStart - 6 * HOUR));
  check(
    "the next day, its summary says it ended automatically, with its day, the doors and conversations",
    summary.startsWith(`Done in ${HOOD}`) &&
      summary.includes("Ended on its own at midnight. It counts up to the last tap, at ") &&
      summary.includes("12 doors, 4 conversations") &&
      summary.replace(/\./g, "").toLowerCase().includes(yesterdayDay.replace(/\./g, "").toLowerCase()),
    summary,
  );

  // 3. The team's neighbourhoods as they type, and the first spelling kept.
  const typer = await signIn(context, people.typer);
  await openSession(typer);
  await typer.fill("#knock-neighbourhood", "");
  await typer.locator("#knock-neighbourhood").pressSequentially(`test hood ${stamp}`.slice(0, 12));
  const suggested = await typer.getByTestId("neighbourhood-suggestions").getByRole("button").allInnerTexts();
  check("typing part of a place the team knocked suggests it, with the team's spelling", suggested.some((value) => value.includes(HOOD)), suggested.join(" | "));
  const tapTarget = await typer.getByTestId("neighbourhood-suggestions").getByRole("button").first().boundingBox();
  check("each suggestion is a full tap target", tapTarget !== null && tapTarget.height >= 44, tapTarget ? `${Math.round(tapTarget.height)} px` : "none");
  await typer.fill("#knock-neighbourhood", HOOD.toLowerCase());
  await typer.getByRole("button", { name: "Start knocking" }).click();
  await typer.getByRole("heading", { name: `Knocking in ${HOOD}` }).waitFor({ timeout: 20000 }).catch(() => {});
  const { data: typedRow } = await admin.from("knock_sessions").select("neighbourhood").eq("user_id", people.typer.id).is("ended_at", null).single();
  check(
    "typed in lower case, the session keeps the first spelling, and the screen shows it",
    typedRow?.neighbourhood === HOOD && (await typer.getByRole("heading", { name: `Knocking in ${HOOD}` }).count()) === 1,
    typedRow?.neighbourhood ?? "none",
  );
  await context.close();

  // 4. View as: the summary and the reminder as the setter sees them, and
  // nothing written. The quiet setter's session is made quiet again (a new
  // one, 20 minutes old, no tap) for this.
  await admin.from("knock_sessions").update({ ended_at: new Date().toISOString() }).eq("user_id", people.quiet.id).is("ended_at", null);
  await admin.from("knock_sessions").insert({ user_id: people.quiet.id, neighbourhood: `${HOOD} South`, started_at: iso(Date.now() - 25 * MIN) });
  const footprint = async () => JSON.stringify((await admin.from("knock_sessions").select("id, ended_at, doors_knocked, conversations, last_tap_at, neighbourhood").in("user_id", [people.quiet.id, people.overnight.id]).order("id")).data);
  const before = await footprint();
  const ownerContext = await browser.newContext({ ...devices["iPhone 13"] });
  ownerSession = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
  const op = await ownerContext.newPage();
  for (const [who, person, look] of [
    ["the quiet setter", people.quiet, "tap-reminder"],
    ["the overnight setter", people.overnight, "session-ended-automatically"],
  ]) {
    await op.goto(`${base}/app/admin/people`);
    await op.waitForLoadState("networkidle").catch(() => {});
    await op.locator("tr", { hasText: person.email }).getByRole("button", { name: "View as" }).click();
    await op.waitForURL("**/app", { timeout: 30000 });
    await openSession(op);
    await op.screenshot({ path: `${process.env.OUT ?? "."}/sessions-view-as-${look}.png`, fullPage: true }).catch(() => {});
    check(`View as ${who} shows Session as they see it`, (await op.getByTestId(look).count()) === 1, (await text(op.locator("main"))).slice(0, 160));
    if (look === "tap-reminder") {
      await op.getByRole("button", { name: /^Doors \+1/ }).click();
      check("in View as, a tap is acted out and the reminder goes, as for them", (await op.getByTestId("tap-reminder").count()) === 0);
    }
    await op.getByRole("status").filter({ hasText: "Viewing as" }).getByRole("button", { name: "Exit" }).click();
    await op.waitForURL("**/app/admin/people", { timeout: 20000 });
  }
  check("View as wrote nothing to their sessions", (await footprint()) === before);
  await ownerSession.close();
  ownerSession = null;
  await ownerContext.close();
} catch (failure) {
  results.push(`SCRIPT ERROR ${failure?.message ?? String(failure)}`);
} finally {
  if (ownerSession) await ownerSession.close().catch(() => {});
  await browser.close();
  for (const person of Object.values(people)) {
    if (!person.id) continue;
    await admin.from("leads").delete().eq("created_by", person.id);
    await admin.from("knock_sessions").delete().eq("user_id", person.id);
    await admin.auth.admin.deleteUser(person.id);
  }
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const left = (list?.users ?? []).filter((user) => (user.email ?? "").startsWith("sessions-live-"));
  const { count: hoods } = await admin.from("knock_sessions").select("id", { count: "exact", head: true }).ilike("neighbourhood", `%${stamp}%`);
  check("the throwaway setters and their sessions are gone", left.length === 0 && hoods === 0, `${left.length} accounts, ${hoods} sessions`);
  console.log(`accounts remaining: ${JSON.stringify((list?.users ?? []).map((user) => user.email))}`);
  for (const line of results) console.log(line);
  const failed = results.filter((line) => line.startsWith("FAIL") || line.startsWith("SCRIPT ERROR")).length;
  console.log(`${results.filter((line) => line.startsWith("PASS")).length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
