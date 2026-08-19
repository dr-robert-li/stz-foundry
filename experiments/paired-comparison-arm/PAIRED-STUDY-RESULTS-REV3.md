# Rev-3 paired-comparison round — results (REQ-72)

This is the amended paired-comparison round under PAIRED-DESIGN-PREREG.md rev 3 (§12), a pre-registration frozen (commit 8279159aa28885bf0f95afe59db43eceb7921746) before any of this round's own data existed. It runs because the rev-2 round (qwen3.6:latest, 60 pairing units, seeds 1301-1306, reported in PAIRED-STUDY-RESULTS.md) saturated its own battery to near-total ties (59 of 60 units) and terminated TERMINATED-UNDERPOWERED before the decision rule ever ran; this round instead pins a newly calibrated executor (gpt-oss:latest) that the amendment's own ceiling probe (15-07) and W search (15-08) confirmed can discriminate this family's tasks at all. The v1.24.0 milestone record and the v1.25.0 round (PAIRED-STUDY-RESULTS.md, its own state and verdict artifacts untouched by this round) both stand exactly as recorded; this is explicitly NOT a Stage-B trigger outcome. The two rounds differ in executor (qwen3.6:latest vs gpt-oss:latest), sample size (60 vs 90 pairing units) and seeds (1301-1306 vs 1601-1609) — this report compares them only on those checkable facts. The rev-3 result is a second, independent measurement, never a correction of the rev-2 one: the rev-3 round was run because the rev-2 round's own saturated battery showed the instrument, at that executor, could not discriminate — not because the rev-2 result was unwelcome.

## Run configuration

Model: gpt-oss:latest. Digest: gpt-oss:latest             17052f91a42e    13 GB     2 weeks ago. ollama version is 0.32.5.
Sampler: none sent (no temperature, no max_tokens override — provider/server default applies). Per-task timeout: 3600000ms. Prompt-length bound: 2000 chars.
Seeds: 1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609 (10 tasks/seed = 90 pairing units). Attempt discipline: 1 proposal per arm per unit.
Arm commits — W: 6cc48aafd3a2613fe40f4b6f314752c3b0c5eda0 (_w-arm-definition-rev3.md); B: 90caee3bad14c781cd51671fa7f5e9c8708de9e1 (_b-arm-definition-rev3.md).

## Per-unit records

