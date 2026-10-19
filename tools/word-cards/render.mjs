// «Kunning so‘zi» rasmlarini yaratadi: worker/words.js → kun/<hash>.jpg (1080×1080)
// Fayl nomi so‘z qatorining SHA-256 xeshidan olinadi (worker ham xuddi shunday hisoblaydi),
// shuning uchun so‘z o‘zgarsa eski rasm ishlatilmaydi — bot matnli postga qaytadi.
// Ishga tushirish:  PLAYWRIGHT=/yo‘l/playwright/index.mjs node tools/word-cards/render.mjs [--only N] [--force]
import fs from "fs"; import path from "path"; import crypto from "crypto"; import { fileURLToPath, pathToFileURL } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
const words = (await import(pathToFileURL(path.join(root, "worker/words.js")).href)).default;
const out = path.join(root, "kun"); fs.mkdirSync(out, { recursive: true });
const args = process.argv.slice(2); const force = args.includes("--force");
const onlyIdx = args.includes("--only") ? Number(args[args.indexOf("--only") + 1]) : null;
const hash = (w) => crypto.createHash("sha256").update(JSON.stringify(w)).digest("hex").slice(0, 12);
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
await page.goto(pathToFileURL(path.join(here, "template.html")).href);
await page.evaluate(() => document.fonts.ready);
const keep = new Set(); let made = 0;
for (let i = 0; i < words.length; i++) {
  const w = words[i]; const file = path.join(out, hash(w) + ".jpg"); keep.add(path.basename(file));
  if (onlyIdx !== null && i !== onlyIdx) continue;
  if (!force && fs.existsSync(file)) continue;
  await page.evaluate((w) => window.fill(w), w);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, type: "jpeg", quality: 82 });
  made++;
}
// Ro‘yxatdan chiqib ketgan so‘zlarning eski rasmlarini o‘chiramiz
let removed = 0;
if (onlyIdx === null) for (const f of fs.readdirSync(out)) if (f.endsWith(".jpg") && !keep.has(f)) { fs.unlinkSync(path.join(out, f)); removed++; }
await browser.close();
console.log(`so‘zlar: ${words.length}, yangi rasm: ${made}, o‘chirildi: ${removed}`);
