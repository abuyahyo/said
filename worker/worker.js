/**
 * SAID academy — ariza formasi uchun Cloudflare Worker.
 * Saytdan kelgan arizani Telegram botga yuboradi. Bot tokeni saytda emas,
 * Worker'ning sozlamalarida saqlanadi.
 *
 * Kerakli sozlamalar (Worker > Settings > Variables and Secrets):
 *   BOT_TOKEN      — @BotFather bergan token
 *   CHAT_ID        — arizalar keladigan chat/guruh ID si
 *   ALLOWED_ORIGIN — ixtiyoriy, qo‘shimcha ruxsat etilgan sayt(lar), vergul bilan; saidacademy.uz va github.io oldindan ruxsatda
 *
 * Qo‘shimcha yo‘llar:
 *   POST /tg   — Telegram bot webhook (/start javobi, xabarlarni adminga uzatish)
 *   GET  /tg-setup — webhook'ni ro‘yxatdan o‘tkazish (deploydan keyin Actions chaqiradi, cron ham)
 *   POST /err  — saytdagi JavaScript xatolari (adminga Telegram orqali, cheklangan)
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
const REFS = { qr: "QR-kod (flayer)", instagram: "Instagram", telegram: "Telegram", site: "Sayt" };

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

const SITE = "https://saidacademy.uz/";
const ORIGINS = ["https://saidacademy.uz", "https://www.saidacademy.uz", "https://abuyahyo.github.io"];
const BOT_TEXT = {
  uz: "Assalomu alaykum! Bu SAID academy — Toshkentdagi arab tili o‘quv markazi.\n\n• Bolalar va kattalar uchun fonetika va grammatika\n• Birinchi dars — bepul\n• Har kuni 07:00–20:00\n• Tinchlik metrosi yaqinida: Shayxontohur tumani, Matlubot ko‘chasi, 72-uy\n• Telefon: +998 95 829 33 30\n\nAriza qoldirish uchun quyidagi tugmani bosing yoki shu yerga yozing — xabaringiz adminga yetadi.",
  ru: "Здравствуйте! Это SAID academy — центр арабского языка в Ташкенте.\n\n• Фонетика и грамматика для детей и взрослых\n• Первый урок — бесплатно\n• Ежедневно 07:00–20:00\n• Рядом с метро Тинчлик: Шайхантахурский район, ул. Матлубот, 72\n• Телефон: +998 95 829 33 30\n\nЧтобы оставить заявку, нажмите кнопку ниже или напишите здесь — сообщение получит администратор."
};
const BOT_KB = {
  uz: { inline_keyboard: [[{ text: "Ariza qoldirish", url: SITE + "?ref=bot#apply" }], [{ text: "Sayt", url: SITE + "?ref=bot" }, { text: "Kanal", url: "https://t.me/saidacademy" }], [{ text: "🇷🇺 Русский", callback_data: "lang_ru" }]] },
  ru: { inline_keyboard: [[{ text: "Оставить заявку", url: SITE + "?ref=bot#apply" }], [{ text: "Сайт", url: SITE + "?ref=bot" }, { text: "Канал", url: "https://t.me/saidacademy" }], [{ text: "🇺🇿 O‘zbekcha", callback_data: "lang_uz" }]] }
};
const BOT_ACK = "Rahmat! Xabaringiz adminga yetkazildi, tez orada javob beramiz.\nСпасибо! Сообщение передано администратору, скоро ответим.";

async function sha256hex(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
}
async function webhookSecret(env) { return (await sha256hex("said-webhook:" + env.BOT_TOKEN)).slice(0, 48); }

function tg(env, method, body) {
  return fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
}

async function setupWebhook(env, request) {
  const url = new URL(request.url);
  const hook = url.origin + "/tg";
  const j = await tg(env, "setWebhook", { url: hook, secret_token: await webhookSecret(env), allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
  return reply({ ok: !!j.ok, url: hook, description: j.description }, j.ok ? 200 : 502, {});
}

async function handleTelegram(request, env) {
  if ((request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "") !== await webhookSecret(env)) {
    return new Response("Forbidden", { status: 403 });
  }
  let u; try { u = await request.json(); } catch (e) { return new Response("ok"); }
  // Til tugmasi: xabarni o‘sha tilga almashtiramiz
  const cq = u && u.callback_query;
  if (cq) {
    const lang = cq.data === "lang_ru" ? "ru" : "uz";
    if (cq.message && cq.message.chat) {
      await tg(env, "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: BOT_TEXT[lang], reply_markup: BOT_KB[lang], disable_web_page_preview: true });
    }
    await tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
    return new Response("ok");
  }
  const m = u && u.message;
  if (!m || !m.chat || m.chat.type !== "private") return new Response("ok");
  const text = typeof m.text === "string" ? m.text.trim() : "";
  if (/^\/start/.test(text) || /^\/help/.test(text) || !text) {
    // Har doim o‘zbekcha; pastdagi tugma bilan ruschaga o‘tiladi
    await tg(env, "sendMessage", { chat_id: m.chat.id, text: BOT_TEXT.uz, reply_markup: BOT_KB.uz, disable_web_page_preview: true });
    return new Response("ok");
  }
  // Oddiy xabar: adminga uzatamiz, foydalanuvchiga tasdiq
  if (String(m.chat.id) !== String(env.CHAT_ID)) {
    const who = [m.from && m.from.first_name, m.from && m.from.last_name].filter(Boolean).join(" ") + (m.from && m.from.username ? " (@" + m.from.username + ")" : "");
    await tg(env, "sendMessage", { chat_id: env.CHAT_ID, text: "Botga xabar — " + who + "\n\n" + text.slice(0, 1500), reply_markup: m.from && m.from.username ? { inline_keyboard: [[{ text: "Javob yozish", url: "https://t.me/" + m.from.username }]] } : undefined });
    await tg(env, "sendMessage", { chat_id: m.chat.id, text: BOT_ACK });
  }
  return new Response("ok");
}

// Sayt xatolari: bir IP dan soatiga 3 ta, bir xil xato soatiga 1 marta
const errHits = new Map(); const errSeen = new Map();
async function handleError(request, env, cors) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const arr = (errHits.get(ip) || []).filter(function (x) { return now - x < 3600000; });
  if (arr.length >= 3) return reply({ ok: true }, 200, cors);
  arr.push(now); errHits.set(ip, arr); if (errHits.size > 2000) errHits.clear();
  let d; try { d = await request.json(); } catch (e) { return reply({ ok: false }, 400, cors); }
  const msg = clean(d && d.msg, 300), src = clean(d && d.src, 200), line = clean(d && d.line, 12), page = clean(d && d.page, 200), ua = clean(d && d.ua, 160);
  if (!msg) return reply({ ok: false }, 400, cors);
  const key = msg + "|" + src + "|" + line;
  for (const [k, ts] of errSeen) if (now - ts > 3600000) errSeen.delete(k);
  if (errSeen.has(key)) return reply({ ok: true, dup: true }, 200, cors);
  errSeen.set(key, now);
  await tg(env, "sendMessage", { chat_id: env.CHAT_ID, text: "⚠️ Sayt xatosi\n\n" + msg + (src ? "\nFayl: " + src + (line ? ":" + line : "") : "") + (page ? "\nSahifa: " + page : "") + (ua ? "\nBrauzer: " + ua : ""), disable_web_page_preview: true });
  return reply({ ok: true }, 200, cors);
}

export default {
  async scheduled(event, env) {
    // Har kuni webhook'ni qayta tasdiqlaymiz (deploy URL o‘zgarsa ham ishlayversin)
    await tg(env, "setWebhook", { url: (env.WORKER_URL || "https://said-form.saidacademy2025.workers.dev").replace(/\/$/, "") + "/tg", secret_token: await webhookSecret(env), allowed_updates: ["message", "callback_query"] });
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/tg") {
      return request.method === "POST" ? handleTelegram(request, env) : new Response("ok");
    }
    if (path === "/tg-setup") {
      return setupWebhook(env, request);
    }
    const origin = request.headers.get("Origin") || "";
    const allowedList = ORIGINS.concat(env.ALLOWED_ORIGIN ? String(env.ALLOWED_ORIGIN).split(",").map(function (x) { return x.trim(); }) : []);
    const allowed = allowedList.indexOf(origin) !== -1;
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

    if (path === "/err") {
      return handleError(request, env, cors);
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
    const ageStr = clean(data.age, 3);
    const age = ageStr ? parseInt(ageStr, 10) : null;
    const course = COURSES[clean(data.course, 4)];
    const format = FORMATS[clean(data.format, 8)];
    const when = WHEN[clean(data.when, 10)];
    const lang = clean(data.lang, 2).toLowerCase();
    const refRaw = clean(data.ref, 24).toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const ref = refRaw ? (REFS[refRaw] || refRaw) : "";

    if (!name || !/^998\d{9}$/.test(phoneDigits) || (age !== null && !(age >= 4 && age <= 99)) || !course || !format || !when) {
      return reply({ ok: false, description: "Invalid form" }, 400, cors);
    }

    const phone = "+998 " + phoneDigits.slice(3, 5) + " " + phoneDigits.slice(5, 8) + " " + phoneDigits.slice(8, 10) + " " + phoneDigits.slice(10, 12);
    const text = [
      "Yangi ariza — SAID academy sayti",
      "",
      "Ism: " + name,
      "Telefon: " + phone,
      "Kurs: " + course,
      "O‘quvchi yoshi: " + (age === null ? "—" : age),
      "Dars formati: " + format,
      "Qulay vaqt: " + when,
      "Til: " + (LANGS.has(lang) ? lang.toUpperCase() : "UZ")
    ].concat(ref ? ["Manba: " + ref] : []).join("\n");

    // Xabar ostidagi tugma: arizachi bilan Telegramda yozishish (raqam Telegramda ro‘yxatdan o‘tgan bo‘lsa ochiladi)
    const keyboard = { inline_keyboard: [[{ text: "Telegramda yozish", url: "https://t.me/+" + phoneDigits }]] };

    const url = "https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage";
    let j;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.CHAT_ID, text: text, disable_web_page_preview: true, reply_markup: keyboard })
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
