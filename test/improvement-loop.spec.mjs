import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  approveRule,
  initializeStore,
  loadState,
  promoteEligibleRules,
  recordObservation,
  sanitizeText,
  verifyTurn,
} from "../.agents/skills/loop-engineering/improvement-loop/core.mjs";

const workspaces = [];

async function createWorkspace(config = {}) {
  const root = await mkdtemp(join(tmpdir(), "improvement-loop-"));
  workspaces.push(root);
  await initializeStore(root, { autoCommit: false, ...config });
  return root;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("sanitizeText", () => {
  it("redacts common API key and authorization formats", () => {
    const value = sanitizeText(
      "OPENAI_API_KEY=secret-value Bearer abcdefghijklmnop sk-example1234567890",
    );

    expect(value).not.toContain("secret-value");
    expect(value).not.toContain("abcdefghijklmnop");
    expect(value).not.toContain("sk-example1234567890");
    expect(value).toContain("[REDACTED]");
  });
});

describe("improvement rule lifecycle", () => {
  it("activates a user-approved foundational rule immediately", async () => {
    const root = await createWorkspace();
    await recordObservation(root, {
      source: "user-correction",
      sessionId: "session-a",
      turnId: "turn-a",
      scope: "naming",
      summary: "名前から対象ドメインが判断できない",
      desiredBehavior: "識別子に対象ドメインと役割を含める",
      fingerprint: "use-domain-specific-identifiers",
      evidenceRefs: ["app/chat.tsx"],
    });

    const result = await approveRule(root, {
      fingerprint: "use-domain-specific-identifiers",
      reason: "ユーザー承認: 基本原則として常時適用する",
    });
    const state = await loadState(root);

    expect(result.approved).toEqual(["use-domain-specific-identifiers"]);
    expect(state.rules[0]).toMatchObject({
      status: "active",
      occurrenceCount: 1,
      approval: { source: "user", reason: "ユーザー承認: 基本原則として常時適用する" },
    });
  });

  it("keeps one verified occurrence pending", async () => {
    const root = await createWorkspace({ promotionThreshold: 2 });
    await recordObservation(root, {
      source: "user-correction",
      sessionId: "session-a",
      turnId: "turn-a",
      scope: "tests",
      summary: "テストが実装のスキーマを複製していた",
      desiredBehavior: "テストは本番のexportを利用する",
      fingerprint: "tests-use-production-contract",
      evidenceRefs: ["test/chat-request.spec.ts"],
    });
    await verifyTurn(root, {
      sessionId: "session-a",
      turnId: "turn-a",
      status: "passed",
      commands: ["pnpm test"],
    });

    const result = await promoteEligibleRules(root);
    const state = await loadState(root);

    expect(result.promoted).toEqual([]);
    expect(state.rules[0]).toMatchObject({ status: "pending", occurrenceCount: 1 });
  });

  it("promotes after two distinct verified turns", async () => {
    const root = await createWorkspace({ promotionThreshold: 2 });
    for (const [sessionId, turnId] of [
      ["session-a", "turn-a"],
      ["session-a", "turn-b"],
    ]) {
      await recordObservation(root, {
        source: "user-correction",
        sessionId,
        turnId,
        scope: "comments",
        summary: "自明な処理を説明するコメントが多い",
        desiredBehavior: "コメントは設計理由だけを説明する",
        fingerprint: "comments-explain-why",
        evidenceRefs: ["app/chat.tsx"],
      });
      await verifyTurn(root, {
        sessionId,
        turnId,
        status: "passed",
        commands: ["pnpm typecheck", "pnpm test"],
      });
    }

    const result = await promoteEligibleRules(root);
    const state = await loadState(root);
    const activeRules = await readFile(
      join(root, ".agents", "skills", "loop-engineering", "improvement-loop-state", "active-rules.md"),
      "utf8",
    );

    expect(result.promoted).toEqual(["comments-explain-why"]);
    expect(state.rules[0]).toMatchObject({ status: "active", occurrenceCount: 2 });
    expect(activeRules).toContain("コメントは設計理由だけを説明する");
  });

  it("does not count duplicate records from the same turn", async () => {
    const root = await createWorkspace({ promotionThreshold: 2 });
    const input = {
      source: "review",
      sessionId: "session-a",
      turnId: "turn-a",
      scope: "implementation",
      summary: "既存コードを確認せず推測した",
      desiredBehavior: "変更前に関連コードを確認する",
      fingerprint: "inspect-before-editing",
      evidenceRefs: ["lib/chat-graph.ts"],
    };

    await recordObservation(root, input);
    await recordObservation(root, input);

    const state = await loadState(root);
    expect(state.observations).toHaveLength(1);
    expect(state.rules[0].occurrenceCount).toBe(1);
  });

  it("disables an active rule when a correction contradicts it", async () => {
    const root = await createWorkspace({ promotionThreshold: 1 });
    await recordObservation(root, {
      source: "user-correction",
      sessionId: "session-a",
      turnId: "turn-a",
      scope: "comments",
      summary: "理由を説明するコメントが必要だった",
      desiredBehavior: "重要な設計理由をコメントする",
      fingerprint: "document-design-intent",
      evidenceRefs: ["lib/chat-graph.ts"],
    });
    await verifyTurn(root, {
      sessionId: "session-a",
      turnId: "turn-a",
      status: "passed",
      commands: ["pnpm test"],
    });
    await promoteEligibleRules(root);

    await recordObservation(root, {
      source: "user-correction",
      sessionId: "session-b",
      turnId: "turn-b",
      scope: "comments",
      summary: "この領域ではコメント規則を適用しない",
      desiredBehavior: "対象領域に合わない規則を無効にする",
      fingerprint: "comments-scope-exception",
      evidenceRefs: ["app/chat.tsx"],
      contradicts: "document-design-intent",
    });

    const state = await loadState(root);
    expect(state.rules.find((rule) => rule.fingerprint === "document-design-intent"))
      .toMatchObject({ status: "disabled" });
  });

  it("does not promote when any occurrence failed verification", async () => {
    const root = await createWorkspace({ promotionThreshold: 2 });
    for (const [turnId, status] of [
      ["turn-a", "passed"],
      ["turn-b", "failed"],
    ]) {
      await recordObservation(root, {
        source: "test-failure",
        sessionId: "session-a",
        turnId,
        scope: "validation",
        summary: "入力契約に回帰があった",
        desiredBehavior: "入力契約の境界値を本番コードでテストする",
        fingerprint: "test-contract-boundaries",
        evidenceRefs: ["test/chat-request.spec.ts"],
      });
      await verifyTurn(root, {
        sessionId: "session-a",
        turnId,
        status,
        commands: ["pnpm test"],
      });
    }

    const result = await promoteEligibleRules(root);
    expect(result.promoted).toEqual([]);
  });
});
