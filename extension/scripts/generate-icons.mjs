import sharp from "sharp";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svg = readFileSync(join(root, "icons", "icon.svg"));
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const out = join(root, "icons", `icon-${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log("wrote", out);
}
