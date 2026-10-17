/**
 * SAID academy — ariza formasi uchun Cloudflare Worker.
 * Saytdan kelgan arizani Telegram botga yuboradi. Bot tokeni saytda emas,
 * Worker'ning sozlamalarida saqlanadi.
 *
 * Kerakli sozlamalar (Worker > Settings > Variables and Secrets):
 *   BOT_TOKEN      — @BotFather bergan token
 *   CHAT_ID        — arizalar keladigan chat/guruh ID si
 *   ALLOWED_ORIGIN — ixtiyoriy, masalan: https://abuyahyo.github.io
 *
 * Himoya:
 *   - faqat forma maydonlari qabul qilinadi, xabar matni shu yerda tuziladi
 *     (tashqaridan ixtiyoriy matn yuborib bo'lmaydi)
 *   - honeypot maydoni to'ldirilgan bo'lsa — jimgina rad etiladi
 *   - bir IP dan 10 daqiqada ko'pi bilan 5 ta ariza
 */
const COURSES = {
  c1: "Bolalar uchun arab tili fonetikasi",
  c2: "Kattalar uchun arab tili fonetikasi",
  c3: "Arab tili grammatikasi"
};
const FORMATS = { group: "Guruh darsi", ind: "Individual dars" };
const WHEN = { any: "Farqi yo‘q", morning: "Ertalab", day: "Kunduzi", evening: "Kechqurun" };
const LANGS = new Set(["uz", "ru", "en"]);

const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map(); // ip -> [timestamps]  (isolat ichida, best-effort)

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (arr.length >= LIMIT) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = !env.ALLOWED_ORIGIN || origin === env.ALLOWED_ORIGIN;
    const cors = {
      "Access-Control-Allow-Origin": allowed ? (origin || "*") : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }
    if (!allowed) {
      return new Response("Forbidden", { status: 403, headers: cors });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (rateLimited(ip)) {
      return reply({ ok: false, description: "Too many requests" }, 429, cors);
    }

    let data;
    try {
      data = await request.json();
    } catch (e) {
      return reply({ ok: false, description: "Bad JSON" }, 400, cors);
    }
    if (!data || typeof data !== "object") {
      return reply({ ok: false, description: "Bad JSON" }, 400, cors);
    }

    // honeypot: botlar to'ldiradi, odamlar ko'rmaydi
    if (clean(data.website, 10)) {
      return reply({ ok: true }, 200, cors);
    }

    const name = clean(data.name, 80);
    const phoneDigits = clean(data.phone, 30).replace(/\D/g, "");
    const age = parseInt(clean(data.age, 3), 10);
    const course = COURSES[clean(data.course, 4)];
    const format = FORMATS[clean(data.format, 8)];
    const when = WHEN[clean(data.when, 10)];
    const lang = clean(data.lang, 2).toLowerCase();

    if (!name || !/^998\d{9}$/.test(phoneDigits) || !(age >= 4 && age <= 99) || !course || !format || !when) {
      return reply({ ok: false, description: "Invalid form" }, 400, cors);
    }

    const phone = "+998 " + phoneDigits.slice(3, 5) + " " + phoneDigits.slice(5, 8) + " " + phoneDigits.slice(8, 10) + " " + phoneDigits.slice(10, 12);
    const text = [
      "Yangi ariza — SAID academy sayti",
      "",
      "Ism: " + name,
      "Telefon: " + phone,
      "Kurs: " + course,
      "O‘quvchi yoshi: " + age,
      "Dars formati: " + format,
      "Qulay vaqt: " + when,
      "Til: " + (LANGS.has(lang) ? lang.toUpperCase() : "UZ")
    ].join("\n");

    const url = "https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage";
    let j;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.CHAT_ID, text: text, disable_web_page_preview: true })
      });
      j = await r.json();
    } catch (e) {
      j = { ok: false };
    }
    return reply({ ok: !!j.ok, description: j.ok ? undefined : "Send failed" }, j.ok ? 200 : 502, cors);
  }
};

function reply(body, status, headers) {
  const h = Object.assign({ "Content-Type": "application/json" }, headers);
  return new Response(JSON.stringify(body), { status: status, headers: h });
}
