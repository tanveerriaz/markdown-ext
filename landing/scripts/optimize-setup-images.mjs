import sharp from "sharp";
import { readdirSync, mkdirSync, copyFileSync, unlinkSync } from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const setupDir = join(__dirname, "..", "images", "setup");
const docsDir = join(__dirname, "..", "..", "docs", "screenshots");
const MAX_WIDTH = 720;

mkdirSync(docsDir, { recursive: true });

const files = readdirSync(setupDir).filter((f) => f.endsWith(".png"));

for (const file of files) {
  const base = basename(file, ".png");
  const input = join(setupDir, file);
  const pipeline = sharp(input).resize(MAX_WIDTH, null, {
    withoutEnlargement: true,
    fit: "inside",
  });

  const pngOut = join(setupDir, `${base}.png`);
  const webpOut = join(setupDir, `${base}.webp`);
  const avifOut = join(setupDir, `${base}.avif`);
  const pngTmp = join(setupDir, `${base}.opt.png`);

  await pipeline
    .clone()
    .png({ compressionLevel: 9, palette: true })
    .toFile(pngTmp);
  await sharp(pngTmp).toFile(pngOut);
  await pipeline.clone().webp({ quality: 80 }).toFile(webpOut);
  await pipeline.clone().avif({ quality: 65 }).toFile(avifOut);
  try {
    unlinkSync(pngTmp);
  } catch {
    /* ignore */
  }

  copyFileSync(pngOut, join(docsDir, `${base}.png`));
  copyFileSync(webpOut, join(docsDir, `${base}.webp`));
  copyFileSync(avifOut, join(docsDir, `${base}.avif`));

  const sizes = await Promise.all([
    sharp(pngOut).toBuffer().then((b) => b.length),
    sharp(webpOut).toBuffer().then((b) => b.length),
    sharp(avifOut).toBuffer().then((b) => b.length),
  ]);
  console.log(
    `${base}: png ${(sizes[0] / 1024).toFixed(1)}KB webp ${(sizes[1] / 1024).toFixed(1)}KB avif ${(sizes[2] / 1024).toFixed(1)}KB`,
  );
}

console.log("Synced to", docsDir);
