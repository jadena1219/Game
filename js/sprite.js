// Sprite drawing + animation helpers.
import { Assets } from './assets.js';
import { CONFIG } from './config.js';

// Pick which frame label to show based on entity motion/attack state.
export function pickFrame(entity, time) {
  if (entity.attackAnim > 0) return 'attack';
  // Per-sprite animation override. The Demon Lord defines a slow, smooth flap that
  // cycles ADJACENT poses (idle→walkA→walkB→walkA) instead of snapping between two
  // far-apart wing-spread frames at 6fps — which read as a seizure on a big sprite.
  // (manifest may not have arrived yet — the game renders before assets land)
  const sp = entity.sprite && Assets.manifest && Assets.manifest.sprites[entity.sprite];
  if (sp && sp.anim) {
    const a = sp.anim;
    const seq = entity.moving ? (a.walk || ['walkA', 'walkB']) : (a.idle || ['idle']);
    const fps = entity.moving ? (a.walkFps || 4) : (a.idleFps || 2);
    return seq[Math.floor(Math.max(0, time) * fps) % seq.length];
  }
  if (entity.moving) {
    // ~6 fps walk cycle
    return Math.floor(time * 6) % 2 === 0 ? 'walkA' : 'walkB';
  }
  return 'idle';
}

// Tinted frames (silhouette / hit-flash / burn shading) are baked once into a
// cache and blitted whole. Re-compositing every tinted foe each frame (in the
// dark that's nearly ALL of them) with a source-atop pass stalls the GPU; one
// cached drawImage doesn't. Keyed by sprite|frame|colour|alpha-bucket, with
// alpha quantized to 0.05 steps so the cache stays small and reuse stays high.
const _tintCache = new Map();

// Draw a sprite centred at world (x, y), anchored at the feet.
// `smooth` skips the pixel-snap: scenes that SCALE the canvas (the title camp)
// would otherwise turn each 1px world step into a visible multi-pixel jump.
export function drawSprite(ctx, name, frameLabel, x, y, faceLeft, extraScale = 1, tint = null, smooth = false) {
  const m = Assets.manifest;
  const img = Assets.images[name];
  if (!m || !img || (img.tagName === 'IMG' && !img.complete)) return;
  const sp = m.sprites[name] || {};
  const fw = sp.fw || m.frameW, fh = sp.fh || m.frameH;   // per-sprite frame size (custom sheets)
  const col = m.frames[frameLabel] ?? 0;
  const scale = CONFIG.pixelScale * (sp.scale || 1) * extraScale;
  const dw = fw * scale, dh = fh * scale;

  ctx.save();
  ctx.translate(smooth ? x : Math.round(x), smooth ? y : Math.round(y));
  if (faceLeft) ctx.scale(-1, 1);
  // anchor: horizontally centred, vertically at the feet (bottom)
  const dx = -dw / 2, dy = -dh + scale * 1.5;
  ctx.imageSmoothingEnabled = false;

  if (tint) {
    // Bake the tinted frame once (colour lands only on the silhouette, never a
    // rectangle behind it) and reuse it. Alpha is bucketed to 0.05 so pulsing
    // tints still hit the cache instead of compositing fresh every frame.
    const ab = Math.round(Math.max(0, Math.min(1, tint.a)) * 20);
    const key = name + '|' + frameLabel + '|' + tint.color + '|' + ab;
    let buf = _tintCache.get(key);
    if (!buf) {
      buf = document.createElement('canvas'); buf.width = fw; buf.height = fh;
      const bx = buf.getContext('2d');
      bx.imageSmoothingEnabled = false;
      bx.drawImage(img, col * fw, 0, fw, fh, 0, 0, fw, fh);
      bx.globalCompositeOperation = 'source-atop';
      bx.globalAlpha = ab / 20; bx.fillStyle = tint.color;
      bx.fillRect(0, 0, fw, fh);
      _tintCache.set(key, buf);
    }
    ctx.drawImage(buf, 0, 0, fw, fh, dx, dy, dw, dh);
  } else {
    ctx.drawImage(img, col * fw, 0, fw, fh, dx, dy, dw, dh);
  }
  ctx.restore();
}

export function spriteHeight(name) {
  const m = Assets.manifest;
  if (!m) return 24 * CONFIG.pixelScale;
  return m.frameH * CONFIG.pixelScale * (m.sprites[name]?.scale || 1);
}
