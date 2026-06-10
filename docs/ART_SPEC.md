# Bladelight Art Spec — character commissions (SIMPLE style)

**The lesson from round one:** the generator made the sprites too *detailed* —
smooth shading, ornate filigree, high contrast. They read like rendered
illustrations dropped into a chunky pixel game (the Knight especially looked
like "a diamond in a pile of dirt"). A game cast has to be **cohesive and
simple**, not individually impressive.

**The one rule that fixes it — flat, low-detail pixel art:**
> Limited palette (~5–6 colors), **flat cel-shading** (one shadow shade + one
> highlight shade per color, nothing more), **no gradients, no rendering, no
> painterly texture, no fine ornate detail.** Fewer, bigger shapes. Bold
> readable silhouette with a clean dark outline. Chunky low-res pixels.

Every prompt below already bakes this in. Copy a whole block, paste, generate.
**Use the same STYLE+EXPORT footer on all of them — that identical footer is
what makes the cast match.**

---

## The animation rule (so it RUNS instead of shuffling)

The two **middle** frames (`walk A` / `walk B`) are a 2-frame loop that plays
while the character moves across the floor. They must be a **TRUE alternating
stride — the legs SWAP:**
> **walk A = LEFT leg forward + RIGHT arm forward.
> walk B = RIGHT leg forward + LEFT arm forward** (the exact mirror).

If both frames keep the *same* leg forward, the legs never trade and it reads as
a twitch/bob, not a run. **You must spell out "left leg forward" / "right leg
forward"** — generators won't swap legs from the word "opposite" alone. Each
prompt below now does this explicitly.

*(The Mage floats — no legs — so its two frames differ by an up/down hover-bob +
robe sway instead of a leg swap.)*

This is also where **code-drawn sprites win automatically**: I set walk A =
left-leg, walk B = right-leg by construction, so the stride is always correct.

---

## Why the footer says what it says (reference)

- **Magenta `#FF00FF`, background ON** — I key + despill it losslessly.
- **4 equal square cells, one row** — `idle | walk A | walk B | attack`; feet
  at the same height in every cell.
- **Bladelight identity (kept, but simple):** dark body, **two glowing dot
  eyes** (color per character below), at most one other small glow. The glow is
  the character in the dark — keep the body muted and flat.
- **Export:** PNG, square cells ≥ 256×256. Don't resize after export.

---

## 1. THE KNIGHT (the hero — redo this one first)

```
Simple retro pixel-art character sprite sheet of a knight.
A plain knight in dark charcoal-black plate armor with only a few flat steel-grey edge highlights, a short dark cape, and a small glowing pale-blue slit for the visor. NO shield, NO weapon in his hands. Muted and plain — not shiny, not ornate, not realistic.
Frames left to right: (1) standing at rest, feet together; (2) walking with the LEFT leg striding forward and the RIGHT arm forward; (3) the EXACT MIRROR stride — RIGHT leg forward and LEFT arm forward (the legs must clearly swap between frames 2 and 3); (4) right arm swung forward in an attack motion, no weapon shown.
STYLE: simple, clean 16-bit retro pixel art. Limited palette of about 5 colors. FLAT cel-shading — at most one darker shade and one lighter shade per color; no gradients, no soft or blurry shading, no painterly rendering, no realistic texture, no tiny ornate filigree. Chunky low-resolution pixels, bold readable silhouette, clean dark outline. Keep it minimal: fewer, bigger shapes, not fine detail.
EXPORT: exactly 4 frames in one horizontal row, equal square cells, the character the exact same size and feet position in every cell, always facing right, feet on the bottom edge of each cell. Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient. No anti-aliasing, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 2. SKELETON (chaser — eyes red `#ff5040`)

```
Simple retro pixel-art character sprite sheet of a skeleton warrior.
A plain skeleton, bone-white with one grey shadow shade, wearing a couple of flat rusted-brown scraps of armor and holding a plain rusty shortsword. Two small glowing red dot eyes in dark sockets. Simple and bold, not detailed.
Frames left to right: (1) standing with a slight sway, feet together; (2) shambling with the LEFT leg forward and the RIGHT arm forward; (3) the EXACT MIRROR — RIGHT leg forward and LEFT arm forward (legs clearly swapped); (4) an overhead sword chop.
STYLE: simple, clean 16-bit retro pixel art. Limited palette of about 5 colors. FLAT cel-shading — at most one darker shade and one lighter shade per color; no gradients, no soft or blurry shading, no painterly rendering, no realistic texture, no tiny ornate filigree. Chunky low-resolution pixels, bold readable silhouette, clean dark outline. Keep it minimal: fewer, bigger shapes, not fine detail.
EXPORT: exactly 4 frames in one horizontal row, equal square cells, the character the exact same size and feet position in every cell, always facing right, feet on the bottom edge of each cell. Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient. No anti-aliasing, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 3. IMP (swarmer — eyes amber `#ffb24a`)

