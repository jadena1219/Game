# Knight's Last Stand — Project Overview

The one-page picture: **what the game is, what we're building toward, and the bar.**
Deep dives live in [STORY.md](./STORY.md) (the narrative bible) and
[ROADMAP.md](./ROADMAP.md) (the feature backlog). This is the front page.

---

## What it is

A **mobile-first, top-down action-roguelite** in grim dark-fantasy. You are the
kingdom's last knight, and you **descend — 20 floors down to the Demon Lord** — to
reclaim the sovereign you're sworn to. Die, and the Lord raises you to try again.

Built to be a **real, polished, commercial game**, not a tech demo: it runs in any
phone browser with no install (vanilla JS + HTML5 Canvas, no build step).

**Elevator pitch:** *Hades-style death-loop storytelling meets a tragic oath —
your king already sold you to the dark to save the realm, and the only way the
bargain seals is if you stop getting back up.*

---

## The story in one breath

A knight descends to save his king — and learns his king **traded him away**: his
life, given willingly, is the price the kingdom paid to survive the Demon Lord's
rising. The Lord keeps reviving him because the deal only seals when the knight
**chooses to kneel**. The roguelite loop *is* the villain's plan. Three endings —
**Kneel, Refuse, Usurp** — are the long-term grind. *(Full bible: STORY.md.)*

The king raised the knight from an orphan, as a son. The player learns the
betrayal **with** the knight (discovery, dramatic dread). That's the locked tone.

---

## How it plays (the pillars)

- **Feel:** thumb-friendly. Move (left joystick), **dash** (double-tap, i-frames),
  **swing** a wide greatsword arc that also deflects projectiles. Fast, readable,
  dodge-and-punish.
- **The Living Blade — your build's spine.** Start each run by claiming one of
  three swords in the **Shrine of Blades**: **Emberbrand** (burn), **Frostfang**
  (chill→freeze→shatter), **Stormedge** (chain lightning). It **evolves at floors
  5 / 10 / 15** (pick 1 of 2, a 3-tier tree) and has a screen-clearing **ultimate**.
- **Run identity — relics.** Between floors, claim **keystones** that rewrite how
  you play (Cinderstep, Mirror Aegis, Heart of Fury) or **cursed relics** —
  power for a price (Glass Dagger, Famine Crown, Stoneblood).
- **The descent.** 20 floors across **7 themed acts** (Catacombs → Flooded Crypt →
  Iron Keep → … → the **Moonlit Obsidian Throne**). Enemies (skeleton chasers, imp
  swarmers, ogre tanks, mage casters, bombers) escalate, plus **named elite
  "heralds"** (affix + guaranteed relic). **Dark Knight** mini-boss (L10), **Demon
  Lord** final boss (L20).
- **Story through the loop.** A **prologue** cutscene (the bargain — the Demon Lord
  bursting from the ground), a meta-aware Lord who **whispers about your runs**, and
  a between-runs camp that remembers your progress.

---

## What's built today ✅

The descent loop, the Living Blade + Shrine + evolutions + ultimates, keystones &
cursed relics, named elites, both bosses, 7 biomes, the Prologue, procedural audio,
and a **user-art pipeline** (drop a magenta-keyed PNG → it's cleaned and wired into
the game — that's how the Demon Lord's art got in).

Combat feel (new): a **mechanized combo meter** (streaks grant damage/Fury,
milestones at 10/25/50, broken by taking a hit), camera zoom-punch, haptics,
loot-vacuum on clear — and **the Revenant**: die, and your next run meets your
previous self (your hero, your blade) two floors above where you fell — a
relic-bearing duel on the way back down to your wall. (A perfect-dodge parry is
built but pinned — see ROADMAP "Parked".)

---

## What we're adding next

**Greenlit (near-term):**
- **Mid-bosses** at ~L5 / L7 — two bosses across 20 floors is thin.
- **Boss arena mechanics** — Dark Knight cracks the floor; Demon Lord nova with
  safe-gaps. Turn bullet-dodging into spatial puzzles.

**The story engine (Phase 1 — the vertical slice that gives the game its soul):**
- The Sorcerer NPC giving the surface story; the **revival reveal**; **Realm 1 fully
  realized** with lore + boss; the **Sanctum hub** (spend **Souls** on permanent
  unlocks, each unlock revealing a fragment of lore).

**Bigger arcs (see STORY.md "Build Sequencing"):**
- Remap 20 floors → **5 named realms**, a boss per realm, and **blade-unlock-by-realm**
  (beat a realm's boss → its sword is unlocked in the Shrine forever).
- **The Throne + three endings.** Then **the Abyss** (endless mode + leaderboard).

**Game-feel backlog:** a held heavy swing, a combo audio layer, a
run-summary-on-death screen, and finishing the Rogue & Paladin heroes.
*(Full list + parked ideas: ROADMAP.md.)*

---

## Goals & the bar

1. **Ship it for real.** A polished, releasable mobile game — phased so each phase
   stands on its own (**Phase 1 is a releasable demo / early access**).
2. **Story is the north star.** Every system serves *the Impossible Trade*. If a
   feature doesn't deepen the oath, the dread, or the loop, it waits.
3. **Quality bar: "incredibly detailed and well-animated."** Juice, readability,
   and art that punches above a browser game.
4. **Phasing:** Story Engine (slice) → The Descent (realms + mid-bosses) → The Truth
   (throne + endings) → The Abyss (endless + leaderboard).

---

## Tech & how it's made

Vanilla JS **ES modules**, **HTML5 Canvas 2D**, **WebAudio** procedural sound — no
framework, no build step, served static. Art is **procedural by default** with a
**user-art pipeline** for hero pieces (magenta chroma-key + despill → cleaned PNG →
wired by filename). Mobile-first, portrait **and** landscape.

**Doc map:** `OVERVIEW.md` (this) · `STORY.md` (world bible / north star) ·
`ROADMAP.md` (shipped / greenlit / backlog / parked).
