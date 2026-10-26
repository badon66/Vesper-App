// Starts the production server on a spare port, runs every walk-through in
// this folder against it, then stops the server. Build first.
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const port = Number(process.env.LIVE_PORT ?? 3300);
const base = `http://localhost:${port}`;
const server = spawn("npx", ["next", "start", "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

async function ready() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${base}/login`);
      if (res.status === 200) return true;
    } catch {}
    if (/EADDRINUSE/.test(log)) return false;
    await sleep(1000);
  }
  return false;
}

let code = 1;
try {
  if (!(await ready())) throw new Error("server did not start: " + log.slice(-500));
  const files = (await readdir(new URL("./", import.meta.url))).filter((f) => f.endsWith("-walkthrough.mjs")).sort();
  code = 0;
  for (const file of files) {
    console.log(`\n== ${file}`);
    const exit = await new Promise((resolve) => {
      const child = spawn(process.execPath, [new URL(file, import.meta.url).pathname], { stdio: "inherit", env: { ...process.env, BASE: base } });
      child.on("exit", (c) => resolve(c ?? 1));
    });
    if (exit !== 0) code = exit;
  }
} catch (e) {
  console.error(e.message);
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
}
process.exit(code);
