---
name: mf-mode-help
description: "Guides users through mfstack setup, /mf-mode, and picking the skill, playbook, or principle for a task. Type /mf-mode-help with a question."
id: 06cf47f84bd28599
author: Lauren Tan
version: 0.15.46
license: MIT
disable-model-invocation: true
---

# Poteto help

Answer the user's question about mfstack, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a mfstack run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use mfstack to fix this bug", is not a help question. Read [`mf-mode`](../mf-mode/SKILL.md), do the work under it, and mention once that a Custom Mode keeps it on.

This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here point into the installed plugin, which the user may not be able to open, so give the user the file's public copy: `https://github.com/cursor/plugins/blob/main/mfstack/` followed by its path.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with `/mf-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make mfstack my own

Check the state that changes the answer, and mention it only when it does:

- No `~/.cursor/rules/pstack-models.mdc` means `/setup-pstack` hasn't run for this user, so every role uses its default model.
- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention `/mf-mode-create-verification-skill` when the question is about proving a change works.
- No formal verification skill in the project means no property is checked past what tests reach. Mention `/mf-mode-create-formal-verification-skill` when the question is about a race, an invariant, or another case tests rarely hit. When one exists and the code it covers changed after the commit it records as last in sync, mention `/mf-mode-maintain-formal-verification-skill` if the question touches that code.

When the model rule is missing and it matters, ask whether the user wants to pick a model for each role and a reasoning budget now. It matters when the user is new, the question is about setup or cost, or the answer depends on which models run. Ask at most once per chat. If the need is also unclear, ask both questions together. Offer two choices:

- Now: give them `/setup-pstack` to type, and answer their question too.
- Later: answer their question, and add one line saying every role keeps its default model until they run `/setup-pstack`.

## Get set up

1. Install with `/add-plugin mfstack` in chat, or from Customize in the sidebar.
2. Run [`/setup-pstack`](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/skills/setup-pstack/SKILL.md). It asks for a reasoning budget, maps a model to each role, and writes a rule. The rule applies to new chats. Then it offers once each to generate a verification skill and a formal verification skill for the project, unless the project already has one.
3. Start a real task with `/mf-mode`, a goal, and a check that can pass or fail.

Installing changes nothing until the user invokes a skill. Only `/setup-pstack` loads from the user's words. The [README](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/README.md) and [guide page 1](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/01-setup.md) have the details. Offer to word their first prompt with them, per [`references/prompting.md`](references/prompting.md).

If cost is the worry, say where the tokens go and how to spend fewer. mfstack spends extra tokens on subagents and review panels. Rerun `/setup-pstack` and pick a smaller budget or cheaper models. A role set to `auto` or `inherit-parent` runs on the chat's model, which saves tokens when the chat runs on Auto or a cheaper model. A shorter panel list runs fewer subagents, one for each entry. Save `/mf-mode` for work that needs rigor.

mfstack is built for Cursor, and it also installs in Claude Code with `/plugin marketplace add cursor/plugins`, then `/plugin install mfstack@cursor-plugins`. There, each command takes a `mfstack:` prefix, such as `/mf-mode`. The [Claude Code adapter](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/harness/claude-code.md) maps the Cursor names, and a step that needs a Cursor-only feature, such as Bugbot or Automations, is skipped with a one-line note.

Other tools can read the skills, because they use the Agent Skills format. But most workflow skills, including `/mf-mode`, `/mf-mode-how`, and `/mf-mode-teach`, spawn Cursor subagents, some with per-role models, and Custom Modes and `/loop` are Cursor features, so those parts may not work there.

## Start a task with `/mf-mode`

`/mf-mode` matches the task to a playbook, copies the playbook's steps into the todo list, and runs the other skills as the steps need them. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one. [Guide page 2](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/02-poteto-mode.md) has examples.

Whether `/mf-mode` stays on depends on how the user starts it:

