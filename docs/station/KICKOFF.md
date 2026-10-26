# Nova Station — How to run the build in Cursor

## One time setup (10 min)

1. Unzip this kit at the root of your `studyhub` repo. It adds `AGENTS.md`, `docs/station/`,
   `.cursor/agents/` (4 new files, your `studyhub-advisor.md` is untouched) and `.cursor/mcp.json`.
   If you already have a `.cursor/mcp.json`, merge the two server entries by hand.
2. Commit it on `main`: `git add -A && git commit -m "station: brief + agents"`.
3. Cursor Settings → MCP: confirm **context7** and **playwright** show green.
4. In Agent chat, make sure **superpowers** and **ponytail** are active (`/ponytail-help`).
5. Ask Cursor once: *"Create `.cursor/worktrees.json` so every new worktree runs `npm ci`
   before the agent starts. Check the current Cursor docs for the format."*

## Wave 0 — single agent (do not parallelize this)

Open one Agent chat on `main`, Plan mode first, then paste:

```
Read AGENTS.md, docs/station/BRIEFING.md and docs/station/STORIES.md.
Use superpowers writing-plans to write one plan for Wave 0 (S0.1, S0.2, S0.3, S0.4) in
docs/superpowers/plans/. Show me the plan and wait.
```

After you approve:

```
Execute the Wave 0 plan with superpowers test-driven-development. One commit per story.
When done, run npm test, then run the spec-reviewer, lean-reviewer and guard-reviewer
subagents on the diff and fix what they flag. Then stop and summarize.
```

Merge to `main` yourself after checking the app boots with Station off and on.

## Waves 1 and 2 — parallel agents

You have two ways. Use A until you trust B.

### A. Agents Window, one agent per story (most control)

Open the Agents Window. For each story in the wave, start a **new agent in a worktree** and paste:

```
You are station-builder for story <ID> in docs/station/STORIES.md.
Read AGENTS.md and docs/station/BRIEFING.md first.
Only edit the files listed under "Owns" for <ID>. Contracts in BRIEFING §3 are frozen.
Use superpowers writing-plans (save the plan to docs/superpowers/plans/), then
test-driven-development to execute it. Commit on this worktree's branch.
When acceptance checks pass, run /ponytail-review on your diff and fix real findings.
Finish with a short report: what changed, tests added, anything for HANDOFF.md.
```

Run 3–4 at a time, not 8. Parallel agents multiply token spend, and merge pain grows fast.

### B. One orchestrator chat dispatching subagents

Open one Agent chat on `main` and paste:

```
You are the Nova Station orchestrator. Read AGENTS.md, docs/station/BRIEFING.md and
docs/station/STORIES.md. For Wave <N>:
1. List the stories, their Owns files, and confirm no two stories own the same file.
2. Dispatch one station-builder subagent per story IN PARALLEL, each in its own git
   worktree (isolated copy), passing it the story ID and the instruction to read the
   brief first. Subagents don't see this chat, so include everything they need.
3. When each returns, run spec-reviewer, lean-reviewer and guard-reviewer on its branch.
   Send failures back to a fresh station-builder with the reviewer notes.
4. Merge passing branches into main one at a time in story order, running npm test
   after each merge. Wire new modules in electron/station/index.cjs.
5. Update the story status keys in STORIES.md and give me a wave summary.
Stop and ask me before changing any contract in BRIEFING §3.
```

## Wave 3 — single agent + reviewers

Same as Wave 0, stories S3.1–S3.3. Then you do S3.4 (the soak week) yourself.

## When something goes sideways

- Agent edits a file it doesn't own → reject the branch, rerun the story with the note.
- Two branches conflict → merge the earlier story ID first, rebase the other, rerun its tests.
- Agent wants a new dependency → lean-reviewer decides; default answer is no.
- Contract change needed → stop all agents, change BRIEFING §3 on `main`, rebase everyone.
