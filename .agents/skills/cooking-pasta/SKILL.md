---
name: cooking-pasta
description: Cooks pasta properly — picks the right shape for the dish, salts and boils water, times pasta to al dente, and finishes it with sauce using starchy pasta water. Use when the user asks to cook or make pasta, choose a pasta shape, or prepare any pasta dish.
id: 7b1f3e9c4a62d805
author: Daniel Montilla
version: 1.0.0
dependencies:
  - executing-skills
groups:
  - planning
---

# When To Use

Use when the user asks to cook pasta or make a pasta dish: choosing shapes, boiling, saucing, or timing. Covers dried and fresh pasta, from simple aglio e olio to baked dishes.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Gather Requirements

Determine before cooking:

- **Dish type**: tomato, cream, pesto, cheese (carbonara, cacio e pepe), oil-based (aglio e olio), baked, or soup
- **Servings**: default ~100g dry pasta per adult; ask only if unclear
- **Dietary constraints**: gluten-free, egg-free, vegan — swap pasta, cheese, and eggs accordingly
- **Fresh vs. dried pasta**: changes cook time and sauce behavior (see Reference)

## 2. Choose the Shape

Match shape to dish (full table in [PASTA_REFERENCE.md](documentation/PASTA_REFERENCE.md)):

- **Long & thin** (spaghetti, linguine, tagliatelle): oil, cream, and light tomato sauces
- **Short & ridged** (penne, rigatoni, fusilli): chunky or meaty sauces — ridges grab sauce
- **Filled** (ravioli, tortellini): delicate butter/sage or light sauces
- **Small** (orzo, ditalini): soups and salads
- **Baked** (lasagna, cannelloni): wide sheets or tubes

## 3. Set Up the Pot

- Use a pot big enough for pasta to move freely: ~4-5 L water per 500g pasta
- Bring to a rolling boil over high heat
- Salt generously: 10-20g (~1-2 tbsp) coarse salt per 4 L — the water should taste like the sea
- Olive oil in the water is optional; abundant water and stirring prevent sticking

## 4. Cook the Pasta

- Add pasta, stir immediately, then stir occasionally
- Boil uncovered at a strong simmer
- Timer: package time **minus 1-2 minutes**, then taste-test
- **Al dente** = tender but firm to the bite, no raw white core
- Reserve ~1 cup (250 ml) of starchy pasta water **before draining** — the key to silky sauces
- Drain, do **not** rinse (rinsing washes off the starch that makes sauce cling; exception: pasta for cold salads)
- For saucy dishes, leave a little water in the pot or return pasta with a splash

## 5. Sauce and Finish

- Return pasta to the pot over low heat (or into the sauce pan)
- Add sauce and toss to coat
- Add reserved pasta water 1-2 tbsp at a time, tossing, until glossy and clinging
- Off heat, stir in cheese (parmesan/pecorino), butter, or olive oil
- Season to taste — pasta water and cheese already add salt

## 6. Serve

- Plate immediately; hot pasta keeps cooking and sticks as it cools
- Garnish per dish: herbs, extra cheese, chili, lemon zest
- Leftovers: store in a sealed container; reheat with a splash of water

# Reference

- **[documentation/PASTA_REFERENCE.md](documentation/PASTA_REFERENCE.md) (MUST READ)**: shape-to-sauce pairing table, cooking-time ranges, water/salt ratios, fresh-vs-dried differences, and troubleshooting
