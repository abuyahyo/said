// Broshyurani PDF ga aylantiradi:  PLAYWRIGHT=<playwright/index.mjs> CHROME=<chrome> node print/brochure-src/render.mjs
import path from "path"; import { fileURLToPath, pathToFileURL } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--allow-file-access-from-files"] } : { args: ["--allow-file-access-from-files"] });
const pg = await b.newPage();
await pg.goto(pathToFileURL(path.join(here, "index.html")).href);
await pg.evaluate(() => document.fonts.ready);
console.log("fonts:", await pg.evaluate(() => ["800 12px Montserrat", "italic 600 12px 'Cormorant Garamond'", "700 12px Amiri"].map(f => document.fonts.check(f))));
await pg.pdf({ path: path.join(here, "..", "said-academy-broshyura.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await b.close();
