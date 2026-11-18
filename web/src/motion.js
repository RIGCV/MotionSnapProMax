// Category-independent RGB frame differencing; no semantic class is required.
export class MotionDetector {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.reset();
  }
  reset() {
    this.previous = null;
  }
  analyze(rgba, sensitivity = "high") {
    const width = this.width,
      height = this.height,
      count = width * height;
    if (rgba.length !== count * 4)
      throw new Error("Motion frame size mismatch");
    if (!this.previous) {
      this.previous = new Uint8ClampedArray(rgba);
      return { active: false, regions: [], ratio: 0 };
    }
    const old = this.previous,
      threshold = { high: 9, medium: 17, low: 27 }[sensitivity] ?? 9,
      drift = [0, 0, 0];
    for (let i = 0; i < count; i++)
      for (let c = 0; c < 3; c++) drift[c] += rgba[i * 4 + c] - old[i * 4 + c];
    for (let c = 0; c < 3; c++) drift[c] /= count;
    const mask = new Uint8Array(count),
      filtered = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      let difference = 0;
      for (let c = 0; c < 3; c++)
        difference += Math.abs(rgba[i * 4 + c] - old[i * 4 + c] - drift[c]);
      mask[i] = difference / 3 > threshold ? 1 : 0;
    }
    this.previous.set(rgba);
    for (let y = 1; y < height - 1; y++)
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (!mask[i]) continue;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            neighbors += mask[i + dy * width + dx];
        if (neighbors >= 3) filtered[i] = 1;
      }
    const regions = [],
      queue = new Int32Array(count);
    let changed = 0;
    const minimum = { high: 4, medium: 8, low: 15 }[sensitivity] ?? 4;
    for (let i = 0; i < count; i++) {
      if (!filtered[i]) continue;
      let head = 0,
        tail = 1,
        pixels = 0,
        minX = width,
        minY = height,
        maxX = 0,
        maxY = 0;
      queue[0] = i;
      filtered[i] = 0;
      while (head < tail) {
        const p = queue[head++],
          x = p % width,
          y = Math.floor(p / width);
        pixels++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const next = ny * width + nx;
            if (filtered[next]) {
              filtered[next] = 0;
              queue[tail++] = next;
            }
          }
      }
      if (pixels >= minimum) {
        changed += pixels;
        regions.push({
          x1: Math.max(0, minX - 2) / width,
          y1: Math.max(0, minY - 2) / height,
          x2: Math.min(width, maxX + 3) / width,
          y2: Math.min(height, maxY + 3) / height,
          pixels,
        });
      }
    }
    regions.sort((a, b) => b.pixels - a.pixels);
    return {
      active: regions.length > 0,
      regions: regions.slice(0, 24),
      ratio: changed / count,
    };
  }
}
