#!/usr/bin/env node
import { resolve } from "node:path";
import {
  initializeStore,
  loadState,
  promoteEligibleRules,
  recordObservation,
  verifyTurn,
} from "./core.mjs";

function parseArguments(values) {
  const result = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    index += 1;
    if (key === "evidenceRef" || key === "command") {
      result[key] = [...(result[key] ?? []), next];
    } else {
      result[key] = next;
    }
  }
  return result;
}

function usage() {
  return `Usage:
  pnpm loop:init
  pnpm loop:record --source user-correction --session-id ID --turn-id ID --scope AREA \\
    --summary TEXT --desired-behavior TEXT --fingerprint kebab-case [--evidence-ref REF] [--contradicts RULE]
  pnpm loop:verify --session-id ID --turn-id ID --status passed|failed [--command COMMAND]
  pnpm loop:promote
  pnpm loop:status`;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArguments(rest);
  const root = resolve(args.root ?? process.cwd());

  if (command === "init") {
    console.log(JSON.stringify(await initializeStore(root), null, 2));
    return;
  }
  if (command === "record") {
    const result = await recordObservation(root, {
      source: args.source,
      sessionId: args.sessionId,
      turnId: args.turnId,
      scope: args.scope,
      summary: args.summary,
      desiredBehavior: args.desiredBehavior,
      fingerprint: args.fingerprint,
      evidenceRefs: args.evidenceRef ?? [],
      contradicts: args.contradicts,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "verify") {
    const result = await verifyTurn(root, {
      sessionId: args.sessionId,
      turnId: args.turnId,
      status: args.status,
      commands: args.command ?? [],
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "promote") {
    console.log(JSON.stringify(await promoteEligibleRules(root), null, 2));
    return;
  }
  if (command === "status") {
    const state = await loadState(root);
    console.log(JSON.stringify({ config: state.config, rules: state.rules }, null, 2));
    return;
  }
  throw new Error(usage());
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

