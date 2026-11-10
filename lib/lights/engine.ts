import type { Effect, Look } from "@/lib/deck";
import {
  CHASE_BLEND_MS,
  CHASE_FPS,
  TWINKLE_FPS,
  TWINKLE_SLOW_FPS,
  blockColour,
  chaseStepMs,
  effectAnimates,
  lightFrame,
  type LightFrame,
  type LightId,
} from "@/lib/lights/effects";
import type { Transform } from "@/lib/lights/frame";
import { SOFFIT_GLOW_M, WASH_DEPTH_M, spriteRadii } from "@/lib/lights/glow";
import { makeCanvas, makeLightSprite, makeWashTile, releaseCanvas, type Sprite } from "@/lib/lights/paint";
import type { Placement } from "@/lib/lights/place";
import { easeQuiet } from "@/lib/motion";

// The light canvas's engine (browser only; components/lights/light-canvas.tsx
// is its only user). One canvas, device pixel ratio capped at 2. Sprites are
// drawn once per colour and size when a look is chosen and added with
// 'lighter'; the wash is drawn once per look on a quarter-size canvas and
// scaled up. Steady draws once and stops. The loop runs only while playing,
// the document is visible and Twinkle or Chase is on (or a look is
// cross-fading): Twinkle at up to 30 fps, dropping to 15 if 30 frames
// average over 40 ms; Chase only while a step is blending. Off is the
// canvas's own opacity (LightCanvas), so the picture is simply held.

export const MAX_DPR = 2;
const WASH_SCALE = 4;
const WATCHDOG_FRAMES = 30;
const WATCHDOG_SLOW_MS = 40;
// A long stall (a hidden tab the browser forgot to report) never jumps the
// effect far ahead.
const MAX_STEP_MS = 250;

export type LightScene = {
  placement: Placement | null;
  transform: Transform;
  // CSS px of the canvas's box.
  width: number;
  height: number;
  wash: boolean;
};

type Layer = { look: Look; sprites: Sprite[]; wash: HTMLCanvasElement | null };

export function lookSignature(look: Pick<Look, "colours" | "block">): string {
  return `${look.block}:${look.colours.map((colour) => colour.hex.toUpperCase()).join(",")}`;
}

