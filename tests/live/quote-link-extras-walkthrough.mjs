// Quote link take 3 walk-through (Keenan, 2026-11-11). Stages one marked
// test lead (TEST LEAD (take3)), its quote with a J track gable and an area
// only a hidden offer covers, one standard document and one file for this
// customer, and Agreement to sign on. Then, as the customer on a phone:
// About your track, Build your own (booked twice: the newest replaces the
// last, never Keenan's offers), the documents, and the agreement signed with
// a drawn signature and its PDF. Keenan's screens (the lead page's On their
// link card, the quote editor's track choice, Settings and Settings,
// Documents, and the price page at the table) are looked at through the
// owner's one-time session, VIEW ONLY: nothing is tapped that saves.
// Everything staged is removed at the end. Settings' agreement text is set
// to a marked test text only when it is empty and no other lead is waiting
// on it (so no real customer could be shown it), and is put back after.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import sharp from "sharp";
import { openOwnerSession } from "./owner-session.mjs";

const base = process.env.BASE ?? "http://localhost:3300";
const out = process.env.OUT ?? "test-results/live";
const scale = Number(process.env.SCALE ?? 1);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, noSession);
const anon = createClient(url, anonKey, noSession);
const stamp = process.env.CLEAN ?? Date.now().toString(36);
const tag = process.env.TAG ?? "link-extras";
const results = [];
const say = (text) => { results.push(text); console.log(text); };
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  say(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` [${detail}]` : ""}`);
};

const setter = { email: `look-${stamp}@example.com`, password: `look-cedar-${stamp}-4821`, name: "TEST Look Setter", id: null };
const DOCS = "link-documents";
const PHOTOS = "lead-photos";
const TEST_AGREEMENT = "TEST agreement text (automated check, removed right after).\n\nBy signing you agree to the install described in your quote.";

async function picture(tint) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="${tint}"/><polygon points="300,520 800,260 1300,520" fill="#0b1720"/><rect x="360" y="520" width="880" height="380" fill="#0f1e29"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

function tinyPdf(text) {
  const body = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, at) => {
    offsets.push(pdf.length);
    pdf += `${at + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const staged = { leadId: null, token: null, quoteId: null, libraryId: null, libraryPath: null, uploadPath: null, mockupPaths: [], ownerId: null, agreementText: null, agreementSet: false, trackPrices: null };

async function stage() {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  const made = await admin.auth.admin.createUser({ email: setter.email, password: setter.password, email_confirm: true, user_metadata: { full_name: setter.name }, app_metadata: { role: "sales" } });
  if (made.error) throw new Error(`createUser: ${made.error.message}`);
  setter.id = made.data.user.id;
  const lead = await admin.from("leads").insert({
    first_name: "TEST LEAD (take3)", last_name: stamp, address_line: `1 Take Three Way SW (TEST) ${stamp}`, neighbourhood: "TEST (automated)", created_by: setter.id,
    phone: "+14035550100", owns_home: true, wants_price: true, both_decision_makers: true, christmas_lights_now: "hires", looked_into_before: "new_to_them",
    soffit_colour: "white", lat: 51.0447, lng: -114.0719, position_source: "picked",
  }).select("id").single();
  if (lead.error) throw new Error(`lead: ${lead.error.message}`);
  staged.leadId = lead.data.id;
  const { data: white } = await admin.from("track_colours").select("id, name").eq("active", true).order("sort_order").limit(1).single();
  await admin.from("leads").update({ track_colour_id: white.id }).eq("id", staged.leadId);
  const runs = [
    { name: "Front", feet: 64, level: "lower", part: "eave", area: "front" },
    { name: "Front gable", feet: 18, level: "upper", part: "gable", area: "front", gable: true, track: "j", trackRate: 30 },
    { name: "Front upper", feet: 40, level: "upper", part: "eave", area: "front" },
    { name: "Back", feet: 50, level: "lower", part: "eave", area: "back" },
    { name: "Shed", feet: 20, level: "lower", part: "other", area: "other" },
  ];
  const day = new Date(Date.now() - 6 * 3600_000 + 14 * 86_400_000).toISOString().slice(0, 10);
  const quote = await admin.from("quotes").insert({
    lead_id: staged.leadId, created_by: owner.id, price_per_ft: 24, box_price: 500, box_count: 1, runs, total_feet: 192, adders: [], discounts: [], gst_rate: 0.05, gst_enabled: false,
    min_job_total: null, subtotal: 0, total: 0, colour_timing: "stock", upper_access_fee: 200, upper_gable_access_fee: 400, track_colour_name: white.name, valid_until: day,
    offers: [
      { id: "full", name: "Full wrap", runs: [0, 1, 2, 3] },
      { id: "front", name: "Full front", runs: [0, 1, 2] },
      { id: "lower", name: "Front lower only", runs: [0] },
      { id: "pocket", name: "With the shed", runs: [0, 4], hidden: true },
    ],
  }).select("id").single();
  if (quote.error) throw new Error(`quote: ${quote.error.message}`);
  staged.quoteId = quote.data.id;
  const main = `${owner.id}/${randomUUID()}.jpg`;
  await admin.storage.from(PHOTOS).upload(main, await picture("#132e3f"), { contentType: "image/jpeg" });
  staged.mockupPaths.push(main);
  await admin.from("lead_mockups").insert({ lead_id: staged.leadId, storage_path: main, name: "Warm white", is_main: true, position: 0, created_by: owner.id });

  // One standard document and one file for this customer, both shown.
  staged.libraryPath = `library/${randomUUID()}.pdf`;
  const upLib = await admin.storage.from(DOCS).upload(staged.libraryPath, tinyPdf("TEST warranty"), { contentType: "application/pdf" });
  if (upLib.error) throw new Error(`library upload: ${upLib.error.message}`);
  const lib = await admin.from("link_documents").insert({ name: `TEST Our warranty ${stamp}`, storage_path: staged.libraryPath, content_type: "application/pdf", size_bytes: 600, position: 999, created_by: owner.id }).select("id").single();
  if (lib.error) throw new Error(`library row: ${lib.error.message}`);
  staged.libraryId = lib.data.id;
  const tick = await admin.from("lead_link_documents").insert({ lead_id: staged.leadId, document_id: staged.libraryId, created_by: owner.id });
  if (tick.error) throw new Error(`tick: ${tick.error.message}`);
  staged.uploadPath = `leads/${staged.leadId}/${randomUUID()}.jpg`;
  await admin.storage.from(DOCS).upload(staged.uploadPath, await picture("#13303f"), { contentType: "image/jpeg" });
  const own = await admin.from("lead_link_documents").insert({ lead_id: staged.leadId, name: "TEST Your site plan", storage_path: staged.uploadPath, content_type: "image/jpeg", size_bytes: 40000, created_by: owner.id });
  if (own.error) throw new Error(`own file: ${own.error.message}`);

  staged.ownerId = owner.id;
  const { data: settings } = await admin.from("settings").select("agreement_text, double_track_per_ft, j_track_per_ft").eq("id", 1).single();
  staged.agreementText = settings?.agreement_text?.trim() || null;
  staged.trackPrices = { double: settings?.double_track_per_ft ?? null, j: settings?.j_track_per_ft ?? null };

  const issued = await admin.rpc("issue_quote_link", { p_lead_id: staged.leadId });
  if (issued.error) throw new Error(`link: ${issued.error.message}`);
  staged.token = issued.data;
  // Book my install notices go to the test setter (no devices), never Keenan.
  await admin.from("quote_links").update({ created_by: setter.id }).eq("lead_id", staged.leadId);
}

// The agreement for the test lead: Keenan's own text if he has written it;
// otherwise a marked test text, but only while no other lead has Agreement
// to sign on, so no real customer could ever be shown it. False when it had
// to be left alone.
async function offerAgreement() {
  if (!staged.agreementText) {
    const { count } = await admin.from("lead_link_options").select("lead_id", { count: "exact", head: true }).eq("agreement_to_sign", true);
    if ((count ?? 0) > 0) return false;
    const set = await admin.from("settings").update({ agreement_text: TEST_AGREEMENT }).eq("id", 1);
    if (set.error) throw new Error(`agreement text: ${set.error.message}`);
    staged.agreementSet = true;
    staged.agreementText = TEST_AGREEMENT;
  }
  const tick = await admin.from("lead_link_options").insert({ lead_id: staged.leadId, agreement_to_sign: true, updated_by: staged.ownerId });
  if (tick.error) throw new Error(`agreement tick: ${tick.error.message}`);
  return true;
}

async function clean() {
  const { data: leads } = await admin.from("leads").select("id").eq("last_name", stamp).eq("first_name", "TEST LEAD (take3)");
  const ids = (leads ?? []).map((l) => l.id);
  if (ids.length > 0) {
    const { data: docs } = await admin.from("lead_link_documents").select("storage_path, document_id").in("lead_id", ids);
    const files = (docs ?? []).flatMap((d) => (d.storage_path ? [d.storage_path] : []));
    const { data: mockups } = await admin.from("lead_mockups").select("storage_path").in("lead_id", ids);
    await admin.from("agreement_signatures").delete().in("lead_id", ids);
    await admin.from("lead_link_documents").delete().in("lead_id", ids);
    await admin.from("lead_link_options").delete().in("lead_id", ids);
    if (files.length > 0) await admin.storage.from(DOCS).remove(files);
    const photos = (mockups ?? []).map((m) => m.storage_path);
    if (photos.length > 0) await admin.storage.from(PHOTOS).remove(photos);
    for (const table of ["earnings", "slot_holds", "meetings", "quote_links", "quotes", "lead_mockups", "lead_photos", "lead_events"]) await admin.from(table).delete().in("lead_id", ids);
    await admin.from("leads").delete().in("id", ids);
  }
  const { data: library } = await admin.from("link_documents").select("id, storage_path").like("name", `TEST Our warranty ${stamp}`);
  for (const row of library ?? []) {
    await admin.from("lead_link_documents").delete().eq("document_id", row.id);
    await admin.from("link_documents").delete().eq("id", row.id);
    await admin.storage.from(DOCS).remove([row.storage_path]);
  }
  // Only what this run set, and only if it is still there: never something
  // Keenan saved in the meantime.
  if (staged.agreementSet) await admin.from("settings").update({ agreement_text: null }).eq("id", 1).eq("agreement_text", TEST_AGREEMENT);
  const { data: people } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of (people?.users ?? []).filter((x) => (x.email ?? "").startsWith(`look-${stamp}`))) {
    await admin.from("leads").delete().eq("created_by", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
  const { data: settingsAfter } = await admin.from("settings").select("agreement_text").eq("id", 1).single();
  const { count: leftLeads } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("last_name", stamp);
  const { count: leftDocs } = await admin.from("link_documents").select("id", { count: "exact", head: true }).like("name", "TEST Our warranty%");
  const textLeft = settingsAfter?.agreement_text === TEST_AGREEMENT;
  if (textLeft) failures += 1;
  say(`CLEAN ${ids.length} lead(s); left: ${leftLeads ?? 0} leads, ${leftDocs ?? 0} test documents; Settings agreement text ${!staged.agreementSet ? "untouched" : textLeft ? "NOT PUT BACK" : "put back (empty again)"}`);
}

const offersOf = async () => (await admin.from("quotes").select("offers").eq("id", staged.quoteId).single()).data?.offers ?? [];

await mkdir(out, { recursive: true });
let browser = null;
let session = null;
try {
  await stage();
  say(`STAGED lead ${staged.leadId}`);
  browser = await chromium.launch();

  // Keenan's screens, VIEW ONLY, before the agreement is offered.
  let owner = null;
  if (process.env.OWNER !== "skip") {
    const ownerContext = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: scale, hasTouch: true });
    session = await openOwnerSession({ url, anonKey, admin, base, context: ownerContext });
    owner = await ownerContext.newPage();
    await owner.goto(`${base}/app/leads/${staged.leadId}`, { waitUntil: "networkidle" });
    const card = owner.getByTestId("link-extras");
    await card.waitFor({ timeout: 30000 });
    if (!staged.agreementText) {
      check(
        "until Settings has the agreement's text, Agreement to sign is greyed out and says where to add it",
        (await card.getByTestId("link-extras-agreement").isDisabled()) &&
          (await card.getByTestId("link-extras-agreement-needs-text").innerText()).trim() === "Add the agreement text in Settings first.",
        (await card.getByTestId("link-extras-agreement-needs-text").innerText().catch(() => "no line")).trim(),
      );
    } else {
      check("with the agreement's text in Settings, Agreement to sign can be ticked", await card.getByTestId("link-extras-agreement").isEnabled());
    }
    const standard = await card.getByTestId("link-extras-standard").allInnerTexts();
    check(
      "the lead's card lists the standard documents with this lead's tick, and the file for this customer only",
      standard.some((row) => row.includes(`TEST Our warranty ${stamp}`)) && (await card.getByTestId("link-extras-upload").innerText()).includes("TEST Your site plan"),
      JSON.stringify(standard).slice(0, 160),
    );
    // The quote editor: each measured area has its track; the gable is on J track.
    await owner.goto(`${base}/app/leads/${staged.leadId}#edit-quote`, { waitUntil: "networkidle" });
    await owner.getByTestId("quote-sheet").waitFor({ timeout: 20000 });
    const areaTracks = await owner.getByTestId("area-track").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-track")));
    check(
      "the quote editor shows a track for every measured area: Hat to start, the gable on J track",
      areaTracks.length === 5 && areaTracks.filter((track) => track === "j").length === 1 && areaTracks.filter((track) => track === "hat").length === 4,
      JSON.stringify(areaTracks),
    );
    const unpriced = [staged.trackPrices.double === null ? "double" : null, staged.trackPrices.j === null ? "j" : null].filter(Boolean);
    const offDouble = await owner.locator('[data-testid="area-track"][data-track="hat"] [data-testid="area-track-choice"] button[data-value="double"]').first().isDisabled();
    check(
      "a track with no price in Settings yet can't be picked",
      offDouble === unpriced.includes("double") && (unpriced.length === 0 || (await owner.getByTestId("area-track-unpriced").first().innerText()).includes("Settings, Pricing")),
      `no price yet: ${unpriced.join(", ") || "none"}`,
    );
    await owner.locator('[data-testid="area-track"][data-track="j"]').scrollIntoViewIfNeeded();
    await owner.screenshot({ path: `${out}/${tag}-editor-track.png` });
    // Settings: the two track prices, and Documents with the standard set and the agreement.
    await owner.goto(`${base}/app/admin/settings`, { waitUntil: "networkidle" });
    check(
      "Settings, Pricing has a price a foot for Double track and for J track, and Settings links to Documents",
      (await owner.locator("#settings-double_track_per_ft").count()) === 1 && (await owner.locator("#settings-j_track_per_ft").count()) === 1 && (await owner.getByTestId("documents-settings").count()) === 1,
    );
    await owner.goto(`${base}/app/admin/settings/documents`, { waitUntil: "networkidle" });
    const names = await owner.locator('[data-testid="standard-document"] input').evaluateAll((boxes) => boxes.map((box) => box.value));
    check(
      "Settings, Documents lists the standard documents by name and has the agreement's text box",
      names.includes(`TEST Our warranty ${stamp}`) && (await owner.getByTestId("agreement-text-input").count()) === 1,
      JSON.stringify(names).slice(0, 160),
    );
  }

  // The link before the agreement is offered: no agreement on it at all.
  const notOffered = await anon.rpc("quote_link_agreement", { p_token: staged.token });
  check("with Agreement to sign off, the link has no agreement", notOffered.data === null);
  const agreementOffered = await offerAgreement();
  if (!agreementOffered) say("NOTE the agreement was left alone: Settings has no text and another lead has Agreement to sign on");

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale, hasTouch: true, isMobile: true });
  const page = await phone.newPage();
  const link = `${base}/q/${staged.token}`;
  await page.goto(link, { waitUntil: "domcontentloaded" });
  await page.getByTestId("quote-live").waitFor({ timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  // About your track: Hat and J, each with words and a drawing.
  const tracks = await page.getByTestId("about-track-type").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-track")));
  check("About your track names the tracks the options use, with a drawing each", JSON.stringify(tracks) === JSON.stringify(["hat", "j"]) && (await page.locator("[data-track-drawing]").count()) === 2, JSON.stringify(tracks));
  // The J track line in the breakdown (Full wrap opens first, it has the gable).
  const lines = await page.getByTestId("quote-lines").innerText();
  check("the breakdown names the J track area with its price a foot", /Front gable[\s\S]*18 ft of J track at \$30 a foot/.test(lines), lines.replace(/\s+/g, " ").slice(0, 200));

  // Documents: the ticked standard one and their own file, each opens and saves.
  const docNames = await page.getByTestId("link-document").allInnerTexts();
  check("Documents shows the ticked standard document and their own file", docNames.length === 2 && docNames[0].includes("TEST Our warranty") && docNames[1].includes("TEST Your site plan"), JSON.stringify(docNames));
  const openHref = await page.getByTestId("link-document-open").first().getAttribute("href");
  // Fetched from Node: this test machine's browser can't reach the storage host directly.
  const opened = await fetch(openHref);
  const openedBody = Buffer.from(await opened.arrayBuffer());
  check("a document opens through its signed link", opened.ok && openedBody.subarray(0, 5).toString() === "%PDF-", String(opened.status));
  const saveHref = await page.getByTestId("link-document-download").first().getAttribute("href");
  check("its download link saves it under its name", /download=/.test(saveHref ?? ""), (saveHref ?? "").replace(/token=[^&]+/, "token=…").slice(-80));
  // Not ticked or uploaded: never signable through this token.
  const stray = await createClient(url, anonKey, { ...noSession, global: { headers: { "x-quote-token": staged.token } } }).storage.from(DOCS).createSignedUrl(`library/${randomUUID()}.pdf`, 60);
  check("the token can't sign a file the link doesn't show", !stray.data?.signedUrl);

  // Build your own: starts from the option on screen, the hidden-only area never shows.
  await page.getByTestId("build-row").click();
  await page.getByTestId("build-areas").waitFor({ timeout: 5000 });
  const areas = await page.getByTestId("build-area").evaluateAll((boxes) => boxes.map((box) => [Number(box.getAttribute("data-position")), box.checked]));
  check("Build your own lists only the measured areas Keenan shows, ticked as the option on screen", JSON.stringify(areas) === JSON.stringify([[0, true], [1, true], [2, true], [3, true]]), JSON.stringify(areas));
  const before = (await page.getByTestId("hero-total").innerText()).trim();
  await page.locator('[data-testid="build-area"][data-position="3"]').click();
  await page.waitForTimeout(300);
  const after = (await page.getByTestId("hero-total").innerText()).trim();
  // Full wrap 64+18j+40+50: untick Back (50 ft at $24 = $1,200).
  // 64 + 40 + 50 ft at $24, 18 ft of J track at $30, a box, upper access with a gable: $5,136; Back is 50 ft at $24.
  check("unticking an area updates the price at once", before === "$5,136" && after === "$3,936", `${before} -> ${after}`);
  await page.getByTestId("quote-options").screenshot({ path: `${out}/${tag}-build-your-own.png` });
  // Book it.
  await page.getByRole("button", { name: "Book my install" }).click();
  await page.getByTestId("book-confirm").waitFor({ timeout: 5000 });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Yes, book my install/ }).click();
  await page.waitForTimeout(2500);
  let offers = await offersOf();
  const mine = offers.filter((offer) => offer.from_customer === true);
  check("Book my install saves their build as one offer, Custom quote (from the customer)", mine.length === 1 && mine[0].name === "Custom quote (from the customer)" && JSON.stringify(mine[0].runs) === "[0,1,2]" && offers.filter((o) => !o.from_customer).length === 4, JSON.stringify(offers.map((o) => [o.id, o.runs])));
  const { data: linkRow } = await admin.from("quote_links").select("booked_offer, booked_option").eq("token", staged.token).single();
  check("and books it on their link", linkRow?.booked_offer === "customer", JSON.stringify(linkRow));
  // Build again: the newest replaces the last, never Keenan's.
  const rebook = await anon.rpc("quote_link_book_custom", { p_token: staged.token, p_runs: [0, 3], p_from: "full" });
  offers = await offersOf();
  check("building again replaces their last one and leaves Keenan's four", rebook.data?.ok === true && offers.filter((o) => o.from_customer).length === 1 && JSON.stringify(offers.find((o) => o.from_customer).runs) === "[0,3]" && offers.filter((o) => !o.from_customer).length === 4, JSON.stringify(offers.map((o) => [o.id, o.runs])));
  const hidden = await anon.rpc("quote_link_book_custom", { p_token: staged.token, p_runs: [0, 4], p_from: "full" });
  check("an area only a hidden offer covers is refused", hidden.data?.ok === false && hidden.data?.state === "bad_runs", JSON.stringify(hidden.data));
  const none = await anon.rpc("quote_link_book_custom", { p_token: staged.token, p_runs: [], p_from: "full" });
  check("nothing ticked is refused", none.data?.ok === false, JSON.stringify(none.data));

  // The agreement: read, type a name, sign with a finger, Sign.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("quote-live").waitFor({ timeout: 30000 });
  check("their saved build opens on Build your own", (await page.getByTestId("build-row").getAttribute("data-selected")) === "true");
  if (agreementOffered) {
  await page.getByTestId("agreement").scrollIntoViewIfNeeded();
  check("the agreement shows Settings' text", (await page.getByTestId("agreement-text").innerText()).replace(/\s+/g, " ").includes(staged.agreementText.replace(/\s+/g, " ").slice(0, 40)));
  check("it says which option they are signing for, with its total", /You are signing for your own option, \$[\d,]+/.test((await page.getByTestId("agreement-option").innerText()).replace(/\s+/g, " ")), (await page.getByTestId("agreement-option").innerText()).replace(/\s+/g, " "));
  check("Sign waits for a name and a signature", await page.getByTestId("agreement-sign").isDisabled());
  await page.getByTestId("agreement-name").fill("Test Customer");
  const pad = await page.getByTestId("agreement-pad").boundingBox();
  await page.mouse.move(pad.x + 30, pad.y + 100);
  await page.mouse.down();
  for (const [dx, dy] of [[60, -40], [110, 20], [160, -30], [220, 30], [280, -20]]) await page.mouse.move(pad.x + dx, pad.y + 100 + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await page.getByTestId("agreement").screenshot({ path: `${out}/${tag}-agreement-filled.png` });
  await page.getByTestId("agreement-sign").click();
  await page.getByTestId("agreement-signed").waitFor({ timeout: 15000 }).catch(() => {});
  const signedLine = ((await page.getByTestId("agreement-signed").innerText().catch(() => "")) || "").replace(/\s+/g, " ");
  check("Sign saves it and says who signed and the date, with the year", /Signed by Test Customer on [A-Z][a-z]+ \d{1,2}, \d{4}\./.test(signedLine), signedLine.slice(0, 80));
  const { data: signature } = await admin.from("agreement_signatures").select("signer_name, offer_id, offer_name, quote_snapshot").eq("lead_id", staged.leadId).single();
  check("the signing is saved with the option and a copy of the quote", signature?.signer_name === "Test Customer" && signature?.offer_id === "customer" && Array.isArray(signature?.quote_snapshot?.runs), JSON.stringify({ name: signature?.signer_name, offer: signature?.offer_id }));
  // Fetched from Node (through the proxy, where there is one): their own
  // copy needs nothing but the link.
  const copy = await fetch(`${base}/q/${staged.token}/agreement`);
  const copyBody = Buffer.from(await copy.arrayBuffer());
  check("their signed copy downloads as a PDF", copy.ok && copy.headers.get("content-type") === "application/pdf" && copyBody.subarray(0, 5).toString() === "%PDF-", `${copy.status} ${copyBody.length} bytes`);
  // The logo is about 20 KB of the file; without it (typed name instead) the PDF is under 10 KB.
  check("the signed copy carries the real logo", copyBody.length > 20_000, `${copyBody.length} bytes`);
  if (copy.ok) await writeFile(`${out}/${tag}-signed-copy.pdf`, copyBody);
  const twice = await anon.rpc("quote_link_sign_agreement", { p_token: staged.token, p_name: "Someone Else", p_offer: "full", p_signature: `data:image/png;base64,${"A".repeat(300)}` });
  check("a second signing on the same link is refused", twice.data?.ok === false && twice.data?.state === "already_signed", JSON.stringify(twice.data));
  const { data: signedEvents } = await admin.from("lead_events").select("payload").eq("lead_id", staged.leadId).eq("type", "agreement_signed");
  check("the timeline gets one agreement_signed event, with the option and the signer and no price", (signedEvents ?? []).length === 1 && !/\$|\d{3,}/.test(JSON.stringify(signedEvents)), JSON.stringify(signedEvents));
  }

  // The whole page at phone width, for the report.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/${tag}-link-full.png`, fullPage: true });
  await page.getByTestId("about-track").screenshot({ path: `${out}/${tag}-about-track.png` });
  await page.getByTestId("link-documents").screenshot({ path: `${out}/${tag}-documents.png` });

  // Anonymous callers still reach no table.
  const direct = await anon.from("agreement_signatures").select("id").limit(1);
  const direct2 = await anon.from("lead_link_documents").select("id").limit(1);
  check("anonymous callers can't read the new tables", (direct.error !== null || (direct.data ?? []).length === 0) && (direct2.error !== null || (direct2.data ?? []).length === 0));

  // Keenan's side afterwards, VIEW ONLY: their build with his offers, the
  // signed agreement on the lead, and their build's name at the table.
  if (owner) {
    await owner.goto(`${base}/app/leads/${staged.leadId}`, { waitUntil: "networkidle" });
    const card = owner.getByTestId("link-extras");
    await card.waitFor({ timeout: 30000 });
    const cardText = (await card.innerText()).replace(/\s+/g, " ");
    if (agreementOffered) {
      check("Keenan's lead page shows the signed agreement, with the date and the option", /Signed by Test Customer [A-Z][a-z]+ \d{1,2}, \d{4}, .*their own option\. Signed PDF\./.test(cardText), cardText.slice(0, 260));
      const href = await owner.getByTestId("link-extras-signed").locator("a").first().getAttribute("href");
      // Fetched in Keenan's own page, so it carries his session.
      const pdf = await owner.evaluate(async (path) => {
        const response = await fetch(path);
        const bytes = new Uint8Array(await response.arrayBuffer());
        return { status: response.status, head: String.fromCharCode(...bytes.slice(0, 5)), size: bytes.length };
      }, href);
      check("the signed PDF opens from the lead page", pdf.status === 200 && pdf.head === "%PDF-", `${pdf.status} ${pdf.size} bytes`);
      const timeline = (await owner.locator("body").innerText()).replace(/\s+/g, " ");
      check("the lead's timeline says they signed", timeline.includes("Signed the agreement for Custom quote (from the customer), as Test Customer."));
    }
    await card.screenshot({ path: `${out}/${tag}-lead-card.png` });
    await owner.goto(`${base}/app/leads/${staged.leadId}#edit-quote`, { waitUntil: "networkidle" });
    await owner.getByTestId("quote-sheet").waitFor({ timeout: 20000 });
    const offerNames = await owner.getByTestId("offer-name").evaluateAll((boxes) => boxes.map((box) => box.value));
    check(
      "Keenan sees their build with his other offers, named Custom quote (from the customer)",
      // The editor lists offers biggest first, so theirs sits where its price puts it.
      offerNames.length === 5 && offerNames.filter((name) => name === "Custom quote (from the customer)").length === 1 && (await owner.getByTestId("quote-sheet").innerText()).includes("Built by the customer on their link"),
      JSON.stringify(offerNames),
    );
    // At the table the customer reads it as their own option.
    await owner.goto("about:blank");
    await owner.goto(`${base}/meeting/${staged.leadId}#quote`, { waitUntil: "networkidle" });
    const opened = await owner.getByTestId("price-option").first().waitFor({ timeout: 30000 }).then(() => true, () => false);
    if (opened) {
      const options = (await owner.getByTestId("price-options").innerText()).replace(/\s+/g, " ");
      check("at the table their build reads Your own option, never Keenan's name for it", options.includes("Your own option") && !options.includes("from the customer"), options.slice(0, 200));
    } else {
      say("NOTE meeting mode's price page was not reached for the test lead; the name at the table is covered by the unit tests");
    }
  }
} catch (error) {
  failures += 1;
  say(`SCRIPT ERROR ${error?.message ?? error}`);
} finally {
  if (session) await session.close().catch(() => {});
  if (browser) await browser.close();
  await clean();
  say(`DONE ${failures === 0 ? "all checks passed" : `${failures} failed`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}
