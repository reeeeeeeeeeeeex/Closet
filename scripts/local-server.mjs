import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const [command = "start", ...extra] = process.argv.slice(2);
if (!["dev", "start", "build"].includes(command)) throw new Error("Expected dev, start or build");
const host = process.env.CLOSET_HOST || "127.0.0.1"; const port = process.env.CLOSET_PORT || "4320";
const cli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(process.execPath, [cli, command, ...(command === "build" ? ["--webpack"] : ["--hostname", host, "--port", port]), ...extra], { stdio: "inherit", env: { ...process.env, CLOSET_HOST: host, NEXT_TELEMETRY_DISABLED: "1" } });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", error => { console.error(error.message); process.exitCode = 1; }); child.on("exit", code => { process.exitCode = code ?? 1; });
