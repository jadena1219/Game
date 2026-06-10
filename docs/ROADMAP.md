# Knight's Last Stand — Roadmap

Our shared idea bank. When Jade asks "what's next?", start here.
Greenlit items are the agreed priorities; the backlog is everything else we
pitched so nothing gets lost.

---

## 🚢 Shipped

### The Black Knight — new hero sprite ✅
- Hand-drawn pixel art (tools/gen-knight.js), pixel-by-pixel: blackened plate,
  crimson half-cape/crest/tabard, hot red visor slit. Flat cel-shading per
  ART_SPEC, true alternating stride (planted leg lit, lifted leg dark, swapped
  between walk frames), and **weaponless** — the Living Blade drawn in code is
  his only sword (no more doubled blade; fixes the shrine pose too).
- `npm run sprites` now routes the knight through the hand-drawn sheet; the
  parametric generator still does the rest of the cast.

### The Revenant — fight your past self ✅
- The Lord keeps only your FINEST corpse: a husk banks **only when a death sets a
  new deepest-fall record**, so the Revenant is a rare, earned event — not a tax
  on every death in a death-loop game. It appears **two floors above where you
  fell** — on your way back down, before the wall that killed you, never stacked
  on it. A named duelist wearing your sprite, dashing like you, fighting with
  your blade (Ember husks lay hostile fire-trails, Frost husks chill on touch,
  Storm husks loose bolts).
- Titled by death count — Garrick was the First Sacrifice, so yours number from
  "The Second Sacrifice". **Guaranteed relic drop** — beating what you were is the
  power-up that helps you break through. A unique Lord taunt follows the floor
  ("I CAN RAISE AS MANY OF YOU AS YOU LEAVE ME"). God-mode runs leave nothing.

### Combat feel: combos with teeth, juice ✅
- **Combo meter mechanized**: kill-streak now grants +1%/kill sword damage (cap
  +30%, shown live) and up to +50% Fury gain; taking a hit breaks it. Milestones
  at 10/25/50 (FRENZY / RAMPAGE / MASSACRE) with stinger + banner. HUD shows a
  draining streak-clock bar.
- **Juice pass**: camera zoom-punch on crits / big kills / ultimates / perfect
  dodges; haptics (navigator.vibrate) on hurt, big kills, milestones, death;
  level-clear now VACUUMS all uncollected loot (a herald's relic can no longer be
  lost to the floor).

### The Sanctum is LIVE — souls, permanent upgrades, lore ✅
- Souls bank at the end of every run (god-mode runs bank nothing) and spend in
  the Sanctum: 6 permanent upgrades now genuinely apply at run start.
- Executioner's Seal + Thunderbrand sealed behind 150-soul unlocks.
- **Economy repriced for the long game** (2026-06): souls now pay for DEPTH
  (`floors×2 + kills/12 + 50 on a win` — a floor-10 death ≈ 30, a clear ≈ 120),
  kills can't be farmed, costs steepened (~3,200 souls to max everything ≈
  dozens of runs). Old banks rebased ÷8 one time (`econ` flag in the save).
- **Every upgrade reveals a lore fragment** (Garrick, the coffers, the sorcerer
  who fled) — the grind tells the story, per STORY.md Phase 1.
- Entrances: title button w/ souls badge + straight from the death screen.

### Run summary + quick wins ✅
- Death/victory screens tell the run: blade + tier pips, time, kills, best
  combo, gold, relics, souls banked — and **"Slain by …"** names your killer.
- Prologue plays ONCE (title gains Replay); dash double-tap widened to 0.38s;
  God Mode hidden unless already on or `?god`/`#god` in the URL.

### Combat depth pass ✅
- Foes approach on curved, per-foe flanking paths — packs envelop, not queue.
- **Dark Knight SLAM** cracks the floor into molten fissures (the greenlit
  arena mechanic): warning crack → ignition → 6.5s of burning ground.
- **Demon Lord can't be corner-pinned**: holds ~120px casting range with
  wall-tangent sidestepping; charge live from phase 1 (long cooldown).
- Curve: dmg/level 8.5%→7.2%, late density up instead; L12 tank gauntlet,
  L16 swarm flood. Blade tiers: 'Kindled Fury' (burn ticks → Fury) and 'Ride
  the Lightning' (dash looses an arc) replace two flat +% picks.

### The Prologue — the bargain ✅
- 5-beat opening cutscene: the golden kingdom → the dark rising → the King's
  bargain (the **Demon Lord bursts up from the ground**) → the orphan-son reveal
  → the descent. Uses Jade's keyed castle-horizon PNG + Demon Lord art.
- Demon Lord pipeline: magenta-key + despill (`pinkLeft=0`), 4-frame anim sheet
  (627² cells, feet aligned) drives the L20 boss; full-res portrait drives the
  prologue. Entrance = `_drawDemonRise` (climbs through a ground seam, swelling
  portal, embers/ash, settle-bob, landing flash + shock ring).
