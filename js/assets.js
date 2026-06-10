// Loads the sprite manifest + all sprite-sheet images.
// Safari is picky about loading many images at once (and about transient image
// errors), so we load in small batches with per-image retries + cache-busting.
const BASE = 'assets/sprites/';
// Bump when any sprite ART changes: it busts every browser's cached copies
// (images otherwise load cache-first and players keep seeing the old art).
const ART_V = '?v=2';

export const Assets = {
  manifest: null,
  images: {},   // name -> HTMLImageElement
  icons: {},    // card id -> HTMLImageElement
  iconBase: 'assets/icons/',
  ready: false,
};

// Resolves with the Image, or null on persistent failure — NEVER rejects, so
// one bad/slow sprite can never brick boot. Missing images just don't draw
// (drawSprite guards null); they'll fill in if a later load succeeds.
function loadImage(src, tries = 4) {
  return new Promise((resolve) => {
    let attempt = 0;
    const go = () => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => {
        attempt++;
        if (attempt < tries) setTimeout(go, 200 * attempt);
        else { console.warn('sprite failed to load (non-fatal):', src); resolve(null); }
      };
      img.src = attempt > 0 ? src + (src.includes('?') ? '&' : '?') + 'r=' + attempt : src;   // dodge a stuck cache entry on retry
    };
    go();
  });
}

// Load a list of [key, src] in parallel (the browser queues connections itself).
async function loadAll(entries, into) {
  await Promise.all(entries.map(async ([key, src]) => { into[key] = await loadImage(src); }));
}

export async function loadAssets() {
  const manifest = await fetch(BASE + 'manifest.json', { cache: 'no-cache' }).then((r) => r.json());
  Assets.manifest = manifest;
  // the HERO first — the title's cold open holds until his sheet exists,
  // so the one sprite the menu needs never waits behind the other ten
  const knightFile = (manifest.sprites.knight && manifest.sprites.knight.file) || 'knight2.png';
  Assets.images.knight = await loadImage(BASE + knightFile + ART_V);
  // the rest of the cast in parallel
  await loadAll(
    Object.keys(manifest.sprites).filter((n) => n !== 'knight')
      .map((name) => [name, BASE + manifest.sprites[name].file + ART_V]),
    Assets.images);
  Assets.ready = true;
  // icons are shop/sanctum UI (the DOM uses the file paths directly) — warm the
  // cache in the background, never block boot on them
  fetch(Assets.iconBase + 'manifest.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((im) => loadAll(
      Object.entries(im.icons).map(([id, file]) => [id, Assets.iconBase + file + ART_V]),
      Assets.icons))
    .catch((e) => console.warn('icon prewarm failed (non-fatal)', e));
  return Assets;
}
