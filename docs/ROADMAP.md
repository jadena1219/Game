# Knight's Last Stand — Roadmap

Our shared idea bank. When Jade asks "what's next?", start here.
Greenlit items are the agreed priorities; the backlog is everything else we
pitched so nothing gets lost.

---

## 🚢 Shipped

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
- TODO polish: a truly weaponless knight pose for the shrine (uses the normal
  sprite for now).

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

### 2. Boss arena mechanics
- The Dark Knight's slam **cracks the floor into lava**.
- The Demon Lord's nova leaves **safe-gaps** you must read.
- Turn bullet-dodging into spatial puzzles, not just movement.

---

## 🗃️ Backlog (pitched, not yet greenlit)

### Combat depth — make the blade a language
- **Perfect-dodge / parry**: dash through an attack at the last beat → brief
  slow-mo + free Fury. (Biggest feel upgrade, cheap.)
- **Combo meter**: chain kills without a hit → escalating damage + rising audio
  layer + bigger gold. (`_drawComboCounter` stub already exists.)
- **Held heavy swing**: a slower knockback cleave.

### The descent & narrative
- **Reactive Demon Lord**: whispers that reference the run ("you spared none on
  the third floor", "that relic… you shouldn't have"). Whisper system already exists.
- **Branching descents**: two pits at the camp — safe vs. deeper/redder
  (harder floor, better loot, a dare).
- **Meta layer**: the Sanctum/Souls is stubbed and ready — permanent
  between-run unlocks → "one more run."

### Juice & game-feel
- Hit-stop scaling + screen-zoom punch on kills/crits.
- Gold/soul magnetism + a satisfying pickup sound.
- Run-summary screen on death (floors, kills, best combo, defining relic).

### Heroes
- Finish **Rogue** (fast, frail, dash-centric) and **Paladin** (slow, shielded,
  holy AoE). They're already stubbed — triples replayability.

---

## 💤 Parked (built, intentionally disabled — revisit later)
- **Watchers ("eyes in the dark")**: `_spawnWatcher` / `_drawWatchers` exist but
  spawning + drawing are commented out in `_updateDread` / `_render`.
  Whispers + the dread vignette are still live.
