// Round 23: install days for walk-throughs. A lead's install day must be a
// day Keenan opened, and the pages that show days only show the next few
// weeks, so a walk-through opens its own: days in a range that Keenan has
// never touched (no row on his calendar) and nobody holds, opened for the
// run and removed at the end. His own days are never changed.

const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

// Opens `count` free days between today+from and today+to (inclusive),
// each taking `limits[i]` jobs (or 1). Returns the days, in order.
export async function openFreeDays(admin, today, { from, to, count = 1, limits = [] }) {
  const range = [];
  for (let n = from; n <= to; n += 1) range.push(addDays(today, n));
  const [{ data: rows }, { data: held }] = await Promise.all([
    admin.from("install_days").select("day").in("day", range),
    admin.from("leads").select("install_on").in("install_on", range),
  ]);
  const taken = new Set([...(rows ?? []).map((row) => row.day), ...(held ?? []).map((row) => row.install_on)]);
  const free = range.filter((day) => !taken.has(day)).slice(0, count);
  if (free.length < count) throw new Error(`only ${free.length} free install days between ${range[0]} and ${range.at(-1)}`);
  const { error } = await admin.from("install_days").insert(free.map((day, at) => ({ day, open: true, job_limit: limits[at] ?? 1 })));
  if (error) throw new Error(`install days: ${error.message}`);
  return free;
}

// Takes the walk-through's days off again: the test leads that hold them
// first, then the days themselves.
export async function closeOpenedDays(admin, days) {
  if (!days || days.length === 0) return;
  await admin.from("leads").update({ install_on: null }).in("install_on", days).like("first_name", "TEST LEAD%");
  await admin.from("install_days").delete().in("day", days);
}
