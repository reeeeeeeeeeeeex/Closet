import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
const [command = "start", ...extra] = process.argv.slice(2);
if (!["dev", "start", "build"].includes(command)) throw new Error("Expected dev, start or build");
const host = process.env.CLOSET_HOST || "127.0.0.1"; const port = process.env.CLOSET_PORT || "4320";
if (command !== "build" && !["127.0.0.1", "localhost", "::1"].includes(host)) {
  const directory = path.resolve(process.env.CLOSET_DATA_DIR || "data");
  let configured = existsSync(path.join(directory, "auth.json"));
  const filename = path.join(directory, "closet.sqlite");
  if (!configured && existsSync(filename)) {
    const database = new DatabaseSync(filename, { readOnly: true });
    try { configured = !!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").get() && !!database.prepare("SELECT id FROM accounts LIMIT 1").get(); }
    finally { database.close(); }
  }
  if (!configured) throw new Error("Start on localhost and create an account before enabling LAN access.");
}
const cli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(process.execPath, [cli, command, ...(command === "build" ? ["--webpack"] : ["--hostname", host, "--port", port]), ...extra], { stdio: "inherit", env: { ...process.env, CLOSET_HOST: host, NEXT_TELEMETRY_DISABLED: "1" } });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", error => { console.error(error.message); process.exitCode = 1; }); child.on("exit", code => { process.exitCode = code ?? 1; });
