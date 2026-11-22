# Prompts worth copying

Swap in the real paths, skills, and done checks. Informal wording works.

## Understand

- `/mf-mode read <thread>. restate the underlying issue in your own words, in plain english.`
- `/mf-mode-in-your-own-words <long or messy ask>`
- `/mf-mode-sharpen <the prompt you're about to send>`
- `/mf-mode investigate why <symptom>. give me what we know, what data you used, and your best hypotheses. don't change any code yet.`
- `use /mf-mode-how to understand <subsystem>. then use /mf-mode-why to find out why it broke recently.`
- `/mf-mode-recall my work on <topic> from last week, then read <issue>.`
- `/mf-mode-teach me why you implemented it this way and not <other way>. what did you trade off?`
- `/mf-mode take over this branch. read the decision log, find what's done, and continue. don't redo finished work.`

## Build

- Bug: `/mf-mode <symptom>. repro first, then fix and verify.`
- Bug in an app: `/mf-mode repro this with /verify-<app>. if it repros on main, fix it and show me a video as proof.`
- Bug with a cheap test: `/mf-mode repro <bug> first. if there's a cheap test path, /mf-mode-tdd it. then fix and rerun.`
- Feature: `/mf-mode add <behavior>. <current output> stays byte-identical. verify both.`
- Refactor: `/mf-mode move <code> into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/mf-mode <operation> takes <time> on <fixture>. trace it, fix the measured cause, show me before and after.`

## Design and plan

- `/mf-mode prototype a few options for <feature>. take screenshots or videos for me to compare.`
- `/mf-mode we need <feature>. /mf-mode-architect it first, and answer open questions with prototypes. let me review before proceeding.`
- `/mf-mode write a tutorial for how i would use <new package> first. then /mf-mode-teach me why it beats the current one.`
- `ask /mf-mode-arena for a second opinion on this thread and our approach.`
- `/mf-mode turn this design into a plan. small verifiable PRs, each with its own verification steps.`
- `/mf-mode plan the migration of <library> to <target>. small verifiable PRs. the result must match the original exactly, bugs included.`

## Review and ship

- `/mf-mode-interrogate the whole branch, but skeptically. don't change anything yet. no nitpicks unless it's a real bug or regression.` Read the Dropped list too.
- `/mf-mode-create-formal-verification-skill prove <property> holds in <module>, even when <steps> interleave or retry.` After merges or refactors in that code: `/mf-mode-maintain-formal-verification-skill`.
- `/mf-mode-swarm check every package under <dir> against its check script. one worker per package. one report.`
- `/mf-mode open the pr. small ordered commits, evidence in the description.`
- `/mf-mode babysit this pr. get it green.` For status only: `/mf-mode check on pr <number>. anything outstanding?`
- `/mf-mode land the stack.`

## Away and back

- `/mf-mode im going to bed. <goal> in a fresh worktree off <base>. done means <checks>. keep a decision log. don't ask me before committing. loop until done. if you're truly stuck after a few hours, stop and write up why.`
- `/mf-mode-show-me-your-work catch me up on what you did last night.` Read its Attention section first.
- `/mf-mode-ketchup` catches you up on this chat since your last message and lists every call that waits on you.
- `/mf-mode full autopilot on this queue. each item is independent.`
- `/mf-mode autopilot these changes, but don't merge. i'll land them.`
- `/mf-mode-reflect capture what we learned so the next run doesn't repeat it.` Approve only edits that change a future decision.
- `/mf-mode-bro` restates the last reply in plain words.