export class LightEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private scene: LightScene | null = null;
  // The lights that can show, in device px, with their place on their line.
  private count = 0;
  private xs = new Float32Array(0);
  private ys = new Float32Array(0);
  private lineOf = new Int32Array(0);
  private indexOf = new Int32Array(0);
  private washWeight = new Float32Array(0);
  private pitchCss = 0;
  private current: Layer | null = null;
  private previous: Layer | null = null;
  private fade: { start: number; ms: number } | null = null;
  private effect: Effect = "steady";
  private clock = 0;
  private lastTick: number | null = null;
  private playing = false;
  private visible = true;
  private raf = 0;
  private lastDraw = -Infinity;
  private twinkleFps = TWINKLE_FPS;
  private intervals: number[] = [];
  private lastTwinkleDraw: number | null = null;
  private drawnStep: { step: number; settled: boolean } | null = null;
  private frame: LightFrame = { from: 0, to: 0, mix: 0, level: 1 };
  private id: LightId = { line: 0, i: 0 };
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.visible = document.visibilityState !== "hidden";
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  setScene(scene: LightScene): void {
    if (this.destroyed) return;
    const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
    const same =
      this.scene &&
      this.scene.placement === scene.placement &&
      this.scene.transform.scale === scene.transform.scale &&
      this.scene.transform.x === scene.transform.x &&
      this.scene.transform.y === scene.transform.y &&
      this.scene.width === scene.width &&
      this.scene.height === scene.height &&
      this.scene.wash === scene.wash &&
      this.dpr === dpr;
    if (same) return;
    this.scene = scene;
    this.dpr = dpr;
    const width = Math.max(0, Math.round(scene.width * dpr));
    const height = Math.max(0, Math.round(scene.height * dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.width = width;
    this.height = height;
    this.locate();
    // Sprites and the wash depend on the size on screen: rebuild, and let
    // any cross-fade finish at once.
    this.dropPrevious();
    if (this.current) {
      const look = this.current.look;
      this.releaseLayer(this.current);
      this.current = this.buildLayer(look);
    }
    this.redraw();
  }

  setLook(look: Look, fadeMs: number): void {
    if (this.destroyed) return;
    if (this.current && lookSignature(this.current.look) === lookSignature(look)) {
      this.current.look = look;
      return;
    }
    const next = this.buildLayer(look);
    // While Off the canvas is invisible, so there is nothing to cross-fade.
    if (this.current && fadeMs > 0 && this.effect !== "off" && this.visible && this.count > 0) {
      this.dropPrevious();
      this.previous = this.current;
      this.fade = { start: performance.now(), ms: fadeMs };
    } else {
      this.dropPrevious();
      if (this.current) this.releaseLayer(this.current);
    }
    this.current = next;
    this.redraw();
  }

  setEffect(effect: Effect): void {
    if (this.destroyed || effect === this.effect) return;
    const wasOff = this.effect === "off";
    this.effect = effect;
    this.clock = 0;
    this.lastTick = null;
    this.drawnStep = null;
    this.resetWatchdog();
    // Off holds the last picture while the canvas fades out.
    if (effect === "off") {
      this.stop();
      return;
    }
    if (wasOff || !effectAnimates(effect) || !this.playing) this.redraw();
    else this.schedule();
  }

  setPlaying(playing: boolean): void {
    if (this.destroyed || playing === this.playing) return;
    this.playing = playing;
    this.lastTick = null;
    this.resetWatchdog();
    if (playing) this.schedule();
    else if (!this.fade) this.stop();
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.dropPrevious();
    if (this.current) this.releaseLayer(this.current);
    this.current = null;
    releaseCanvas(this.canvas);
  }

  // ---------------------------------------------------------------- inside

  private onVisibility = () => {
    this.visible = document.visibilityState !== "hidden";
    if (!this.visible) {
      this.stop();
      this.lastTick = null;
      this.resetWatchdog();
      this.dropPrevious();
      return;
    }
    this.redraw();
  };

  private resetWatchdog() {
    this.intervals = [];
    this.lastTwinkleDraw = null;
  }

  // Where each light lands on the canvas; lights well outside it are skipped.
  private locate() {
    const placement = this.scene?.placement;
    const t = this.scene?.transform;
    if (!placement || !t || placement.lights.length === 0 || !(placement.pitch > 0)) {
      this.count = 0;
      this.pitchCss = 0;
      return;
    }
    const dpr = this.dpr;
    this.pitchCss = placement.pitch * t.scale;
    const reach = Math.max(spriteRadii(this.pitchCss).bloom, this.pitchCss * 2, WASH_DEPTH_M * placement.pxPerMetre * t.scale) * dpr + 2;
    const lights = placement.lights;
    const xs = new Float32Array(lights.length);
    const ys = new Float32Array(lights.length);
    const lineOf = new Int32Array(lights.length);
    const indexOf = new Int32Array(lights.length);
    const washWeight = new Float32Array(lights.length);
    let n = 0;
    for (let at = 0; at < lights.length; at++) {
      const light = lights[at];
      const x = (light.x * t.scale + t.x) * dpr;
      const y = (light.y * t.scale + t.y) * dpr;
      if (x < -reach || y < -reach || x > this.width + reach || y > this.height + reach) continue;
      xs[n] = x;
      ys[n] = y;
      lineOf[n] = light.line;
      indexOf[n] = light.i;
      // The wash tiles are a pitch apart across; where lights sit closer
      // across (a rake, or a measured line), each tile gives less.
      const before = at > 0 && lights[at - 1].line === light.line ? lights[at - 1] : null;
      const after = at < lights.length - 1 && lights[at + 1].line === light.line ? lights[at + 1] : null;
      const across =
        before && after ? Math.abs(after.x - before.x) / 2 : before ? Math.abs(light.x - before.x) : after ? Math.abs(after.x - light.x) : placement.pitch;
      washWeight[n] = Math.min(1.5, Math.max(0.25, across / placement.pitch));
      n += 1;
    }
    this.count = n;
    this.xs = xs;
    this.ys = ys;
    this.lineOf = lineOf;
    this.indexOf = indexOf;
    this.washWeight = washWeight;
  }

  private buildLayer(look: Look): Layer {
    const sprites = this.pitchCss > 0 ? look.colours.map((colour) => makeLightSprite(colour.hex, this.pitchCss, this.dpr)) : [];
    return { look, sprites, wash: this.scene?.wash ? this.buildWash(look) : null };
  }

  private buildWash(look: Look): HTMLCanvasElement | null {
    const placement = this.scene?.placement;
    const t = this.scene?.transform;
    if (!placement || !t || this.count === 0 || this.width === 0 || this.height === 0) return null;
    const perMetre = (placement.pxPerMetre * t.scale * this.dpr) / WASH_SCALE;
    const pitch = (this.pitchCss * this.dpr) / WASH_SCALE;
    const canvas = makeCanvas(this.width / WASH_SCALE, this.height / WASH_SCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    const tiles = look.colours.map((colour) => makeWashTile(colour.hex, pitch, WASH_DEPTH_M * perMetre, SOFFIT_GLOW_M * perMetre));
    ctx.globalCompositeOperation = "lighter";
    for (let n = 0; n < this.count; n++) {
      const tile = tiles[blockColour(this.indexOf[n], look)] ?? tiles[0];
      if (!tile) continue;
      ctx.globalAlpha = this.washWeight[n];
      ctx.drawImage(tile.canvas, this.xs[n] / WASH_SCALE - tile.ox, this.ys[n] / WASH_SCALE - tile.oy);
    }
    for (const tile of tiles) releaseCanvas(tile.canvas);
    return canvas;
  }

  private releaseLayer(layer: Layer) {
    for (const sprite of layer.sprites) releaseCanvas(sprite.canvas);
    releaseCanvas(layer.wash);
    layer.sprites = [];
    layer.wash = null;
  }

  private dropPrevious() {
    if (this.previous) this.releaseLayer(this.previous);
    this.previous = null;
    this.fade = null;
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private wantsFrames(): boolean {
    if (this.destroyed || !this.visible) return false;
    return this.fade !== null || (this.playing && effectAnimates(this.effect));
  }

  private schedule() {
    if (!this.raf && this.wantsFrames()) this.raf = requestAnimationFrame(this.tick);
  }

  // Draw now, then keep going only if something is moving.
  private redraw() {
    if (this.destroyed || !this.visible) return;
    this.draw(performance.now());
    this.schedule();
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (!this.wantsFrames()) {
      this.lastTick = null;
      return;
    }
    const animating = this.playing && effectAnimates(this.effect);
    if (animating) {
      if (this.lastTick !== null) this.clock += Math.min(MAX_STEP_MS, Math.max(0, now - this.lastTick));
      this.lastTick = now;
    }
    let draw = true;
    if (!this.fade && animating && this.current) {
      const fps = this.effect === "twinkle" ? this.twinkleFps : CHASE_FPS;
      if (now - this.lastDraw < 1000 / fps - 2) draw = false;
      else if (this.effect === "chase") {
        const stepMs = chaseStepMs(this.current.look);
        const step = Math.floor(this.clock / stepMs);
        const settled = this.clock - step * stepMs >= CHASE_BLEND_MS;
        if (settled && this.drawnStep?.step === step && this.drawnStep.settled) draw = false;
        else this.drawnStep = { step, settled };
      }
    }
    if (draw) {
      if (animating && !this.fade && this.effect === "twinkle") this.watchdog(now);
      this.draw(now);
    }
    this.schedule();
  };

  private watchdog(now: number) {
    if (this.twinkleFps === TWINKLE_SLOW_FPS) return;
    if (this.lastTwinkleDraw !== null) this.intervals.push(now - this.lastTwinkleDraw);
    this.lastTwinkleDraw = now;
    if (this.intervals.length < WATCHDOG_FRAMES) return;
    const average = this.intervals.reduce((sum, ms) => sum + ms, 0) / this.intervals.length;
    this.intervals = [];
    if (average > WATCHDOG_SLOW_MS) this.twinkleFps = TWINKLE_SLOW_FPS;
  }

  private draw(now: number) {
    const ctx = this.ctx;
    this.lastDraw = now;
    if (!ctx || this.width === 0 || this.height === 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.current || this.count === 0) return;
    ctx.globalCompositeOperation = "lighter";
    // Off holds the picture it had; the canvas's opacity does the fading.
    const effect: Effect = this.effect === "off" ? "steady" : this.effect;
    let k = 1;
    if (this.fade) {
      const progress = Math.min(1, (now - this.fade.start) / this.fade.ms);
      k = easeQuiet(progress);
      if (this.previous && k < 1) this.drawLayer(ctx, this.previous, effect, 1 - k);
      if (progress >= 1) this.dropPrevious();
    }
    this.drawLayer(ctx, this.current, effect, k);
  }

  private drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, effect: Effect, weight: number) {
    if (weight <= 0) return;
    if (layer.wash) {
      ctx.globalAlpha = weight;
      ctx.drawImage(layer.wash, 0, 0, this.width, this.height);
    }
    const sprites = layer.sprites;
    if (sprites.length === 0) return;
    const frame = this.frame;
    const id = this.id;
    for (let n = 0; n < this.count; n++) {
      id.line = this.lineOf[n];
      id.i = this.indexOf[n];
      lightFrame(effect, layer.look, id, this.clock, frame);
      const alpha = frame.level * weight;
      if (alpha <= 0.002) continue;
      const x = this.xs[n];
      const y = this.ys[n];
      if (frame.from === frame.to || frame.mix <= 0) this.blit(ctx, sprites[frame.from], x, y, alpha);
      else if (frame.mix >= 1) this.blit(ctx, sprites[frame.to], x, y, alpha);
      else {
        this.blit(ctx, sprites[frame.from], x, y, alpha * (1 - frame.mix));
        this.blit(ctx, sprites[frame.to], x, y, alpha * frame.mix);
      }
    }
  }

  private blit(ctx: CanvasRenderingContext2D, sprite: Sprite | undefined, x: number, y: number, alpha: number) {
    if (!sprite) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite.canvas, Math.round(x - sprite.half), Math.round(y - sprite.half));
  }
}
