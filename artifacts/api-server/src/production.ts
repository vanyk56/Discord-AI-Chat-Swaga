import { spawn, type ChildProcess } from "node:child_process";

const children: ChildProcess[] = [];
let shuttingDown = false;

function start(name: string, args: string[], onExit: (code: number | null, signal: NodeJS.Signals | null) => void) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`${name} exited`, { code, signal });
    const index = children.indexOf(child);
    if (index >= 0) children.splice(index, 1);
    onExit(code, signal);
  });

  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(code), 5000).unref();
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

start("api-server", ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"], (code) => {
  shutdown(code ?? 1);
});

let botRestartAttempts = 0;

function startDiscordBot() {
  start("discord-bot", ["--enable-source-maps", "artifacts/api-server/dist/discord-bot.mjs"], () => {
    botRestartAttempts += 1;
    const delayMs = Math.min(30_000, 2_000 * botRestartAttempts);
    console.error(`discord-bot will restart in ${delayMs}ms`, { attempt: botRestartAttempts });
    setTimeout(() => {
      if (!shuttingDown) startDiscordBot();
    }, delayMs).unref();
  });
}

startDiscordBot();