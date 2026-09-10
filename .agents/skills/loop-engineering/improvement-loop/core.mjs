import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const LOOP_DIR = ".agents/skills/loop-engineering/improvement-loop-state";
const DEFAULT_CONFIG = {
  version: 1,
  promotionThreshold: 2,
  autoCommit: true,
  qualityGates: ["pnpm typecheck", "pnpm test", "pnpm lint"],
};
const SOURCES = new Set(["user-correction", "test-failure", "review"]);
const VERIFICATION_STATUSES = new Set(["pending", "passed", "failed"]);

function storePaths(root) {
  const directory = join(root, LOOP_DIR);
  return {
    directory,
    config: join(directory, "config.json"),
    observations: join(directory, "observations.jsonl"),
    rules: join(directory, "rules.json"),
    activeRules: join(directory, "active-rules.md"),
    lock: join(directory, ".state.lock"),
  };
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readJsonLines(path) {
  try {
    const text = await readFile(path, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function atomicWrite(path, content) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

async function withLock(root, operation) {
  const paths = storePaths(root);
  await mkdir(paths.directory, { recursive: true });
  let handle;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      handle = await open(paths.lock, "wx");
      break;
    } catch (error) {
      if (error?.code !== "EEXIST" || attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  try {
    return await operation(paths);
  } finally {
    await handle?.close();
    await unlink(paths.lock).catch(() => undefined);
  }
}

function requireText(value, name, maxLength = 1000) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return sanitizeText(value).slice(0, maxLength);
}

function normalizeRuleText(value) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function validateFingerprint(value) {
  const fingerprint = requireText(value, "fingerprint", 100).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fingerprint)) {
    throw new Error("fingerprint must be lower-case kebab-case");
  }
  return fingerprint;
}

function occurrenceKey(observation) {
  return `${observation.sessionId}:${observation.turnId}`;
}

function summarizeRules(rules, observations) {
  return rules.map((rule) => {
    const evidence = observations.filter((item) => rule.evidenceIds.includes(item.id));
    return {
      ...rule,
      occurrenceCount: new Set(evidence.map(occurrenceKey)).size,
    };
  });
}

async function persist(paths, observations, rules) {
  await atomicWrite(
    paths.observations,
    observations.length > 0
      ? `${observations.map((item) => JSON.stringify(item)).join("\n")}\n`
      : "",
  );
  await atomicWrite(paths.rules, `${JSON.stringify({ version: 1, rules }, null, 2)}\n`);
  await atomicWrite(paths.activeRules, renderActiveRules(rules));
}

function tryCommit(root, message) {
  const trackedPaths = [
    ".agents/skills/loop-engineering/improvement-loop-state/observations.jsonl",
    ".agents/skills/loop-engineering/improvement-loop-state/rules.json",
    ".agents/skills/loop-engineering/improvement-loop-state/active-rules.md",
  ];
  const result = spawnSync(
    "git",
    ["commit", "--only", "-m", message, "--", ...trackedPaths],
    { cwd: root, encoding: "utf8" },
  );
  return {
    committed: result.status === 0,
    message: result.status === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

// 🔵 Intent: Improvement records may include pasted credentials, so common secret forms are removed before persistence.
export function sanitizeText(value) {
  return String(value)
    .replace(
      /\b(OPENAI_API_KEY|API_KEY|TOKEN|SECRET)\s*=\s*[^\s]+/gi,
      "$1=[REDACTED]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .trim();
}

// 🔵 Intent: A deterministic bootstrap keeps hooks usable before any observation has been recorded.
export async function initializeStore(root, overrides = {}) {
  const paths = storePaths(root);
  await mkdir(paths.directory, { recursive: true });
  const currentConfig = await readJson(paths.config, {});
  const config = { ...DEFAULT_CONFIG, ...currentConfig, ...overrides };
  await atomicWrite(paths.config, `${JSON.stringify(config, null, 2)}\n`);
  const observations = await readJsonLines(paths.observations);
  const rulesDocument = await readJson(paths.rules, { version: 1, rules: [] });
  await persist(paths, observations, summarizeRules(rulesDocument.rules, observations));
  return config;
}

// 🔵 Intent: Consumers receive one consistent view assembled from the append-oriented log and derived rule index.
export async function loadState(root) {
  const paths = storePaths(root);
  const config = { ...DEFAULT_CONFIG, ...(await readJson(paths.config, {})) };
  const observations = await readJsonLines(paths.observations);
  const rulesDocument = await readJson(paths.rules, { version: 1, rules: [] });
  return {
    config,
    observations,
    rules: summarizeRules(rulesDocument.rules, observations),
  };
}

// 🔵 Intent: User corrections are deduplicated per turn so repeated tool calls cannot inflate promotion evidence.
export async function recordObservation(root, input) {
  if (!SOURCES.has(input.source)) throw new Error("invalid source");
  const fingerprint = validateFingerprint(input.fingerprint);
  const sessionId = requireText(input.sessionId, "sessionId", 200);
  const turnId = requireText(input.turnId, "turnId", 200);
  const desiredBehavior = requireText(input.desiredBehavior, "desiredBehavior");

  const result = await withLock(root, async (paths) => {
    const config = { ...DEFAULT_CONFIG, ...(await readJson(paths.config, {})) };
    const observations = await readJsonLines(paths.observations);
    let rules = (await readJson(paths.rules, { version: 1, rules: [] })).rules;
    const duplicate = observations.find(
      (item) =>
        item.fingerprint === fingerprint &&
        item.sessionId === sessionId &&
        item.turnId === turnId,
    );
    if (duplicate) return { observation: duplicate, duplicate: true, config, changed: false };

    const now = new Date().toISOString();
    const observation = {
      id: randomUUID(),
      timestamp: now,
      sessionId,
      turnId,
      source: input.source,
      scope: requireText(input.scope, "scope", 200),
      summary: requireText(input.summary, "summary"),
      desiredBehavior,
      fingerprint,
      evidenceRefs: [...new Set((input.evidenceRefs ?? []).map((item) => sanitizeText(item).slice(0, 300)))],
      verification: { status: "pending", commands: [], updatedAt: now },
    };
    observations.push(observation);

    const existing = rules.find((rule) => rule.fingerprint === fingerprint);
    if (existing) {
      existing.evidenceIds = [...new Set([...existing.evidenceIds, observation.id])];
      existing.updatedAt = now;
    } else {
      rules.push({
        fingerprint,
        scope: observation.scope,
        rule: desiredBehavior,
        status: "pending",
        occurrenceCount: 1,
        evidenceIds: [observation.id],
        createdAt: now,
        updatedAt: now,
        disabledReason: null,
        blockReason: null,
      });
    }

    if (input.contradicts) {
      const contradicted = rules.find(
        (rule) => rule.fingerprint === validateFingerprint(input.contradicts),
      );
      if (contradicted?.status === "active") {
        contradicted.status = "disabled";
        contradicted.disabledReason = `Contradicted by observation ${observation.id}`;
        contradicted.updatedAt = now;
      }
    }

    rules = summarizeRules(rules, observations);
    await persist(paths, observations, rules);
    return { observation, duplicate: false, config, changed: true };
  });

  let commit = null;
  if (result.changed && result.config.autoCommit && input.contradicts) {
    commit = tryCommit(root, `chore(loop): disable contradicted rule ${input.contradicts}`);
  }
  return { observation: result.observation, duplicate: result.duplicate, commit };
}

// 🔵 Intent: Verification belongs to a turn, allowing the Stop hook to update every correction handled in that turn atomically.
export async function verifyTurn(root, input) {
  if (!VERIFICATION_STATUSES.has(input.status) || input.status === "pending") {
    throw new Error("status must be passed or failed");
  }
  return withLock(root, async (paths) => {
    const observations = await readJsonLines(paths.observations);
    const rulesDocument = await readJson(paths.rules, { version: 1, rules: [] });
    const now = new Date().toISOString();
    let updated = 0;
    for (const observation of observations) {
      if (
        observation.sessionId === input.sessionId &&
        observation.turnId === input.turnId
      ) {
        observation.verification = {
          status: input.status,
          commands: (input.commands ?? []).map((command) => sanitizeText(command).slice(0, 300)),
          updatedAt: now,
        };
        updated += 1;
      }
    }
    const rules = summarizeRules(rulesDocument.rules, observations);
    await persist(paths, observations, rules);
    return { updated };
  });
}

// 🔵 Intent: Promotion requires repeated independent evidence and successful verification, preventing one-off preferences from becoming policy.
export async function promoteEligibleRules(root) {
  const result = await withLock(root, async (paths) => {
    const config = { ...DEFAULT_CONFIG, ...(await readJson(paths.config, {})) };
    const observations = await readJsonLines(paths.observations);
    let rules = summarizeRules(
      (await readJson(paths.rules, { version: 1, rules: [] })).rules,
      observations,
    );
    const promoted = [];
    const now = new Date().toISOString();

    for (const rule of rules) {
      if (rule.status !== "pending" || rule.occurrenceCount < config.promotionThreshold) continue;
      const evidence = observations.filter((item) => rule.evidenceIds.includes(item.id));
      const verified = evidence.every((item) => item.verification.status === "passed");
      const meanings = new Set(evidence.map((item) => normalizeRuleText(item.desiredBehavior)));
      if (!verified) {
        rule.blockReason = "All occurrences must pass verification";
        continue;
      }
      if (meanings.size !== 1) {
        rule.blockReason = "Evidence with the same fingerprint has conflicting desired behavior";
        continue;
      }
      rule.status = "active";
      rule.rule = evidence.at(-1).desiredBehavior;
      rule.blockReason = null;
      rule.updatedAt = now;
      promoted.push(rule.fingerprint);
    }

    rules = summarizeRules(rules, observations);
    await persist(paths, observations, rules);
    return { promoted, config };
  });

  let commit = null;
  if (result.promoted.length > 0 && result.config.autoCommit) {
    commit = tryCommit(root, `chore(loop): promote ${result.promoted.join(", ")}`);
  }
  return { promoted: result.promoted, commit };
}

// 🟡 Intent: Explicit user approval can establish a foundational rule immediately without weakening automatic promotion safeguards.
export async function approveRule(root, input) {
  const fingerprint = validateFingerprint(input.fingerprint);
  const reason = requireText(input.reason, "reason", 500);
  const result = await withLock(root, async (paths) => {
    const config = { ...DEFAULT_CONFIG, ...(await readJson(paths.config, {})) };
    const observations = await readJsonLines(paths.observations);
    const rulesDocument = await readJson(paths.rules, { version: 1, rules: [] });
    const rules = summarizeRules(rulesDocument.rules, observations);
    const rule = rules.find((candidate) => candidate.fingerprint === fingerprint);
    if (!rule) throw new Error(`rule not found: ${fingerprint}`);
    const now = new Date().toISOString();
    rule.status = "active";
    rule.blockReason = null;
    rule.approval = { source: "user", reason, approvedAt: now };
    rule.updatedAt = now;
    await persist(paths, observations, rules);
    return { fingerprint, config };
  });
  const commit = result.config.autoCommit ? tryCommit(root, `chore(loop): approve ${result.fingerprint}`) : null;
  return { approved: [result.fingerprint], commit };
}

// 🔵 Intent: Session context contains only compact active policy, never raw feedback or transcripts.
export function renderActiveRules(rules) {
  const active = rules.filter((rule) => rule.status === "active");
  const body =
    active.length === 0
      ? "No learned rules are active yet.\n"
      : `${active
          .map(
            (rule) =>
              `- **${rule.fingerprint}** (${rule.scope}): ${rule.rule} [evidence: ${rule.occurrenceCount}]`,
          )
          .join("\n")}\n`;
  return `# Active Improvement Rules\n\n> Generated from verified observations. Do not edit manually.\n\n${body}`;
}
