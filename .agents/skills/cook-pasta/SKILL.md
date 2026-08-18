---
name: cook-pasta
description: Guides cooking pasta to perfection — asks for shape, servings, and skill level, then gives type-specific times, water ratios, salting, and sauce-finishing steps. Use when the user asks how to cook pasta or wants pasta cooking times and tips (e.g., "how do I cook spaghetti", "penne cooking time", "make pasta al dente").
id: 8c2f4a91e6b3d507
author: Daniel Montilla
version: 1.0.0
license: MIT
dependencies:
  - executing-skills
groups:
  - planning
---

# When To Use

Use when the user wants to cook pasta and needs guidance: boiling technique, water ratio, cooking times, al dente, salting, avoiding sticky or mushy pasta. Triggers: "how do I cook pasta", "how long does spaghetti take", "cook penne", "pasta cooking tips", "make it al dente".

Skip this skill for sauce recipes, pasta dough, or baked pasta dishes — those are recipe territory, not boiling technique.

> **Prerequisite**: Load [executing-skills](../executing-skills/SKILL.md) first — it governs how skills are loaded and executed.

# Pipeline

## 1. Gather (Ask Before Calculating)

Ask in one friendly message:

- **Pasta shape** — spaghetti, penne, fusilli, linguine, etc. If unknown, ask for the brand/package so you can use its cooking time, or use the closest match from the Times table.
- **Servings** — how many people, and main course vs side dish.
- **Experience level** — beginner / comfortable / expert. Drives how much explanation to give (see Adapting to Experience).

Then compute:

- **Pasta weight**: ~100 g (3.5 oz) dried per main serving; ~70 g (2.5 oz) per side dish.
- **Water**: ~1 L per 100 g pasta — i.e., ~4 L (1 gallon) per 450 g (1 lb).
- **Salt**: 1–2 tbsp per gallon of water.

## 2. Setup the Pot

- Pick a pot large enough that the water fills it no more than ~2/3 full — prevents boil-overs.
- Bring water to a **rolling boil** (lid on speeds this up).
- Do **not** add oil to the water — it coats the pasta and stops sauce from clinging.

## 3. Salt the Water

- Add 1–2 tbsp salt per gallon **after** the rolling boil (dissolves faster, won't pit the pot).
- The water should taste like the sea — mildly salty is under-salted.

## 4. Add and Stir

- Drop in pasta, stir immediately so it doesn't stick to the bottom.
- Stir again during the first 2 minutes — sticking happens early, before the pasta softens.

## 5. Cook and Taste-Test

- Keep a lively boil, uncovered; stir occasionally.
- Use the Times table for shape-specific **al dente** and **fully cooked** minutes. Package time is the starting point — adjust for brand and preference.
- **Taste-test 1 minute before** the package/al dente time. Al dente = tender with a thin white core and a pleasant bite. If not there yet, check every 30 seconds.
- Pasta keeps cooking in the sauce — pull it slightly underdone.

## 6. Reserve Water, Then Drain

- Before draining, scoop out **~1 cup (250 ml) of starchy pasta water** — the secret weapon for sauces.
- Drain in a colander. **Do not rinse** (except for cold pasta salads). Don't shake bone-dry; a little clinging water helps the sauce.

## 7. Finish in the Sauce (Recommended)

- Add drained pasta to the sauce pan over medium heat and toss.
- Splash in reserved starchy water a little at a time — it loosens the sauce and makes it cling and emulsify.
- Taste, adjust salt, serve immediately.

## 8. Recap

Close with the checklist: **boil → salt → add → stir → taste-test → drain (reserve water) → sauce**.

# Times by Shape (dried unless noted)

| Shape | Al dente | Fully cooked |
|---|---|---|
| Angel hair / capellini | 4–5 min | 6 min |
| Spaghetti | 8–10 min | 11–12 min |
| Linguine / fettuccine | 8–10 min | 11–12 min |
| Penne | 9–11 min | 12–13 min |
| Fusilli / rotini | 8–10 min | 11–12 min |
| Farfalle | 10–12 min | 13–14 min |
| Rigatoni | 12–14 min | 15 min |
| Elbow macaroni | 7–8 min | 9 min |
| Orzo | 8–9 min | 10 min |
| Fresh pasta (any) | 1–3 min | 3–4 min |

Unknown shape → use nearest match plus package time, and always taste-test.

# Tips

**Fresh vs dried**
- Fresh: cooks in 1–3 min, delicate, silky — great with light cream or egg sauces.
- Dried: firm bite, holds up to hearty sauces, keeps for months.

**Common mistakes to avoid**
- Overcrowding / too little water → sticky, starchy pasta.
- Oil in the water → sauce slides off.
- Rinsing cooked pasta → washes away starch and cools it (only for cold salads).
- Forgetting to reserve water → no rescue for a dry, clumpy sauce.
- Undersalting → bland pasta no matter the sauce.

# Adapting to Experience

- **Beginner**: explain terms (al dente, starchy water, boil vs simmer), walk through why each step matters, use full detail.
- **Comfortable**: give the numbers and steps, skip the whys.
- **Expert**: quick steps only — ratio, times, salt, reserve, finish.
- Stay friendly and encouraging at every level.
