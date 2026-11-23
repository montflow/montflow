# Prompts worth copying

Swap in the real paths, skills, and done checks. Informal wording works.

## Understand

- `/mf-feature read <thread>. restate the underlying issue in your own words, in plain english.`
- `/mf-feature-in-your-own-words <long or messy ask>`
- `/mf-feature-sharpen <the prompt you're about to send>`
- `/mf-feature investigate why <symptom>. give me what we know, what data you used, and your best hypotheses. don't change any code yet.`
- `use /mf-feature-how to understand <subsystem>. then use /mf-feature-why to find out why it broke recently.`
- `/mf-feature-recall my work on <topic> from last week, then read <issue>.`
- `/mf-feature-teach me why you implemented it this way and not <other way>. what did you trade off?`
- `/mf-feature take over this branch. read the decision log, find what's done, and continue. don't redo finished work.`

## Build

- Bug: `/mf-feature <symptom>. repro first, then fix and verify.`
- Bug in an app: `/mf-feature repro this with /verify-<app>. if it repros on main, fix it and show me a video as proof.`
- Bug with a cheap test: `/mf-feature repro <bug> first. if there's a cheap test path, /mf-feature-tdd it. then fix and rerun.`
- Feature: `/mf-feature add <behavior>. <current output> stays byte-identical. verify both.`
- Refactor: `/mf-feature move <code> into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/mf-feature <operation> takes <time> on <fixture>. trace it, fix the measured cause, show me before and after.`

## Design and plan

- `/mf-feature prototype a few options for <feature>. take screenshots or videos for me to compare.`
- `/mf-feature we need <feature>. /mf-feature-architect it first, and answer open questions with prototypes. let me review before proceeding.`
- `/mf-feature write a tutorial for how i would use <new package> first. then /mf-feature-teach me why it beats the current one.`
- `ask /mf-feature-arena for a second opinion on this thread and our approach.`
- `/mf-feature turn this design into a plan. small verifiable PRs, each with its own verification steps.`
- `/mf-feature plan the migration of <library> to <target>. small verifiable PRs. the result must match the original exactly, bugs included.`

## Review and ship

- `/mf-feature-interrogate the whole branch, but skeptically. don't change anything yet. no nitpicks unless it's a real bug or regression.` Read the Dropped list too.
- `/mf-feature-create-formal-verification-skill prove <property> holds in <module>, even when <steps> interleave or retry.` After merges or refactors in that code: `/mf-feature-maintain-formal-verification-skill`.
- `/mf-feature-swarm check every package under <dir> against its check script. one worker per package. one report.`
- `/mf-feature open the pr. small ordered commits, evidence in the description.`
- `/mf-feature babysit this pr. get it green.` For status only: `/mf-feature check on pr <number>. anything outstanding?`
- `/mf-feature land the stack.`

## Away and back

- `/mf-feature im going to bed. <goal> in a fresh worktree off <base>. done means <checks>. keep a decision log. don't ask me before committing. loop until done. if you're truly stuck after a few hours, stop and write up why.`
- `/mf-feature-show-me-your-work catch me up on what you did last night.` Read its Attention section first.
- `/mf-feature-ketchup` catches you up on this chat since your last message and lists every call that waits on you.
- `/mf-feature full autopilot on this queue. each item is independent.`
- `/mf-feature autopilot these changes, but don't merge. i'll land them.`
- `/mf-feature-reflect capture what we learned so the next run doesn't repeat it.` Approve only edits that change a future decision.
- `/mf-feature-bro` restates the last reply in plain words.
