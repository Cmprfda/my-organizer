## 🤖 Model Workflow for New Implementations

For every new implementation (feature or non-trivial change), use this pipeline:

1. **Plan — Fable 5:** the main assistant (Fable 5) designs the implementation plan itself.
2. **Implement — Opus 5:** spawn a subagent with `model: opus` to write the code from that plan.
3. **Bug review — Sonnet 5:** spawn a subagent with `model: sonnet` to review the resulting changes for bugs before finishing.

Trivial edits (one-liners, typos) may be done directly without the pipeline.

---