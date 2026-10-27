# R5: AI spike for the Rumi plan

Date: 2026-10-27. Branch `spike/r5-ai` from `main` `e63dbef` (WI-039). This is the third item of the Rumi plan (`docs/product/rumi-plan.md`). No product code changed.

## What was done

`scripts/r5-spike.ts` sends a few small, generic requests to the real pinned endpoint (ADR-022). The owner ran it in their own terminal, with the OpenRouter key entered hidden. The key never reached the repository, the logs or this session. The script prints only results: provider, finish reason, tool calls, cited sites, tokens, cost and time.

## Results (2026-10-27)

| Test                                       | Result                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| A1: does Haiku call a tool?                | Yes: `get_activity({"days": 7})`, finish `tool_calls`, 447 in / 48 out tokens, US$0.00007, 958 ms                              |
| A2: plain answer from the tool's result    | Yes: finish `stop`, US$0.00008, 570 ms                                                                                         |
| B: tools and a strict JSON format together | Accepted; the model chose the tool call. US$0.00010                                                                            |
| C: web search, Exa                         | Ran pinned and with ZDR. 3 cited sites: amazon.jobs, jointaro.com, codesnatch.io. US$0.00758. Cut off at the 600-token ceiling |
| C: web search, Parallel                    | Ran. 2 cited sites: techinterview.coach, amazon.jobs. US$0.00547. Cut off at the 600-token ceiling                             |

Every answer came from the pinned provider (Google). The total was **US$0.0133**, outside Silsila's ledger and within the key's own limit.

## What it means

- **Ask Rumi (WI-040)** can use tools on the same zero-retention endpoint, at about US$0.0001–0.0003 per tool round.
- **Prep docs (WI-042)** can use web search, but:
  - the output ceiling must be about 3,000 tokens;
  - the sources vary in quality, so the doc marks the company's own domain as Official and everything else as Other;
  - the search engines are third parties without a zero-retention promise, so queries stay generic and built by code.

These go into **ADR-024** in `docs/architecture/decisions.md`, accepted with the owner's sign-off on 2026-10-27. WI-040 builds on it.

## Owner steps

1. Done: ADR-024 signed off on 2026-10-27.
2. Nothing to deploy: this branch adds a script and docs only.
