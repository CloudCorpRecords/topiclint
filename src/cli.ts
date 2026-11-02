#!/usr/bin/env node
/**
 * topiclint CLI.
 *
 *   topiclint lint <topic> [more topics...]
 *   topiclint check <path> [more paths...]
 *   topiclint mcp
 *
 * Each topic/path is one argument; a single argument may also be a
 * newline-delimited list. Both checks are local and offline; there
 * are no credentials to check. Reports print as JSON and are not
 * errors when they contain findings.
 * Exit codes: 0 success, 1 runtime error, 2 usage error.
 */
import { checkUnsNamespace, formatPayload, lintSparkplugTopic, VERSION } from "./topiclint.js";

function usage(): never {
  console.error(`Usage:
  topiclint lint <topic> [more topics...]
  topiclint check <path> [more paths...]
  topiclint mcp
  topiclint --version

lint validates Sparkplug B topic grammar; check reviews UNS naming consistency.`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const known = ["lint", "check"];
  if (!known.includes(cmd)) usage();
  // Argument validation first: at least one topic/path is required,
  // and no flags are defined for these subcommands.
  if (rest.length === 0 || rest.some((a) => a.startsWith("--"))) usage();
  try {
    const out =
      cmd === "lint" ? lintSparkplugTopic(rest) : checkUnsNamespace(rest);
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
