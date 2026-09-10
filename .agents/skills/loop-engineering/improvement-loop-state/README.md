# Improvement loop data

This directory stores anonymized evidence and derived rules for the workspace's
code-generation improvement loop.

- `observations.jsonl`: one structured correction or verification finding per line
- `rules.json`: pending, active, and disabled rules
- `active-rules.md`: generated session context; do not edit manually
- `config.json`: promotion threshold, quality gates, and commit policy

Raw prompts, transcripts, credentials, and environment values must not be stored.

