---
name: mf-feature-help
description: "Guides users through mfstack setup, /mf-feature, and picking the skill, playbook, or principle for a task. Type /mf-feature-help with a question."
id: 1a1e1ba7472101ab
author: Lauren Tan
version: 0.15.46
license: MIT
disable-model-invocation: true
---

# MF feature help

Answer the user's question about mfstack, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a mfstack run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use mfstack to fix this bug", is not a help question. Read [`mf-feature`](../mf-feature/SKILL.md) and do the work under it.

This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here point into the installed plugin, which the user may not be able to open, so give the user the file's public copy: `https://github.com/cursor/plugins/blob/main/mfstack/` followed by its path.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with `/mf-feature`
- Pick a skill for a situation
- Fix a run that went wrong
- Make mfstack my own

Check the state that changes the answer, and mention it only when it does:

- No roles set (`mf-feature roles` shows none) means nobody has chosen harnesses and models for the roles, so every role uses its default model on the current harness.
- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention `/mf-feature-create-verification-skill` when the question is about proving a change works.
- No formal verification skill in the project means no property is checked past what tests reach. Mention `/mf-feature-create-formal-verification-skill` when the question is about a race, an invariant, or another case tests rarely hit. When one exists and the code it covers changed after the commit it records as last in sync, mention `/mf-feature-maintain-formal-verification-skill` if the question touches that code.

When the model rule is missing and it matters, ask whether the user wants to pick a model for each role and a reasoning budget now. It matters when the user is new, the question is about setup or cost, or the answer depends on which models run. Ask at most once per chat. If the need is also unclear, ask both questions together. Offer two choices:

- Now: walk them through `mf-feature roles set <role> …` for the roles they care about, and answer their question too.
- Later: answer their question, and add one line saying every role keeps its default model until they set roles with `mf-feature roles set`.

## Get set up

1. Install montflow in the repository: the montflow README's quick start syncs the `mf-feature` skills and installs the principles, playbooks and profiles with each CLI's `doctor`.
2. Optionally choose, per role, an ordered list of harness and model preferences with `mf-feature roles set`. Without them every role uses the defaults in the Subagents section of the **mf-feature** skill. Then offer once each to generate a verification skill (`/mf-feature-create-verification-skill`) and a formal verification skill for the project, unless the project already has one.
3. Start a real task with `/mf-feature`, a goal, and a check that can pass or fail.

Installing changes nothing until the user invokes a skill. The montflow README and its wiki page on mf-feature have the details. Offer to word their first prompt with them, per [`references/prompting.md`](references/prompting.md).

If cost is the worry, say where the tokens go and how to spend fewer. mfstack spends extra tokens on subagents and review panels. Point the roles at cheaper models with `mf-feature roles set`. A panel with fewer seats runs fewer subagents, one per seat. Save `/mf-feature` for work that needs rigor.

mfstack is written for any harness that reads Agent Skills: Claude Code, Codex, OpenCode, Pi and Cursor among them. Its text names concepts (spawn a subagent, ask a structured question, keep a todo list), and [the harnesses reference](../mf-feature/references/harnesses.md) maps each one to your harness. A step that needs a feature your harness lacks is skipped with a one-line note.

## Start a task with `/mf-feature`

`/mf-feature` matches the task to a playbook, copies the playbook's steps into the todo list, and runs the other skills as the steps need them. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one. [Guide page 2](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/02-poteto-mode.md) has examples.

Whether `/mf-feature` stays on depends on how the user starts it:

- Enter on `/mf-feature` attaches the skill to one message. It fades as the chat moves on.
- A harness that can keep a skill on for every turn (Cursor calls this a Custom Mode) keeps `/mf-feature` in context until the user turns it off.
- Everywhere else, start each new task with `/mf-feature`.

Mid-chat, "new task" makes the mode match a fresh playbook. `/mf-feature` already uses `mf-feature-generic-worker` for the subagents its playbook steps spawn. To get the same style from a subagent of your own, spawn it with the `mf-feature-generic-worker` profile.

## Pick a skill

