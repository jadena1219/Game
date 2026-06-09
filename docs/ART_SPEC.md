# Bladelight Art Spec — character commissions

The pipeline is proven (the Demon Lord went magenta-PNG → keyed → animated boss
with zero fringe). This is the spec for the rest of the cast. **Your Demon Lord
is the style anchor** — everything should look like it lives in the same world.

Every prompt below is **complete and standalone** — copy the whole block,
paste it, generate. No assembly required.

---

## Why the prompts say what they say (reference, not required reading)

- **Magenta `#FF00FF`, background left ON** — I key + despill it losslessly.
  Never ask the generator for "transparent background" (most can't, and they
  soften edges trying).
- **4 equal square cells, one row** — `idle | walk A | walk B | attack`; the
  engine flip-books them. Feet must sit at the same height in every cell or
  the character "swims."
- **The Bladelight rule** — foes live half their lives as silhouettes in the
  dark: dark bodies, **glowing eyes always** (colors below are wired in-game),
  one signature glow, strong silhouette.
- **Export:** PNG, any consistent cell size ≥ 256×256 (bigger is fine — I
  downscale cleanly). **Don't resize after export**; if you must, Nearest
  Neighbor only.

---

## 1. THE KNIGHT (the hero — do this one first)

```
Pixel-art character sprite sheet: exactly 4 frames in one horizontal row, in equal square cells.
A lone knight in sleek black plate armor, elegant and battle-worn, with a dark tattered half-cape. NO shield. NO weapon in his hands. Subtle cold-silver trim on the armor edges, and a faint pale-blue glow from the visor slit. Deep muted dark-fantasy colors; the visor glow is the only bright element.
Frames left to right: (1) standing vigil at rest, (2) mid-stride walking, (3) the opposite walking stride, (4) a powerful attack pose with the right arm swung forward, open-handed, as if swinging a sword the image does not show.
The knight is the exact same size and position in every cell, feet resting on the bottom edge of each cell, always facing right.
Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient.
Hard-edged retro pixel art: no anti-aliasing, no soft or feathered edges, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 2. SKELETON (chaser — eyes `#ff5040` red)

```
Pixel-art character sprite sheet: exactly 4 frames in one horizontal row, in equal square cells.
A hunched skeletal soldier in rusted scraps of armor with one broken pauldron, gripping a jagged rusted shortsword. Bone is dull and aged, armor is corroded iron. Glowing red pinpoint eye-lights (hex #ff5040) burning in black eye sockets — the eyes are the only bright element. Deep muted dark-fantasy colors.
Frames left to right: (1) standing with a slight dead sway, (2) mid-shamble step, (3) the opposite shamble step, (4) an overhead chop with the rusted sword.
The skeleton is the exact same size and position in every cell, feet resting on the bottom edge of each cell, always facing right.
Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient.
Hard-edged retro pixel art: no anti-aliasing, no soft or feathered edges, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 3. IMP (swarmer — eyes `#ffb24a` amber)

```
Pixel-art character sprite sheet: exactly 4 frames in one horizontal row, in equal square cells.
A small wiry demon with ash-grey skin, large bat-like ears, needle teeth bared in a grin, and long claws. Glowing amber eyes (hex #ffb24a), plus a faint ember-orange glow seeping from cracks across its chest — the eyes and chest cracks are the only bright elements. Deep muted dark-fantasy colors.
Frames left to right: (1) crouched and coiled, (2) mid-scurry on all fours, (3) the opposite scurry step, (4) a leaping slash with claws extended forward.
The imp is the exact same size and position in every cell, feet resting on the bottom edge of each cell, always facing right.
Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient.
Hard-edged retro pixel art: no anti-aliasing, no soft or feathered edges, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 4. OGRE (tank — eyes `#ff4040` red)

```
Pixel-art character sprite sheet: exactly 4 frames in one horizontal row, in equal square cells.
A massive hulking ogre brute with mottled stone-grey hide and crude iron plates bolted onto its shoulders and chest, dragging a huge stone club. Small furious glowing red eyes (hex #ff4040), and thin cracks of dim red heat glowing along the stone club — the eyes and club cracks are the only bright elements. Deep muted dark-fantasy colors.
Frames left to right: (1) heavy looming stand, (2) ponderous mid-trudge step, (3) the opposite trudge step, (4) a two-handed downward club smash.
The ogre is the exact same size and position in every cell, feet resting on the bottom edge of each cell, always facing right.
Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient.
Hard-edged retro pixel art: no anti-aliasing, no soft or feathered edges, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 5. DARK MAGE (caster — eyes `#b06bff` violet)

```
Pixel-art character sprite sheet: exactly 4 frames in one horizontal row, in equal square cells.
A gaunt robed sorcerer, the hood swallowing the face entirely except two glowing violet eye-lights (hex #b06bff). Tattered robe hem floating as if weightless. One skeletal hand cradles a crackling violet spell-orb — the eyes and the orb are the only bright elements. Deep muted dark-fantasy colors.
Frames left to right: (1) hovering at rest with the orb held low, (2) drifting forward, (3) the opposite drift pose, (4) casting — the orb thrust forward in an outstretched hand, flaring.
The mage is the exact same size and position in every cell, the robe hem at the bottom edge of each cell, always facing right.
Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient.
Hard-edged retro pixel art: no anti-aliasing, no soft or feathered edges, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 6. BOMBER (eyes `#ffd23a` gold)

```
Pixel-art character sprite sheet: exactly 4 frames in one horizontal row, in equal square cells.
A twitchy goblin-like creature hugging a black iron bomb bigger than its own head. Glowing manic gold eyes (hex #ffd23a), and the bomb's fuse burns with a bright orange spark — the eyes and the burning fuse are the only bright elements. Deep muted dark-fantasy colors.
Frames left to right: (1) clutching the bomb close, (2) mid-sprint stride, (3) the opposite sprint stride, (4) arms thrust upward holding the bomb overhead, about to detonate.
The bomber is the exact same size and position in every cell, feet resting on the bottom edge of each cell, always facing right.
Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient.
Hard-edged retro pixel art: no anti-aliasing, no soft or feathered edges, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 7. THE DARK KNIGHT (miniboss — Sir Garrick, the First Sacrifice)

```
Pixel-art character sprite sheet: exactly 4 frames in one horizontal row, in equal square cells.
A colossal dead knight in scorched black-and-violet plate armor — a dark mirror of a hero: hollow, heavy, wrong. He drags a cracked greatsword one-handed. Violet fire (hex #b06bff) seeps from his visor and from the joints between armor plates — the violet fire is the only bright element. Deep muted dark-fantasy colors, ash and char on the armor.
Frames left to right: (1) looming idle stand, (2) heavy advancing stride dragging the sword, (3) the opposite stride, (4) a two-handed overhead slam with the greatsword.
The knight is the exact same size and position in every cell, feet resting on the bottom edge of each cell, always facing right.
Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient.
Hard-edged retro pixel art: no anti-aliasing, no soft or feathered edges, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

*(He's huge in-game — generate at a larger canvas if you can, 512+ per cell.)*

---

## What happens on my side

Tell me the filename(s) after upload. I key + despill, align feet across
frames, build the sheet into the engine, wire eye-glow colors, and scale
in-game. One character at a time is fine — **the Knight first** if you only
do one.
