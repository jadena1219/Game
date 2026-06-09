# Bladelight Art Spec — character commissions

The pipeline is proven (the Demon Lord went magenta-PNG → keyed → animated boss
with zero fringe). This is the spec for the rest of the cast. **Your Demon Lord
is the style anchor** — everything should look like it lives in the same world.

---

## Global export rules (same as the Demon Lord)

- **Solid magenta background `#FF00FF`** — one flat color, background left ON.
  Don't erase it yourself; I key + despill it losslessly.
- **No anti-aliasing softness against the background**, no drop shadow, no
  ground shadow, no outline glow, no gradient background, no vignette.
- **Facing right. Feet at the bottom** of each cell.
- **Sheet = 4 equal SQUARE cells in one horizontal row:**
  `idle | walk-step A | walk-step B | attack`.
  Same character size and same feet position in every cell (the engine
  flip-books them — if the feet drift, the character "swims").
- Any consistent cell size **≥ 256×256** (bigger is fine — I downscale with the
  alpha-weighted resampler). PNG. **Don't resize after export** (resampling adds
  soft edges); if you must, Nearest Neighbor only.

## The Bladelight rule (NEW — this is the important one)

The game is now chiaroscuro: foes spend half their lives as **silhouettes in
the dark**, and resolve into detail as they enter your blade-light. So every
character needs:

1. **A dark body** — deep, muted base colors (the world has lost its light).
   Bright pastel sprites will glow like cardboard under the shadow pass.
2. **Emissive accents** — *glowing eyes always*, plus ONE signature glow
   (runes, embers, a core, a fuse). In darkness the glow is the character's
   identity; in light it's their accent. Eye colors are wired in-game per type
   (listed below) — match them.
3. **A strong, readable silhouette** — when fully dark, shape is all that's left.

---

## The commission list (priority order)

### 1. THE KNIGHT (the hero — most-seen sprite in the game)
> Pixel-art sprite sheet, 4 frames in one horizontal row, equal square cells.
> A lone knight in sleek BLACK plate armor, elegant and battle-worn, dark
> tattered half-cape, NO shield, NO weapon in hand (the sword is drawn by the
> game). Frames: 1 standing vigil (idle), 2-3 striding (walk), 4 a powerful
> open-palm reaching pose (attack — the game overlays the sword swing).
> Subtle cold-silver trim catching light; visor slit with a faint pale glow.
> Solid magenta background #FF00FF, hard pixel edges, no anti-aliasing,
> no shadow, facing right, feet at the bottom edge, same size every frame.

### 2. SKELETON (chaser — eye glow `#ff5040` red)
> Hunched skeletal soldier in rusted scraps of armor, one broken pauldron,
> jagged rusted shortsword. Red pinpoint eye-lights in black sockets.
> Frames: idle sway | shamble A | shamble B | overhead chop.

### 3. IMP (swarmer — eye glow `#ffb24a` amber)
> Small wiry demon, ash-grey skin, bat ears, needle teeth bared, claws.
> Amber glowing eyes, faint ember glow between chest cracks.
> Frames: crouch | scurry A | scurry B | leaping slash.

### 4. OGRE (tank — eye glow `#ff4040` red)
> Massive hulking brute, mottled stone-grey hide, crude iron plates bolted on,
> dragging a stone club. Small furious red eyes, cracks of dim red heat along
> the club. Frames: heavy stand | trudge A | trudge B | club smash.

### 5. DARK MAGE (caster — eye glow `#b06bff` violet)
> Gaunt robed figure, hood swallowing the face except two violet eye-lights,
> tattered hem floating. One hand cradles a violet spell-orb (the signature
> glow). Frames: hover-idle | drift A | drift B | orb thrust (casting).

### 6. BOMBER (eye glow `#ffd23a` gold)
> Twitchy goblin-thing hugging a black iron bomb bigger than its head.
> Gold manic eyes; the bomb's FUSE burns bright orange (signature glow).
> Frames: clutch | sprint A | sprint B | arms-up detonation pose.

### 7. THE DARK KNIGHT (miniboss — Sir Garrick, the First Sacrifice)
> A colossal dead knight in scorched black-and-violet plate, the mirror of the
> hero but wrong: hollow, dragging a cracked greatsword. Violet fire seeps from
> the visor and armor joints (signature glow). He was the king's champion
> before you. Frames: looming idle | advance A | advance B | two-hand slam.
> Single character, larger canvas welcome (512+ cells) — he's huge in-game.

---

## What happens on my side

Tell me the filename(s) after upload. I key + despill, align feet across
frames, build the sheet into the engine (627-cell layout like the boss if
needed), wire eye-glow colors, and scale in-game. One character at a time is
fine — the Knight first if you only do one.
