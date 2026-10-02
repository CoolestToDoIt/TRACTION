// Keep Retina/large displays from multiplying Canvas raster work without a bound.
export const MAX_RENDER_PIXELS = 1_200_000;

export class RenderQuality {
  scale = 1;
  slowTime = 0;
  fastTime = 0;
  update(dt) {
    // Sustained frame pressure lowers resolution; recovery is deliberately slower.
    if (dt > 1 / 45) {
      this.slowTime += Math.min(dt, 0.05);
      this.fastTime = 0;
    } else if (dt < 1 / 58) {
      this.fastTime += dt;
      this.slowTime = Math.max(0, this.slowTime - dt);
    } else {
      this.slowTime = Math.max(0, this.slowTime - dt);
      this.fastTime = 0;
    }
    if (this.slowTime >= 1.5) {
      this.scale = Math.max(0.65, this.scale - 0.1);
      this.slowTime = 0;
    }
    if (this.fastTime >= 6) {
      this.scale = Math.min(1, this.scale + 0.05);
      this.fastTime = 0;
    }
  }
  ratio(width, height, pixelRatio) {
    const budgetRatio = Math.sqrt(
      MAX_RENDER_PIXELS / Math.max(1, width * height),
    );
    return Math.min(pixelRatio || 1, 1.6, budgetRatio) * this.scale;
  }
}
