---
name: loop-engineering
description: Capture, verify, promote, inspect, or disable workspace-specific code-generation learnings and consult bundled loop-engineering techniques. Use this skill whenever the user mentions loop engineering, corrects AI-generated code or working behavior, a test/review reveals a reusable failure pattern, the user asks what the workspace has learned, or pending improvement rules need evaluation. Do not use it for ordinary feature requests, isolated bugs with no reusable lesson, or application-user feedback.
compatibility: Requires Node.js 20+, pnpm, Git, and Codex project hooks.
---

# Loop Engineering

For conceptual techniques and extension ideas, read `references/techniques.md` when the task concerns loop-engineering practices beyond the implemented record/verify/promote workflow. The implementation, state, and references are bundled in this skill; `.codex/` contains only the host hook integration.

Turn repeated, verified corrections into compact workspace instructions without storing raw conversations.

## Before implementation work

1. Read `improvement-loop-state/active-rules.md` when the SessionStart hook has not already supplied it.
2. Apply only rules marked active. Pending rules are evidence under review, not requirements.
3. Keep the task's explicit requirements above learned preferences.

## When to record

Record one observation when:

- the user corrects code or working behavior previously produced by the development AI;
- a failed test or review exposes a reusable development mistake;
- the same workaround or verification technique would prevent future hand-back.

Do not record a new product requirement, a one-time stylistic request, praise, or an error caused solely by unavailable infrastructure.

## Record safely

Generalize the lesson before recording it. Inspect `node .agents/skills/loop-engineering/improvement-loop/cli.mjs status` first and reuse an existing fingerprint and rule wording when the meaning matches; create a new stable kebab-case fingerprint only when no equivalent candidate exists. Keep `desired-behavior` identical across repeated evidence. Never pass the raw user prompt.

```bash
node .agents/skills/loop-engineering/improvement-loop/cli.mjs record \
  --source user-correction \
  --session-id "<session_id>" \
  --turn-id "<turn_id>" \
  --scope "<area>" \
  --summary "<anonymized cause>" \
  --desired-behavior "<general reusable behavior>" \
  --fingerprint "<stable-kebab-case>" \
  --evidence-ref "<file, test, or review reference>"
```

If the correction invalidates an active rule, add `--contradicts "<active-fingerprint>"`. This disables the rule immediately while preserving its evidence.

## Verification and promotion

- Leave a new observation pending until the corrected implementation passes the repository quality gates.
- The Stop hook updates observations for the current turn and calls promotion automatically.
- A rule becomes active only after two distinct turn/session occurrences, every occurrence passes verification, and their desired behavior is consistent.
- If automatic commit fails, keep the working-tree update and report the failure; do not broaden Git permissions or include unrelated files.

## Inspect or operate manually

```bash
node .agents/skills/loop-engineering/improvement-loop/cli.mjs status
node .agents/skills/loop-engineering/improvement-loop/cli.mjs verify --session-id "<session_id>" --turn-id "<turn_id>" --status passed --command "pnpm test"
node .agents/skills/loop-engineering/improvement-loop/cli.mjs promote
```

Report the fingerprint, status, occurrence count, verification result, and any commit warning. Do not claim that model weights were trained; this loop improves future context and evaluation policy.
