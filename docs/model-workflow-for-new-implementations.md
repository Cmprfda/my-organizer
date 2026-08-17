## 🤖 Model Workflow for New Implementations

The default workflow for every new implementation (feature or non-trivial change) is:

1. **Plan — Fable 5:** the main assistant (Fable 5) designs the implementation plan itself.
2. **Implement — Opus 5:** spawn a subagent with `model: opus` to write the code from that plan.
3. **Bug review — Sonnet 5:** spawn a subagent with `model: sonnet` to review the resulting changes for bugs before finishing.

When using Copilot, use this preferred pipeline instead:

1. **Plan — Opus 5 on High:** the main assistant (Opus 5) designs the implementation plan itself.
2. **Implement — Opus 5 on High:** spawn a subagent with `model: opus` to write the code from that plan.
3. **Bug review — gpt-5.6-luna on Max:** spawn a subagent with `model: gpt-5.6-luna` to review the resulting changes for bugs before finishing.

Trivial edits (one-liners, typos) may be done directly without the pipeline.

---