| arm | unit id | status | category | score |
|---|---|---|---|---|
| W | 1601:0 | ok | resolution-match | 1 |
| B | 1601:0 | ok | resolution-mismatch | 0 |
| W | 1601:1 | ok | non-scoreable | 0 |
| B | 1601:1 | ok | resolution-match | 1 |
| W | 1601:2 | ok | resolution-mismatch | 0 |
| B | 1601:2 | ok | non-scoreable | 0 |
| W | 1601:3 | ok | resolution-mismatch | 0 |
| B | 1601:3 | ok | resolution-match | 1 |
| W | 1601:4 | ok | resolution-mismatch | 0 |
| B | 1601:4 | ok | non-scoreable | 0 |
| W | 1601:5 | ok | resolution-match | 1 |
| B | 1601:5 | ok | resolution-match | 1 |
| W | 1601:6 | ok | resolution-match | 1 |
| B | 1601:6 | ok | resolution-mismatch | 0 |
| W | 1601:7 | ok | resolution-match | 1 |
| B | 1601:7 | ok | resolution-match | 1 |
| W | 1601:8 | ok | resolution-match | 1 |
| B | 1601:8 | ok | resolution-match | 1 |
| W | 1601:9 | ok | resolution-match | 1 |
| B | 1601:9 | ok | resolution-match | 1 |
| W | 1602:0 | ok | resolution-match | 1 |
| B | 1602:0 | ok | resolution-match | 1 |
| W | 1602:1 | ok | resolution-match | 1 |
| B | 1602:1 | ok | resolution-mismatch | 0 |
| W | 1602:2 | ok | resolution-match | 1 |
| B | 1602:2 | ok | resolution-match | 1 |
| W | 1602:3 | ok | resolution-mismatch | 0 |
| B | 1602:3 | ok | resolution-match | 1 |
| W | 1602:4 | ok | resolution-match | 1 |
| B | 1602:4 | ok | no-artifact | 0 |
| W | 1602:5 | ok | resolution-match | 1 |
| B | 1602:5 | ok | resolution-match | 1 |
| W | 1602:6 | ok | resolution-match | 1 |
| B | 1602:6 | ok | resolution-match | 1 |
| W | 1602:7 | ok | resolution-match | 1 |
| B | 1602:7 | ok | resolution-match | 1 |
| W | 1602:8 | ok | resolution-match | 1 |
| B | 1602:8 | ok | resolution-match | 1 |
| W | 1602:9 | ok | resolution-match | 1 |
| B | 1602:9 | ok | resolution-match | 1 |
| W | 1603:0 | ok | resolution-match | 1 |
| B | 1603:0 | ok | resolution-match | 1 |
| W | 1603:1 | ok | resolution-match | 1 |
| B | 1603:1 | ok | resolution-match | 1 |
| W | 1603:2 | ok | resolution-match | 1 |
| B | 1603:2 | ok | resolution-match | 1 |
| W | 1603:3 | ok | resolution-match | 1 |
| B | 1603:3 | ok | non-scoreable | 0 |
| W | 1603:4 | ok | resolution-match | 1 |
| B | 1603:4 | ok | resolution-match | 1 |
| W | 1603:5 | ok | resolution-match | 1 |
| B | 1603:5 | ok | resolution-match | 1 |
| W | 1603:6 | ok | resolution-match | 1 |
| B | 1603:6 | ok | resolution-match | 1 |
| W | 1603:7 | ok | resolution-match | 1 |
| B | 1603:7 | ok | resolution-match | 1 |
| W | 1603:8 | ok | resolution-match | 1 |
| B | 1603:8 | ok | resolution-match | 1 |
| W | 1603:9 | ok | resolution-match | 1 |
| B | 1603:9 | ok | resolution-match | 1 |
| W | 1604:0 | ok | resolution-match | 1 |
| B | 1604:0 | ok | resolution-match | 1 |
| W | 1604:1 | ok | non-scoreable | 0 |
| B | 1604:1 | ok | non-scoreable | 0 |
| W | 1604:2 | ok | resolution-match | 1 |
| B | 1604:2 | ok | resolution-match | 1 |
| W | 1604:3 | ok | resolution-mismatch | 0 |
| B | 1604:3 | ok | resolution-match | 1 |
| W | 1604:4 | ok | resolution-match | 1 |
| B | 1604:4 | ok | resolution-match | 1 |
| W | 1604:5 | ok | resolution-match | 1 |
| B | 1604:5 | ok | resolution-match | 1 |
| W | 1604:6 | ok | resolution-match | 1 |
| B | 1604:6 | ok | resolution-match | 1 |
| W | 1604:7 | ok | resolution-match | 1 |
| B | 1604:7 | ok | resolution-match | 1 |
| W | 1604:8 | ok | resolution-match | 1 |
| B | 1604:8 | ok | resolution-match | 1 |
| W | 1604:9 | ok | non-scoreable | 0 |
| B | 1604:9 | ok | non-scoreable | 0 |
| W | 1605:0 | ok | resolution-match | 1 |
| B | 1605:0 | ok | resolution-match | 1 |
| W | 1605:1 | ok | resolution-match | 1 |
| B | 1605:1 | ok | resolution-match | 1 |
| W | 1605:2 | ok | resolution-match | 1 |
| B | 1605:2 | ok | resolution-match | 1 |
| W | 1605:3 | ok | resolution-match | 1 |
| B | 1605:3 | ok | resolution-match | 1 |
| W | 1605:4 | ok | resolution-match | 1 |
| B | 1605:4 | ok | resolution-match | 1 |
| W | 1605:5 | ok | resolution-match | 1 |
| B | 1605:5 | ok | resolution-mismatch | 0 |
| W | 1605:6 | ok | resolution-match | 1 |
| B | 1605:6 | ok | resolution-match | 1 |
| W | 1605:7 | ok | resolution-mismatch | 0 |
| B | 1605:7 | ok | resolution-mismatch | 0 |
| W | 1605:8 | ok | resolution-match | 1 |
| B | 1605:8 | ok | resolution-match | 1 |
| W | 1605:9 | ok | resolution-match | 1 |
| B | 1605:9 | ok | resolution-match | 1 |
| W | 1606:0 | ok | resolution-match | 1 |
| B | 1606:0 | ok | resolution-match | 1 |
| W | 1606:1 | ok | resolution-match | 1 |
| B | 1606:1 | ok | resolution-match | 1 |
| W | 1606:2 | ok | resolution-match | 1 |
| B | 1606:2 | ok | resolution-match | 1 |
| W | 1606:3 | ok | resolution-match | 1 |
| B | 1606:3 | ok | resolution-match | 1 |
| W | 1606:4 | ok | resolution-mismatch | 0 |
| B | 1606:4 | ok | resolution-mismatch | 0 |
| W | 1606:5 | ok | resolution-match | 1 |
| B | 1606:5 | ok | resolution-match | 1 |
| W | 1606:6 | ok | resolution-match | 1 |
| B | 1606:6 | ok | resolution-match | 1 |
| W | 1606:7 | ok | resolution-match | 1 |
| B | 1606:7 | ok | resolution-match | 1 |
| W | 1606:8 | ok | resolution-match | 1 |
| B | 1606:8 | ok | resolution-match | 1 |
| W | 1606:9 | ok | resolution-match | 1 |
| B | 1606:9 | ok | resolution-match | 1 |
| W | 1607:0 | ok | resolution-match | 1 |
| B | 1607:0 | ok | resolution-match | 1 |
| W | 1607:1 | ok | resolution-match | 1 |
| B | 1607:1 | ok | no-artifact | 0 |
| W | 1607:2 | ok | resolution-match | 1 |
| B | 1607:2 | ok | resolution-match | 1 |
| W | 1607:3 | ok | resolution-match | 1 |
| B | 1607:3 | ok | resolution-match | 1 |
| W | 1607:4 | ok | resolution-mismatch | 0 |
| B | 1607:4 | ok | resolution-match | 1 |
| W | 1607:5 | ok | resolution-match | 1 |
| B | 1607:5 | ok | resolution-mismatch | 0 |
| W | 1607:6 | ok | resolution-match | 1 |
| B | 1607:6 | ok | resolution-match | 1 |
| W | 1607:7 | ok | resolution-match | 1 |
| B | 1607:7 | ok | resolution-match | 1 |
| W | 1607:8 | ok | resolution-match | 1 |
| B | 1607:8 | ok | resolution-match | 1 |
| W | 1607:9 | ok | resolution-match | 1 |
| B | 1607:9 | ok | resolution-match | 1 |
| W | 1608:0 | ok | resolution-match | 1 |
| B | 1608:0 | ok | resolution-match | 1 |
| W | 1608:1 | ok | resolution-match | 1 |
| B | 1608:1 | ok | resolution-match | 1 |
| W | 1608:2 | ok | resolution-match | 1 |
| B | 1608:2 | ok | resolution-match | 1 |
| W | 1608:3 | ok | resolution-match | 1 |
| B | 1608:3 | ok | resolution-match | 1 |
| W | 1608:4 | ok | non-scoreable | 0 |
| B | 1608:4 | ok | resolution-mismatch | 0 |
| W | 1608:5 | ok | resolution-match | 1 |
| B | 1608:5 | ok | resolution-match | 1 |
| W | 1608:6 | ok | resolution-match | 1 |
| B | 1608:6 | ok | resolution-match | 1 |
| W | 1608:7 | ok | resolution-mismatch | 0 |
| B | 1608:7 | ok | resolution-mismatch | 0 |
| W | 1608:8 | ok | resolution-match | 1 |
| B | 1608:8 | ok | resolution-match | 1 |
| W | 1608:9 | ok | resolution-match | 1 |
| B | 1608:9 | ok | resolution-match | 1 |
| W | 1609:0 | ok | resolution-match | 1 |
| B | 1609:0 | ok | resolution-match | 1 |
| W | 1609:1 | ok | resolution-match | 1 |
| B | 1609:1 | ok | resolution-match | 1 |
| W | 1609:2 | ok | resolution-mismatch | 0 |
| B | 1609:2 | ok | resolution-match | 1 |
| W | 1609:3 | ok | resolution-match | 1 |
| B | 1609:3 | ok | resolution-match | 1 |
| W | 1609:4 | ok | resolution-match | 1 |
| B | 1609:4 | ok | resolution-match | 1 |
| W | 1609:5 | ok | resolution-match | 1 |
| B | 1609:5 | ok | resolution-match | 1 |
| W | 1609:6 | ok | resolution-match | 1 |
| B | 1609:6 | ok | resolution-match | 1 |
| W | 1609:7 | ok | resolution-match | 1 |
| B | 1609:7 | ok | resolution-match | 1 |
| W | 1609:8 | ok | resolution-match | 1 |
| B | 1609:8 | ok | resolution-match | 1 |
| W | 1609:9 | ok | non-scoreable | 0 |
| B | 1609:9 | ok | resolution-mismatch | 0 |