- Triggered from Start (`main.js`) → flows into the Shrine. **Plays every Start**
  (not yet gated — easy to make play-once via the `kls_seen_intro` flag it sets).
- ⏸ **Parked tuning (for later):** rise speed (`pt/3.4`), how buried he starts,
  ember density, flash punch, his scale (`H*0.54`), prologue framing. All
  one-line dials inside `_drawDemonRise` / beat 2 of `_drawPrologueArt`.

### The Living Blade ✅ (v1)
- Choose one of three swords at the start of a run — **Emberbrand** (burn DoT),
  **Frostfang** (chill → freeze → shatter), **Stormedge** (chain lightning).
- The blade **evolves at floors 5 / 10 / 15** — pick 1 of 2 upgrades each time
  (3-tier tree per blade). HUD chip shows blade + evolution pips.
- Generated sword icons; status visuals (flames, frost casing).
- **The Shrine of Blades** ✅ — the run opens in a chamber where three ornate,
  glowing, floating swords hover on pedestals; walk up and take one. Replaced
  the picker screen.
- Swords redrawn as long, curved, rune-etched fairytale blades (ornateBlade in
  spritegen). Each blade has its own **elemental swing effect** (fire embers /
  ice shards / violet sparks + recoloured slash).
- ~~TODO polish: a truly weaponless knight pose for the shrine~~ ✅ the hero
  sprite is now weaponless everywhere (the Living Blade is the only sword).

### Build variety — runs with identity ✅
- **Keystones**: Cinderstep (dash fire-trail), Mirror Aegis (no dash, reflect
  projectiles doubled), Heart of Fury (endless Fury, double damage taken).
- **Cursed**: Glass Dagger (+55% dmg / −30% HP), Famine Crown (+gold/+dmg, no
  healing), Stoneblood (−35% dmg taken / slower). Tagged KEYSTONE/CURSED in shop.

### Named elite foes ✅
- Rare titled "herald" per floor (Gravewarden, Quickfang, The Pale Widow, etc.):
  a base enemy + an affix twist, beefier, with a name plate, an arrival banner,
  and a **guaranteed relic drop** (relic pickup → claim).

---

## ✅ Greenlit — next moves (in no fixed order)

### 1. Mid-bosses
- A tentpole boss around **L5 or L7** (an elite "herald"). Two bosses across
  20 floors is thin — a third keeps the descent escalating.

### 2. Boss arena mechanics (half done)
- ~~The Dark Knight's slam **cracks the floor into lava**~~ ✅ shipped.
- The Demon Lord's nova leaves **safe-gaps** you must read — still open.
- Turn bullet-dodging into spatial puzzles, not just movement.

### 3. Mobile ship-blockers (reviewed, not yet built)
- Pause/resume on `visibilitychange` (game loop + audio scheduler + AudioContext
  resume on iOS), per-asset load fallbacks, notch safe-areas, storage guards,
  WebAudio node disconnects. Full findings in the 2026-06-09 review.

---

## 🗃️ Backlog (pitched, not yet greenlit)

### Combat depth — make the blade a language
- ~~**Combo meter**~~ ✅ shipped (damage + fury scaling; audio layer still open).
- **Held heavy swing**: a slower knockback cleave.

### The descent & narrative
- **Reactive Demon Lord**: whispers that reference the run ("you spared none on
  the third floor", "that relic… you shouldn't have"). Whisper system already exists.
- **Branching descents**: two pits at the camp — safe vs. deeper/redder
  (harder floor, better loot, a dare).
- **Meta layer**: the Sanctum/Souls is stubbed and ready — permanent
  between-run unlocks → "one more run."

### Juice & game-feel
- ~~Hit-stop scaling + screen-zoom punch on kills/crits.~~ ✅ shipped.
- ~~Gold/soul magnetism + a satisfying pickup sound.~~ ✅ (magnet existed; clears now vacuum the rest).
- Run-summary screen on death (floors, kills, best combo, defining relic).

### Heroes
- Finish **Rogue** (fast, frail, dash-centric) and **Paladin** (slow, shielded,
  holy AoE). They're already stubbed — triples replayability.

---

## 💤 Parked (built, intentionally disabled — revisit later)
- **Perfect dodge / parry**: fully built & verified (dash through an attack →
  slow-mo, shock ring, +Fury, dash refund; parried bolts shatter) but it didn't
  earn its place in the current kit — pinned behind
  `CONFIG.features.perfectDodge`. Revisit for a future world or a hero whose
  identity IS the dodge-dance (the Rogue wants this).
- **Watchers ("eyes in the dark")**: `_spawnWatcher` / `_drawWatchers` exist but
  spawning + drawing are commented out in `_updateDread` / `_render`.
  Whispers + the dread vignette are still live.