```
Simple retro pixel-art character sprite sheet of a small imp.
A small plain demon imp, flat ash-grey body with one darker shade, big pointed ears, simple claws, and two glowing amber dot eyes. Bold and simple, not detailed.
Frames left to right: (1) crouched low; (2) running with the LEFT leg forward and the RIGHT arm driving back; (3) the EXACT MIRROR — RIGHT leg forward and LEFT arm back (the legs must clearly swap, a real alternating stride); (4) a leaping claw swipe, both arms forward, airborne.
STYLE: simple, clean 16-bit retro pixel art. Limited palette of about 5 colors. FLAT cel-shading — at most one darker shade and one lighter shade per color; no gradients, no soft or blurry shading, no painterly rendering, no realistic texture, no tiny ornate filigree. Chunky low-resolution pixels, bold readable silhouette, clean dark outline. Keep it minimal: fewer, bigger shapes, not fine detail.
EXPORT: exactly 4 frames in one horizontal row, equal square cells, the character the exact same size and feet position in every cell, always facing right, feet on the bottom edge of each cell. Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient. No anti-aliasing, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 4. OGRE (tank — eyes red `#ff4040`)

```
Simple retro pixel-art character sprite sheet of a big ogre.
A large plain ogre brute, flat muddy grey-green skin with one darker shade, one simple iron shoulder plate, dragging a plain grey stone club. Two small glowing red dot eyes. Big bulky simple shape, not detailed.
Frames left to right: (1) heavy stand, feet together; (2) trudging with the LEFT leg forward; (3) the EXACT MIRROR — RIGHT leg forward (the legs must clearly swap); (4) a two-handed downward club smash.
STYLE: simple, clean 16-bit retro pixel art. Limited palette of about 5 colors. FLAT cel-shading — at most one darker shade and one lighter shade per color; no gradients, no soft or blurry shading, no painterly rendering, no realistic texture, no tiny ornate filigree. Chunky low-resolution pixels, bold readable silhouette, clean dark outline. Keep it minimal: fewer, bigger shapes, not fine detail.
EXPORT: exactly 4 frames in one horizontal row, equal square cells, the character the exact same size and feet position in every cell, always facing right, feet on the bottom edge of each cell. Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient. No anti-aliasing, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 5. DARK MAGE (caster — eyes violet `#b06bff`)

```
Simple retro pixel-art character sprite sheet of a hooded mage.
A plain hooded sorcerer in a dark robe (one flat color plus one shadow shade), face hidden in the hood, two glowing violet dot eyes, holding one small glowing violet orb. Simple and bold, not detailed.
Frames left to right: (1) hovering low with the orb held down; (2) risen UP in the hover with the robe hem swept back and the free hand raised; (3) settled DOWN lower with the hem falling and the hand lowered (frames 2 and 3 must look clearly different — an up/down hover-bob with robe sway, since the mage has no visible legs); (4) thrusting the orb forward to cast, the orb flaring.
STYLE: simple, clean 16-bit retro pixel art. Limited palette of about 5 colors. FLAT cel-shading — at most one darker shade and one lighter shade per color; no gradients, no soft or blurry shading, no painterly rendering, no realistic texture, no tiny ornate filigree. Chunky low-resolution pixels, bold readable silhouette, clean dark outline. Keep it minimal: fewer, bigger shapes, not fine detail.
EXPORT: exactly 4 frames in one horizontal row, equal square cells, the character the exact same size and feet position in every cell, always facing right, the robe hem on the bottom edge of each cell. Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient. No anti-aliasing, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 6. BOMBER (eyes gold `#ffd23a`)

```
Simple retro pixel-art character sprite sheet of a small bomber goblin.
A small plain goblin holding a plain round black bomb, flat dark-green body with one darker shade, two glowing gold dot eyes, and a short bright-orange fuse spark on the bomb. Simple and bold, not detailed.
Frames left to right: (1) holding the bomb close, feet together; (2) running with the LEFT leg forward; (3) the EXACT MIRROR — RIGHT leg forward (the legs must clearly swap, a real alternating stride); (4) the bomb raised overhead with both arms.
STYLE: simple, clean 16-bit retro pixel art. Limited palette of about 5 colors. FLAT cel-shading — at most one darker shade and one lighter shade per color; no gradients, no soft or blurry shading, no painterly rendering, no realistic texture, no tiny ornate filigree. Chunky low-resolution pixels, bold readable silhouette, clean dark outline. Keep it minimal: fewer, bigger shapes, not fine detail.
EXPORT: exactly 4 frames in one horizontal row, equal square cells, the character the exact same size and feet position in every cell, always facing right, feet on the bottom edge of each cell. Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient. No anti-aliasing, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

## 7. THE DARK KNIGHT (miniboss — Sir Garrick — eyes/glow violet `#b06bff`)