- Enter on `/mf-mode` attaches the skill to one message. It fades as the chat moves on.
- Option+Enter on Mac or Alt+Enter on Windows, or Use as Mode from the skill entry, makes it a Custom Mode. It stays in context every turn until the user exits the mode, and it stays out of casual turns.
- Cursor's docs list Custom Modes in the Agents Window and the CLI. Elsewhere, start each new task with `/mf-mode`.

Link [Cursor's skills docs](https://cursor.com/docs/skills) when this comes up. Mid-chat, "new task" makes the mode match a fresh playbook. `/mf-mode` already uses `mf-agent` for the subagents its playbook steps spawn. To get the same style from a subagent of your own, spawn it with `subagent_type: "mf-agent"`.

## Pick a skill

The default answer is `/mf-mode`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [`/mf-mode`](../mf-mode/SKILL.md) |
| Check that the agent understood their goal and the problem before it starts | [`/mf-mode-in-your-own-words`](../mf-mode-in-your-own-words/SKILL.md) |
| Get a prompt rewritten deeper, not bigger, before sending it: what a top professional would add, their raw material and methods, and an outside check. It returns the prompt and doesn't do the task | [`/mf-mode-sharpen`](../mf-mode-sharpen/SKILL.md) |
| Know how code works now, or where new code should live | [`/mf-mode-how`](../mf-mode-how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [`/mf-mode-why`](../mf-mode-why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [`/mf-mode-teach`](../mf-mode-teach/SKILL.md) |
| Catch up on their own recent work on a topic | [`/mf-mode-recall`](../mf-mode-recall/SKILL.md) |
| Catch up on what changed in this chat since their last message, in plain words and small visuals, with every item waiting on them listed and decidable from the reply alone | [`/mf-mode-ketchup`](../mf-mode-ketchup/SKILL.md) |
| Catch up like `/mf-mode-ketchup`, in a short subtitled video of slides, with the waiting calls as text under it | [`/mf-mode-ketchup-video`](../mf-mode-ketchup-video/SKILL.md) |
| Know what a small diff could break outside itself | [`/mf-mode-blast-radius`](../mf-mode-blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [`/mf-mode-architect`](../mf-mode-architect/SKILL.md) |
| Get several attempts at one brief, merged into the best one | [`/mf-mode-arena`](../mf-mode-arena/SKILL.md) |
| Run parallel checks over slices, or race workers, as cloud agents | [`/mf-mode-swarm`](../mf-mode-swarm/SKILL.md) |
| Have different models review a diff and try to break it | [`/mf-mode-interrogate`](../mf-mode-interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [`/mf-mode-tdd`](../mf-mode-tdd/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [`/mf-mode-typescript-best-practices`](../mf-mode-typescript-best-practices/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [`/mf-mode-no-comments`](../mf-mode-no-comments/SKILL.md) |
| Clean AI tells out of prose | [`/mf-mode-unslop`](../mf-mode-unslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [`/mf-mode-technical-writing`](../mf-mode-technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [`/mf-mode-bro`](../mf-mode-bro/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [`/mf-mode-create-verification-skill`](../mf-mode-create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [`/mf-mode-maintain-verification-skill`](../mf-mode-maintain-verification-skill/SKILL.md) |
| Formally verify a race, invariant, or other property that tests rarely reach | [`/mf-mode-create-formal-verification-skill`](../mf-mode-create-formal-verification-skill/SKILL.md) |
| Bring a formal verification back in line after the code it covers changed, and learn whether a failure is drift or a bug | [`/mf-mode-maintain-formal-verification-skill`](../mf-mode-maintain-formal-verification-skill/SKILL.md) |
| Show a PM or designer what the user sees as a chart checked by a TLA+ model, with the shortest path to each state that breaks a rule | [`/mf-mode-statechart`](../mf-mode-statechart/SKILL.md) |
| Vet a performance number before reporting or acting on it | [`/mf-mode-benchmark-checklist`](../mf-mode-benchmark-checklist/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [`/mf-mode-figure-it-out`](../mf-mode-figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [`/mf-mode-show-me-your-work`](../mf-mode-show-me-your-work/SKILL.md) |
| Pick a model for each role and a reasoning budget | [`/setup-pstack`](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/skills/setup-pstack/SKILL.md) |
| Turn their own working habits into a personal mode skill | [`/mf-mode-automate-me`](../mf-mode-automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [`/mf-mode-reflect`](../mf-mode-reflect/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | [`/mf-mode-correct`](../mf-mode-correct/SKILL.md) |
| Build a page whose buttons wake a Grok Bot over a webhook | [`/make-bot-ui`](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/skills/make-bot-ui/SKILL.md) |
| Find their way around mfstack | `/mf-mode-help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/mf-mode-how` explains what the code does. `/mf-mode-why` explains the reasons. `/mf-mode-teach` runs one or both and explains the result plainly.
- `/mf-mode-arena` gives every worker the same brief and merges the best parts. `/mf-mode-swarm` splits work into slices or a race and returns one report.
- `/mf-mode-interrogate` reviews the diff. `/mf-mode-blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/mf-mode-recall` rebuilds context across recent chats. `/mf-mode-ketchup` covers only this chat since the user's last message. Resuming one specific chat or branch is the Session pickup playbook.
- `/mf-mode-figure-it-out` designs one rigorous run. The Autonomous run playbook drives one task to a finish condition.

Not in mfstack:

- `/deslop`, `control-cli`, and `control-ui` ship in the `cursor-team-kit` plugin.
- `/loop` and `/create-skill` are Cursor built-ins.
- mfstack has no `/orchestrate` skill. If the slash menu shows `/orchestrate`, another plugin provides it.

## Playbooks and principles

Playbooks are step lists inside `/mf-mode`, not skills, so they have no slash command. Inside `/mf-mode`, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full. "autopilot, don't merge" runs Autopilot-stack.
- "run the eval playbook" runs Eval.

Without `/mf-mode`, a phrase such as "babysit this pr" can start Cursor's own skill for the same job instead. The Playbooks section of [`mf-mode`](../mf-mode/SKILL.md) lists every playbook. [Guide page 6](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/06-verify-and-ship.md) covers opening, babysitting, and landing a PR.

mfstack has no planning skill. Cursor's Plan Mode works alongside it. For work that spans phases or stacked PRs, asking `/mf-mode` for a plan runs the [Multi-phase plan playbook](../../@montflow/playbooks/multi-phase-plan/PLAYBOOK.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/mf-mode-architect` settles it in code first.

Principles are one-rule skills that `/mf-mode` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Typing `/principle-<name>` still loads one on demand. [Guide page 8](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/08-principles.md) lists them.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a few turns | It was started with Enter. Start it as a Custom Mode, or start each task with `/mf-mode`. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. |
| A new model choice had no effect | The rule from `/setup-pstack` applies to new chats. Start one. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Only `/setup-pstack` loads from the user's words. The others load when the user types them or when `/mf-mode` runs them, and it doesn't run every skill. |
| Parallel agents overwrote each other | Give each agent its own worktree, or run them as cloud agents, which each get their own machine. |
| An overnight run moved but finished nothing | `/loop` needs a check that can pass or fail, not a duration. See [guide page 7](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/07-overnight.md). |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers. [Guide page 10](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/10-recipes-and-pitfalls.md) has more pitfalls and the recipes worth copying.

## Make mfstack my own

- [`/mf-mode-automate-me`](../mf-mode-automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/mf-mode`.
- [`/mf-mode-reflect`](../mf-mode-reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- `/mf-mode write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

[Guide page 9](https://github.com/cursor/plugins/blob/7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9/pstack/docs/guide/09-make-it-yours.md) covers each of these.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
