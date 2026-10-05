import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const history = Math.max(1, Number(process.argv[2]) || 1000);
const seconds = Math.max(5, Number(process.argv[3]) || 25);
const since = process.argv[4] ? Date.parse(process.argv[4]) : -Infinity;
if (Number.isNaN(since)) throw new Error("El cuarto argumento debe ser una fecha ISO valida.");
const child = spawn(process.execPath, ["node_modules/convex/bin/main.js", "logs", "--history", String(history), "--jsonl"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
const rows = new Map();
const seen = new Set();
let first = Infinity;
let last = -Infinity;
let errors = 0;
let stopped = false;
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  let log;
  try { log = JSON.parse(line); } catch { return; }
  if (log.kind !== "Completion" || seen.has(log.executionId)) return;
  if (log.executionTimestamp * 1000 < since) return;
  seen.add(log.executionId);
  const usage = log.usageStats ?? {};
  const row = rows.get(log.identifier) ?? { function: log.identifier, calls: 0, cached: 0, errors: 0, readBytes: 0, writeBytes: 0, documentsRead: 0, callers: {} };
  row.calls++;
  row.cached += Number(log.cachedResult);
  row.errors += Number(Boolean(log.error));
  row.readBytes += usage.databaseIoReadBytes ?? 0;
  row.writeBytes += usage.databaseIoWriteBytes ?? 0;
  row.documentsRead += usage.databaseReadDocuments ?? 0;
  row.callers[log.caller] = (row.callers[log.caller] ?? 0) + 1;
  rows.set(log.identifier, row);
  if (log.error) errors++;
  first = Math.min(first, log.executionTimestamp * 1000);
  last = Math.max(last, log.executionTimestamp * 1000);
});
// Only aggregate usage metadata: never print identities, arguments or log messages.
child.stderr.resume();
const timer = setTimeout(() => { stopped = true; child.kill(); }, seconds * 1000);
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("close", (code) => {
  clearTimeout(timer);
  const functions = [...rows.values()].sort((a, b) => b.readBytes + b.writeBytes - a.readBytes - a.writeBytes);
  const readBytes = functions.reduce((sum, row) => sum + row.readBytes, 0);
  const writeBytes = functions.reduce((sum, row) => sum + row.writeBytes, 0);
  for (const row of functions) row.sharePercent = Number((100 * (row.readBytes + row.writeBytes) / (readBytes + writeBytes || 1)).toFixed(2));
  console.log(JSON.stringify({ deployment: "configured CLI deployment", completions: seen.size, errors, fromUtc: Number.isFinite(first) ? new Date(first).toISOString() : null, toUtc: Number.isFinite(last) ? new Date(last).toISOString() : null, readBytes, writeBytes, functions }, null, 2));
  if (!seen.size || (!stopped && code)) process.exitCode = 1;
});