## Per-arm accounting

| arm | no-artifact | non-scoreable | resolution-mismatch | resolution-match |
|---|---|---|---|---|
| W | 0 | 5 | 10 | 75 |
| B | 2 | 5 | 10 | 73 |

## Seed-block concordance

| seed | discordant wins (W) | discordant losses (B) | classification |
|---|---|---|---|
| 1601 | 2 | 2 | block-tied |
| 1602 | 2 | 1 | W-majority |
| 1603 | 1 | 0 | W-majority |
| 1604 | 0 | 1 | B-majority |
| 1605 | 1 | 0 | W-majority |
| 1606 | 0 | 0 | block-tied |
| 1607 | 2 | 1 | W-majority |
| 1608 | 0 | 0 | block-tied |
| 1609 | 0 | 1 | B-majority |

## Pooled arithmetic

Tie count (recorded regardless of outcome, never entering the discordant numerator or denominator): 76.

Arm W mismatch rate: 10/85 (11.8%) of its own scoreable attempts.
Arm B mismatch rate: 10/83 (12.0%) of its own scoreable attempts.

## Verdict

TERMINATED (TERMINATED-UNDERPOWERED) — Clause 2 (minimum discordant-pairs floor) was breached. The decision rule (§5) was NEVER EVALUATED.

## Why the discordant count fell under the floor

This round's decision rule (§5) needs at least 20 discordant pairs (§6 Clause 2) and got 14 — 6 short. Two honest, additive factors, read from this artifact's own accounting, explain the shortfall; neither is a retuning of any pin:

1. **10 of 90 pairing units dropped from joint consideration.** §6 Clause 1's joint-scoreable count requires BOTH arms to land scoreable (resolution-match or resolution-mismatch) on the SAME unit; 10 units had at least one arm land no-artifact or non-scoreable, leaving 80 joint-scoreable units (still above the instrument-health floor of 72 — Clause 1 was never the breach here).
2. **W and B carry byte-identical system-prompt text this round** (15-08: the bounded search's own winner never beat the unevolved baseline, an honest anti-build null). With both arms running the exact same prompt against the same model and no sampler override, the only source of any per-unit difference is decoding variance on a single, shared prompt — not a genuine comparison of two different prompts. That ceiling is consistent with this round's own tie count: 76 of 90 units tied. A real prompt-vs-prompt comparison would not be expected to tie this often; an identical-prompt comparison is.

Both factors are read directly from this artifact's own recorded counts; nothing about the battery, the oracle, or any threshold was adjusted after this data existed.
