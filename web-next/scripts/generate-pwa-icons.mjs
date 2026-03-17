import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcLogo = path.resolve(__dirname, "../public/images/Gazelalogo-round-256.png");
const outDir = path.resolve(__dirname, "../public/images");

async function generatePlain(size) {
  await sharp(srcLogo)
    .resize(size, size, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(path.join(outDir, `pwa-${size}.png`));
  console.log(`✓ pwa-${size}.png`);
}

async function generateMaskable(size) {
  const padding = Math.round(size * 0.1);
  const logoSize = size - padding * 2;

  const resizedLogo = await sharp(srcLogo)
    .resize(logoSize, logoSize, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resizedLogo, top: padding, left: padding }])
    .png()
    .toFile(path.join(outDir, `pwa-maskable-${size}.png`));
  console.log(`✓ pwa-maskable-${size}.png`);
}

await generatePlain(192);
await generatePlain(512);
await generateMaskable(192);
await generateMaskable(512);

console.log("PWA icons gerados com sucesso.");
