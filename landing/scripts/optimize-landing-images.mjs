import sharp from "sharp";
import { readdirSync, mkdirSync, copyFileSync, unlinkSync, existsSync } from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function optimizeDir(dir, { maxWidth, syncTo }) {
  if (!existsSync(dir)) {
    console.warn("skip missing dir", dir);
    return;
  }
  if (syncTo) mkdirSync(syncTo, { recursive: true });

  const files = readdirSync(dir).filter((f) => f.endsWith(".png"));
  for (const file of files) {
    const base = basename(file, ".png");
    const input = join(dir, file);
    const pipeline = sharp(input).resize(maxWidth, null, {
      withoutEnlargement: true,
      fit: "inside",
    });

    const pngOut = join(dir, `${base}.png`);
    const webpOut = join(dir, `${base}.webp`);
    const avifOut = join(dir, `${base}.avif`);
    const pngTmp = join(dir, `${base}.opt.png`);

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

    if (syncTo) {
      copyFileSync(pngOut, join(syncTo, `${base}.png`));
      copyFileSync(webpOut, join(syncTo, `${base}.webp`));
      copyFileSync(avifOut, join(syncTo, `${base}.avif`));
    }

    const sizes = await Promise.all([
      sharp(pngOut).toBuffer().then((b) => b.length),
      sharp(webpOut).toBuffer().then((b) => b.length),
      sharp(avifOut).toBuffer().then((b) => b.length),
    ]);
    console.log(
      `${basename(dir)}/${base}: png ${(sizes[0] / 1024).toFixed(1)}KB webp ${(sizes[1] / 1024).toFixed(1)}KB avif ${(sizes[2] / 1024).toFixed(1)}KB`,
    );
  }
}

const root = join(__dirname, "..");
await optimizeDir(join(root, "images", "setup"), {
  maxWidth: 720,
  syncTo: join(root, "..", "docs", "screenshots"),
});
await optimizeDir(join(root, "images", "showcase"), {
  maxWidth: 1080,
  syncTo: null,
});

console.log("Done.");