The default answer is `/mf-feature`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [`/mf-feature`](../mf-feature/SKILL.md) |
| Check that the agent understood their goal and the problem before it starts | [`/mf-feature-in-your-own-words`](../mf-feature-in-your-own-words/SKILL.md) |
| Get a prompt rewritten deeper, not bigger, before sending it: what a top professional would add, their raw material and methods, and an outside check. It returns the prompt and doesn't do the task | [`/mf-feature-sharpen`](../mf-feature-sharpen/SKILL.md) |
| Know how code works now, or where new code should live | [`/mf-feature-how`](../mf-feature-how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [`/mf-feature-why`](../mf-feature-why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [`/mf-feature-teach`](../mf-feature-teach/SKILL.md) |
| Catch up on their own recent work on a topic | [`/mf-feature-recall`](../mf-feature-recall/SKILL.md) |
| Catch up on what changed in this chat since their last message, in plain words and small visuals, with every item waiting on them listed and decidable from the reply alone | [`/mf-feature-ketchup`](../mf-feature-ketchup/SKILL.md) |
| Catch up like `/mf-feature-ketchup`, in a short subtitled video of slides, with the waiting calls as text under it | [`/mf-feature-ketchup-video`](../mf-feature-ketchup-video/SKILL.md) |
| Know what a small diff could break outside itself | [`/mf-feature-blast-radius`](../mf-feature-blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [`/mf-feature-architect`](../mf-feature-architect/SKILL.md) |
| Get several attempts at one brief, merged into the best one | [`/mf-feature-arena`](../mf-feature-arena/SKILL.md) |
| Run parallel checks over slices, or race workers, as cloud agents | [`/mf-feature-swarm`](../mf-feature-swarm/SKILL.md) |
| Have different models review a diff and try to break it | [`/mf-feature-interrogate`](../mf-feature-interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [`/mf-feature-tdd`](../mf-feature-tdd/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [`/mf-feature-typescript-best-practices`](../mf-feature-typescript-best-practices/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [`/mf-feature-no-comments`](../mf-feature-no-comments/SKILL.md) |
| Clean AI tells out of prose | [`/mf-feature-unslop`](../mf-feature-unslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [`/mf-feature-technical-writing`](../mf-feature-technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [`/mf-feature-bro`](../mf-feature-bro/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [`/mf-feature-create-verification-skill`](../mf-feature-create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [`/mf-feature-maintain-verification-skill`](../mf-feature-maintain-verification-skill/SKILL.md) |
| Formally verify a race, invariant, or other property that tests rarely reach | [`/mf-feature-create-formal-verification-skill`](../mf-feature-create-formal-verification-skill/SKILL.md) |
| Bring a formal verification back in line after the code it covers changed, and learn whether a failure is drift or a bug | [`/mf-feature-maintain-formal-verification-skill`](../mf-feature-maintain-formal-verification-skill/SKILL.md) |
| Show a PM or designer what the user sees as a chart checked by a TLA+ model, with the shortest path to each state that breaks a rule | [`/mf-feature-statechart`](../mf-feature-statechart/SKILL.md) |
| Vet a performance number before reporting or acting on it | [`/mf-feature-benchmark-checklist`](../mf-feature-benchmark-checklist/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [`/mf-feature-figure-it-out`](../mf-feature-figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [`/mf-feature-show-me-your-work`](../mf-feature-show-me-your-work/SKILL.md) |
| Pick a harness and model for each role | `mf-feature roles set` |
| Turn their own working habits into a personal mode skill | [`/mf-feature-automate-me`](../mf-feature-automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [`/mf-feature-reflect`](../mf-feature-reflect/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | [`/mf-feature-correct`](../mf-feature-correct/SKILL.md) |
| Build a page whose buttons wake a Grok Bot over a webhook | [`/make-bot-ui`](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/skills/make-bot-ui/SKILL.md) |
| Find their way around mfstack | `/mf-feature-help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/mf-feature-how` explains what the code does. `/mf-feature-why` explains the reasons. `/mf-feature-teach` runs one or both and explains the result plainly.
- `/mf-feature-arena` gives every worker the same brief and merges the best parts. `/mf-feature-swarm` splits work into slices or a race and returns one report.
- `/mf-feature-interrogate` reviews the diff. `/mf-feature-blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/mf-feature-recall` rebuilds context across recent chats. `/mf-feature-ketchup` covers only this chat since the user's last message. Resuming one specific chat or branch is the Session pickup playbook.
- `/mf-feature-figure-it-out` designs one rigorous run. The Autonomous run playbook drives one task to a finish condition.

Not in mfstack:

- `/deslop`, `control-cli`, and `control-ui` belong to other Cursor plugins; montflow does not ship them.
- Loops and wake-ups come from your harness (the harnesses reference lists them). Skill authoring is the **mf-skills-create** skill.
- mfstack has no `/orchestrate` skill. If the slash menu shows `/orchestrate`, another plugin provides it.

## Playbooks and principles

Playbooks are step lists inside `/mf-feature`, not skills, so they have no slash command. Inside `/mf-feature`, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full. "autopilot, don't merge" runs Autopilot-stack.
- "run the eval playbook" runs Eval.

Without `/mf-feature`, a phrase such as "babysit this pr" can start your harness's own skill for the same job instead. `mf-playbooks list` lists every playbook.

mfstack has no planning skill. Your harness's plan mode, if it has one, works alongside it. For work that spans phases or stacked PRs, asking `/mf-feature` for a plan runs the [Multi-phase plan playbook](../../@montflow/playbooks/multi-phase-plan/PLAYBOOK.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/mf-feature-architect` settles it in code first.

Principles are one-rule documents in the principles store that `/mf-feature` reads and cites in its replies. The user rarely asks for one. They steer with the names instead, as in "apply prove it works. show me the real output." `mf-principles list` lists them, and `mf-principles show <name>` prints one.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a few turns | Start each task with `/mf-feature`, or keep it on every turn if your harness can. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. |
| A new model choice had no effect | Roles resolve when a subagent is spawned. Check `mf-feature roles resolve <role>` and start a new task. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | mfstack skills load when the user types them or when `/mf-feature` runs them, and it doesn't run every skill. |
| Parallel agents overwrote each other | Give each agent its own worktree, or run them as cloud agents, which each get their own machine. |
| An overnight run moved but finished nothing | a loop needs a check that can pass or fail, not a duration. See [guide page 7](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/07-overnight.md). |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers. [Guide page 10](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/10-recipes-and-pitfalls.md) has more pitfalls and the recipes worth copying.

## Make mfstack my own

- [`/mf-feature-automate-me`](../mf-feature-automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/mf-feature`.
- [`/mf-feature-reflect`](../mf-feature-reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- `/mf-feature write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

[Guide page 9](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/09-make-it-yours.md) covers each of these.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
