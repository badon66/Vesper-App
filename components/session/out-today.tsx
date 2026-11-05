import type { OutTodayRow } from "@/lib/knock/session";
import { formatTime } from "@/lib/time";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// Who else is out today (Keenan, 2026-11-05): the ones still knocking first,
// then the ones who finished, so a setter knows which streets were knocked.
// nowOnly (Keenan's Home): only the ones out knocking right now. Read only;
// setters see every knock session because they work as a team.
export function OutToday({ rows: allRows, nowOnly = false }: { rows: OutTodayRow[]; nowOnly?: boolean }) {
  const rows = nowOnly ? allRows.filter((row) => row.out) : allRows;
  const out = rows.filter((row) => row.out).length;
  const title = nowOnly ? "Out knocking now" : "Out today";
  return (
    <section aria-labelledby="out-today-heading" className="flex flex-col gap-3" data-testid={nowOnly ? "out-now" : "out-today"}>
      <div>
        <h2 id="out-today-heading" className="text-lg font-bold">
          {title}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          {nowOnly
            ? rows.length === 0
              ? "Nobody is out knocking right now. When someone starts a session, they show here."
              : `${plural(out, "person", "people")} out now. Doors and conversations so far today.`
            : rows.length === 0
              ? "Nobody else has knocked yet today. When someone starts, they show here with their neighbourhood, doors and conversations."
              : out === 0
                ? "Nobody else is knocking right now. Counts are for today."
                : `${plural(out, "person", "people")} knocking now. Counts are for today.`}
        </p>
      </div>
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-md border" aria-label={title}>
          {rows.map((row) => (
            <li key={row.userId} className="flex flex-col gap-1 px-4 py-3" data-testid="out-today-row">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{row.name}</span>
                <span className="shrink-0 text-sm font-semibold">{row.out ? "Out now" : "Finished"}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {row.neighbourhoods.join(", then ")}
                {row.out ? `, since ${formatTime(row.from)}` : `, ${formatTime(row.from)} to ${formatTime(row.until ?? row.from)}`}
              </p>
              <p className="text-sm tabular-nums">
                {plural(row.doors, "door", "doors")}, {plural(row.conversations, "conversation", "conversations")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
