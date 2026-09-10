# Repository instructions

## Codebase discovery

- If `.boost/` exists, use BoostGraph before text search when locating or understanding code.
- Read relevant production code, configuration, and tests before editing. Do not invent repository structure.

## Implementation quality

- Optimize for maintainability and correctness before speed.
- Keep validation and business contracts in production modules; tests should import and exercise them rather than duplicate them.
- Comments should explain a non-obvious design reason or constraint, not narrate straightforward code.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm lint` after TypeScript or JavaScript changes.

## Improvement loop

- Use the `loop-engineering` skill whenever the user mentions loop engineering, corrects code or working behavior produced by the development AI, when a quality check exposes a reusable failure pattern, or when reviewing pending improvement rules.
- Record an anonymized summary, not the user's raw prompt. Never persist secrets, tokens, environment values, personal data, or full transcripts.
- Treat ordinary feature requests and one-time preference changes as work requirements, not learning observations.
- Apply `.agents/skills/loop-engineering/improvement-loop-state/active-rules.md` during implementation. Do not manually edit that generated file.
- Automatic rule changes may update only `.agents/skills/loop-engineering/improvement-loop-state/`. They must not modify application source code on their own.
