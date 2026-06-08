// Loads the sprite manifest + all sprite-sheet images.
// Safari is picky about loading many images at once (and about transient image
// errors), so we load in small batches with per-image retries + cache-busting.
const BASE = 'assets/sprites/';

export const Assets = {
  manifest: null,
  images: {},   // name -> HTMLImageElement
  icons: {},    // card id -> HTMLImageElement
  iconBase: 'assets/icons/',
  ready: false,
};

function loadImage(src, tries = 3) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const go = () => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => {
        attempt++;
        if (attempt < tries) setTimeout(go, 180 * attempt);
        else reject(new Error('Failed to load ' + src));
      };
      img.src = attempt > 0 ? src + '?r=' + attempt : src;   // dodge a stuck cache entry on retry
    };
    go();
  });
}

// Load a list of [key, src] in batches of `size` so Safari isn't flooded.
async function loadBatched(entries, into, size = 4) {
  for (let i = 0; i < entries.length; i += size) {
    const batch = entries.slice(i, i + size);
    await Promise.all(batch.map(async ([key, src]) => { into[key] = await loadImage(src); }));
  }
}

export async function loadAssets() {
  const manifest = await fetch(BASE + 'manifest.json', { cache: 'no-cache' }).then((r) => r.json());
  Assets.manifest = manifest;
  await loadBatched(
    Object.keys(manifest.sprites).map((name) => [name, BASE + manifest.sprites[name].file]),
    Assets.images);

  const iconManifest = await fetch(Assets.iconBase + 'manifest.json', { cache: 'no-cache' }).then((r) => r.json());
  await loadBatched(
    Object.entries(iconManifest.icons).map(([id, file]) => [id, Assets.iconBase + file]),
    Assets.icons);

  Assets.ready = true;
  return Assets;
}
