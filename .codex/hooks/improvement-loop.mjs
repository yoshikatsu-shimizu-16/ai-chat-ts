#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  initializeStore,
  loadState,
  promoteEligibleRules,
  verifyTurn,
} from "../../.agents/skills/loop-engineering/improvement-loop/core.mjs";

async function readInput() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text.trim() ? JSON.parse(text) : {};
}

function repositoryRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : resolve(cwd);
}

function changedSourceFiles(root) {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3).split(" -> ").at(-1))
    .filter(
      (path) =>
        /\.(?:[cm]?[jt]sx?)$/.test(path) &&
        !path.startsWith(".agents/skills/loop-engineering/improvement-loop/") &&
        !path.startsWith(".codex/") &&
        !path.startsWith(".agents/skills/loop-engineering/"),
    );
}

function runGate(root, command) {
  const result = spawnSync(command, {
    cwd: root,
    encoding: "utf8",
    shell: true,
    timeout: 120_000,
  });
  return {
    command,
    passed: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().slice(-2000),
  };
}

async function sessionStart(root) {
  await initializeStore(root);
  const state = await loadState(root);
  const activeRules = await readFile(
    resolve(root, ".agents/skills/loop-engineering/improvement-loop-state/active-rules.md"),
    "utf8",
  );
  const pending = state.rules.filter((rule) => rule.status === "pending").length;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `${activeRules}\nPending improvement candidates: ${pending}. Apply active rules to implementation work.`,
    },
  };
}

function userPromptSubmit() {
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext:
        "If this prompt corrects code or working behavior you previously produced, use the loop-engineering skill and record one anonymized observation before finishing. Never store the raw prompt or secrets. Do not record ordinary feature requests or preference changes as corrections.",
    },
  };
}

async function stop(root, input) {
  const files = changedSourceFiles(root);
  if (files.length === 0) return {};
  const state = await loadState(root);
  const results = state.config.qualityGates.map((command) => runGate(root, command));
  const passed = results.every((result) => result.passed);
  await verifyTurn(root, {
    sessionId: input.session_id,
    turnId: input.turn_id,
    status: passed ? "passed" : "failed",
    commands: results.map((result) => result.command),
  });

  if (!passed) {
    const failures = results
      .filter((result) => !result.passed)
      .map((result) => `${result.command}:\n${result.output}`)
      .join("\n\n");
    if (input.stop_hook_active) {
      return { systemMessage: `Improvement quality gate is still failing:\n${failures}` };
    }
    return {
      decision: "block",
      reason: `The improvement quality gate failed. Fix these failures before finishing:\n${failures}`,
    };
  }

  const promotion = await promoteEligibleRules(root);
  return promotion.promoted.length > 0
    ? { systemMessage: `Promoted learned rules: ${promotion.promoted.join(", ")}` }
    : {};
}

async function main() {
  const action = process.argv[2];
  const input = await readInput();
  const root = repositoryRoot(input.cwd ?? process.cwd());
  if (action === "session-start") return sessionStart(root);
  if (action === "user-prompt-submit") return userPromptSubmit();
  if (action === "stop") return stop(root, input);
  if (action === "session-end") {
    await initializeStore(root);
    return {};
  }
  throw new Error(`Unknown hook action: ${action}`);
}

main()
  .then((output) => process.stdout.write(`${JSON.stringify(output)}\n`))
  .catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
