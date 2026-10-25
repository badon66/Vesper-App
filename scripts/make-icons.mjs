// Generates every icon size the app needs from brand/icon.svg.
// Run with `npm run icons` after swapping the SVG for the real logo.
// The maskable icon keeps the mark inside the centre 80 percent so Android
// can crop it to any shape without clipping the V.
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../brand/icon.svg", import.meta.url));
const navy = "#132E3F";

async function plain(size, out) {
  await sharp(source).resize(size, size).png().toFile(out);
  console.log(`wrote ${out}`);
}

async function maskable(size, out) {
  const inner = Math.round(size * 0.8);
  const mark = await sharp(source).resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: navy },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(out);
  console.log(`wrote ${out}`);
}

await plain(192, "public/icons/icon-192.png");
await plain(512, "public/icons/icon-512.png");
await maskable(512, "public/icons/icon-maskable-512.png");
await plain(180, "app/apple-icon.png");
await plain(64, "app/icon.png");
