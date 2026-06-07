// Sprite drawing + animation helpers.
import { Assets } from './assets.js';
import { CONFIG } from './config.js';

// Pick which frame label to show based on entity motion/attack state.
export function pickFrame(entity, time) {
  if (entity.attackAnim > 0) return 'attack';
  if (entity.moving) {
    // ~6 fps walk cycle
    return Math.floor(time * 6) % 2 === 0 ? 'walkA' : 'walkB';
  }
  return 'idle';
}

// Draw a sprite centred at world (x, y), anchored at the feet.
export function drawSprite(ctx, name, frameLabel, x, y, faceLeft, extraScale = 1, tint = null) {
  const m = Assets.manifest;
  const img = Assets.images[name];
  if (!img) return;
  const fw = m.frameW, fh = m.frameH;
  const col = m.frames[frameLabel] ?? 0;
  const scale = CONFIG.pixelScale * (m.sprites[name]?.scale || 1) * extraScale;
  const dw = fw * scale, dh = fh * scale;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (faceLeft) ctx.scale(-1, 1);
  // anchor: horizontally centred, vertically at the feet (bottom)
  const dx = -dw / 2, dy = -dh + scale * 1.5;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, col * fw, 0, fw, fh, dx, dy, dw, dh);

  if (tint) {
    // flash overlay (hit feedback) using source-atop
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = tint.a;
    ctx.fillStyle = tint.color;
    ctx.fillRect(dx, dy, dw, dh);
  }
  ctx.restore();
}

export function spriteHeight(name) {
  const m = Assets.manifest;
  return m.frameH * CONFIG.pixelScale * (m.sprites[name]?.scale || 1);
}
