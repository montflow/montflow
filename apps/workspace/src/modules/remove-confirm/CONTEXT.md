# Remove-confirm module

Timed guard behind the skills-panel `x remove` keybind: the remove
modal opens on the highlighted row and only unlocks confirm after
`REMOVE_CONFIRM_DELAY_S` seconds, so a stray keypress can never delete
a skill. `app.tsx` wires the countdown ticks to the modal signal and
the confirmed delete to the extension's `SkillStore` port
(`Skills.storeFor(root).delete`).

## Belongs here

- `REMOVE_CONFIRM_DELAY_S` plus the pure tick/gate helpers
  (`tickCountdown`, `canConfirmRemove`)
- `waitSecond` (raw-timer second as an Effect) plus `countdown`
  (Effect loop reporting each ticked remaining)

## Does not belong here

- Skill file IO and parsing — that lives in `services/skills/`
- Rendering, keyboard handling, signals — those live in `app.tsx` plus
  `components/`