```
Simple retro pixel-art character sprite sheet of a large dead knight.
A big plain dead knight in flat black armor with two glowing violet dot eyes and a few thin violet glow lines at the armor joints, dragging a plain cracked grey greatsword. A dark mirror of a hero knight, but larger and grimmer. Bold and simple, not detailed or ornate.
Frames left to right: (1) looming stand, feet together; (2) advancing with the LEFT leg forward, dragging the sword; (3) the EXACT MIRROR — RIGHT leg forward (the legs must clearly swap); (4) a two-handed overhead greatsword slam.
STYLE: simple, clean 16-bit retro pixel art. Limited palette of about 5 colors. FLAT cel-shading — at most one darker shade and one lighter shade per color; no gradients, no soft or blurry shading, no painterly rendering, no realistic texture, no tiny ornate filigree. Chunky low-resolution pixels, bold readable silhouette, clean dark outline. Keep it minimal: fewer, bigger shapes, not fine detail.
EXPORT: exactly 4 frames in one horizontal row, equal square cells, the character the exact same size and feet position in every cell, always facing right, feet on the bottom edge of each cell. Flat solid magenta background, hex #FF00FF, one uniform color filling everything behind the character, no gradient. No anti-aliasing, no drop shadow, no ground shadow, no outline glow, no reflections, no vignette, no text, no borders or dividing lines between cells.
```

---

## 8. SWING EFFECTS (optional — code-drawn versions are already live)

Each Living Blade has its own code-drawn cut (fire tongues / ice shards /
lightning arc, `game.js _swingEmber/_swingFrost/_swingStorm`). If you'd rather
art them, generate with these and we'll key + wire them the usual way. Note:
effect sheets animate the SAME cut over 4 frames (birth → full → decay → gone),
horizontal arc opening to the RIGHT, anchored at the swing origin (bottom-left
of each cell).

```
Simple retro pixel-art EFFECT sprite sheet of a burning sword slash.
A wide crescent-shaped fire slash arc, opening to the right: deep red outer glow, orange flame body, yellow-white hot leading edge, with a few small flame tongues licking upward off the curve and 2-3 tiny ember dots. NO character, NO sword — only the slash effect.
Frames left to right: (1) the arc just beginning, short and bright; (2) the full crescent at maximum size and brightness; (3) the arc breaking up into flames and embers, dimmer; (4) only fading embers and a faint red afterglow trace of the curve.
STYLE: simple, clean 16-bit retro pixel art. Limited palette of about 5 colors. FLAT cel-shading, no gradients, no soft blur, no painterly rendering. Chunky low-resolution pixels, bold readable shape.
EXPORT: exactly 4 frames in one horizontal row, equal square cells, the arc anchored at the same origin in every cell. Flat solid magenta background #FF00FF. No anti-aliasing, no text, no borders.
```

```
Simple retro pixel-art EFFECT sprite sheet of a freezing sword slash.
A crescent-shaped ice slash arc, opening to the right: pale blue body, white crystalline JAGGED leading edge (angular facets, not a smooth curve), with 4-5 sharp icicle shards fanning outward from the curve and 1-2 tiny sparkle glints. NO character, NO sword — only the slash effect.
Frames left to right: (1) the arc beginning, shards just emerging; (2) the full crescent with the shard fan fully extended; (3) the arc fading while the shards hang and glint; (4) only faint frost mist and one last sparkle.
STYLE: simple, clean 16-bit retro pixel art. Limited palette of about 5 colors. FLAT cel-shading, no gradients, no soft blur, no painterly rendering. Chunky low-resolution pixels, bold readable shape.
EXPORT: exactly 4 frames in one horizontal row, equal square cells, the arc anchored at the same origin in every cell. Flat solid magenta background #FF00FF. No anti-aliasing, no text, no borders.
```

```
Simple retro pixel-art EFFECT sprite sheet of a lightning sword slash.
A crescent-shaped electric slash arc, opening to the right: the arc itself drawn as one JAGGED lightning bolt bent along the curve — violet outer glow, white-hot zigzag core — with 2-3 tiny forked micro-bolts branching off the edge. NO character, NO sword — only the slash effect.
Frames left to right: (1) the bolt-arc snapping into existence, thin; (2) the full jagged crescent at maximum brightness with forks; (3) the bolt re-jagged in a DIFFERENT zigzag pattern, starting to dim; (4) only 2-3 small residual sparks along the faded curve.
STYLE: simple, clean 16-bit retro pixel art. Limited palette of about 5 colors. FLAT cel-shading, no gradients, no soft blur, no painterly rendering. Chunky low-resolution pixels, bold readable shape.
EXPORT: exactly 4 frames in one horizontal row, equal square cells, the arc anchored at the same origin in every cell. Flat solid magenta background #FF00FF. No anti-aliasing, no text, no borders.
```

## On the Demon Lord

He's the exception — he already reads well because he's near-black, so his
detail dissolves into silhouette in the dark. You don't have to redo him. But
if you want *total* cohesion, regenerate him with the same STYLE footer (flat,
~5 colors, no gradients) and I'll swap him in too.

## What happens on my side

Re-upload with any filenames — tell me which is which. I key + despill, align
feet, rebuild the sheet, and the manifest scales already in place will fit the
simpler art (same cell layout). **Do the Knight first**, eyeball him in the
dungeon, and if the flat style reads right, run the rest through the same
footer.
