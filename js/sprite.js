// Sprite drawing + animation helpers.
import { Assets } from './assets.js';
import { CONFIG } from './config.js';

// Pick which frame label to show based on entity motion/attack state.
export function pickFrame(entity, time) {
  if (entity.attackAnim > 0) return 'attack';
  // Per-sprite animation override. The Demon Lord defines a slow, smooth flap that
  // cycles ADJACENT poses (idle→walkA→walkB→walkA) instead of snapping between two
  // far-apart wing-spread frames at 6fps — which read as a seizure on a big sprite.
  const sp = entity.sprite && Assets.manifest.sprites[entity.sprite];
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

// A scratch canvas so sprite tints colour only the silhouette, not the whole
// bounding box (source-atop on the live canvas would tint everything behind it).
let _tintCv = null, _tintCx = null;

// Draw a sprite centred at world (x, y), anchored at the feet.
export function drawSprite(ctx, name, frameLabel, x, y, faceLeft, extraScale = 1, tint = null) {
  const m = Assets.manifest;
  const img = Assets.images[name];
  if (!img || (img.tagName === 'IMG' && !img.complete)) return;
  const sp = m.sprites[name] || {};
  const fw = sp.fw || m.frameW, fh = sp.fh || m.frameH;   // per-sprite frame size (custom sheets)
  const col = m.frames[frameLabel] ?? 0;
  const scale = CONFIG.pixelScale * (sp.scale || 1) * extraScale;
  const dw = fw * scale, dh = fh * scale;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (faceLeft) ctx.scale(-1, 1);
  // anchor: horizontally centred, vertically at the feet (bottom)
  const dx = -dw / 2, dy = -dh + scale * 1.5;
  ctx.imageSmoothingEnabled = false;

  if (tint) {
    // tint on a scratch buffer where only the sprite's pixels exist, then blit —
    // so the colour lands on the silhouette, never a rectangle behind it.
    if (!_tintCv) { _tintCv = document.createElement('canvas'); _tintCx = _tintCv.getContext('2d'); }
    if (_tintCv.width !== fw || _tintCv.height !== fh) { _tintCv.width = fw; _tintCv.height = fh; }
    _tintCx.clearRect(0, 0, fw, fh);
    _tintCx.imageSmoothingEnabled = false;
    _tintCx.globalCompositeOperation = 'source-over'; _tintCx.globalAlpha = 1;
    _tintCx.drawImage(img, col * fw, 0, fw, fh, 0, 0, fw, fh);
    _tintCx.globalCompositeOperation = 'source-atop';
    _tintCx.globalAlpha = tint.a; _tintCx.fillStyle = tint.color;
    _tintCx.fillRect(0, 0, fw, fh);
    _tintCx.globalCompositeOperation = 'source-over'; _tintCx.globalAlpha = 1;
    ctx.drawImage(_tintCv, 0, 0, fw, fh, dx, dy, dw, dh);
  } else {
    ctx.drawImage(img, col * fw, 0, fw, fh, dx, dy, dw, dh);
  }
  ctx.restore();
}

export function spriteHeight(name) {
  const m = Assets.manifest;
  return m.frameH * CONFIG.pixelScale * (m.sprites[name]?.scale || 1);
}
