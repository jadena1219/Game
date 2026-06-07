// Loads the sprite manifest + all sprite-sheet images.
const BASE = 'assets/sprites/';

export const Assets = {
  manifest: null,
  images: {},   // name -> HTMLImageElement
  ready: false,
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

export async function loadAssets() {
  const manifest = await fetch(BASE + 'manifest.json').then((r) => r.json());
  Assets.manifest = manifest;
  const names = Object.keys(manifest.sprites);
  await Promise.all(
    names.map(async (name) => {
      Assets.images[name] = await loadImage(BASE + manifest.sprites[name].file);
    })
  );
  Assets.ready = true;
  return Assets;
}
