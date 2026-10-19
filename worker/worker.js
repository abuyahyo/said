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
  // Admin buyruqlari: /soz — bugungi so‘zni ko‘rish, /soz_kanal — hozir kanalga yuborish
  if (String(m.chat.id) === String(env.CHAT_ID) && /^\/soz(_kanal)?\b/.test(text)) {
    if (/^\/soz_kanal/.test(text)) {
      const j = await postWord(env, new Date(), true);
      await tg(env, "sendMessage", { chat_id: m.chat.id, text: j.ok ? "✅ Bugungi so‘z kanalga yuborildi." : "❌ Yuborilmadi: " + (j.description || "javob yo‘q") });
    } else {
      await tg(env, "sendMessage", { chat_id: m.chat.id, text: wordPost(WORDS[wordIndex(new Date())]) + "\n\n(Bu ko‘rinish. Kanalga hozir yuborish: /soz_kanal)", parse_mode: "HTML", disable_web_page_preview: true });
    }
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

// ===== Kunning so‘zi: har kuni ertalab kanalga bitta arabcha so‘z (cron 03:17 UTC = 08:17 Toshkent) =====
// [arabcha, o‘qilishi, tarjima, misol (arabcha), misol tarjimasi]
const WORDS = [
  ["كِتَابٌ", "kitāb", "kitob", "هٰذَا كِتَابٌ مُفِيدٌ.", "Bu foydali kitob."],
  ["قَلَمٌ", "qalam", "qalam", "اَلْقَلَمُ عَلَى الْمَكْتَبِ.", "Qalam stol ustida."],
  ["مَدْرَسَةٌ", "madrasa", "maktab", "ذَهَبْتُ إِلَى الْمَدْرَسَةِ.", "Maktabga bordim."],
  ["مُعَلِّمٌ", "mu‘allim", "ustoz, o‘qituvchi", "اَلْمُعَلِّمُ فِي الْفَصْلِ.", "Ustoz sinfda."],
  ["طَالِبٌ", "ṭālib", "talaba", "أَنَا طَالِبٌ جَدِيدٌ.", "Men yangi talabaman."],
  ["عِلْمٌ", "‘ilm", "ilm, bilim", "اَلْعِلْمُ نُورٌ.", "Ilm — nur."],
  ["لُغَةٌ", "luġa", "til", "اَللُّغَةُ الْعَرَبِيَّةُ جَمِيلَةٌ.", "Arab tili chiroyli."],
  ["دَرْسٌ", "dars", "dars", "هٰذَا الدَّرْسُ سَهْلٌ.", "Bu dars oson."],
  ["بَيْتٌ", "bayt", "uy", "بَيْتِي كَبِيرٌ.", "Uyim katta."],
  ["صَدِيقٌ", "ṣadīq", "do‘st", "هُوَ صَدِيقِي.", "U mening do‘stim."],
  ["كَلِمَةٌ", "kalima", "so‘z", "تَعَلَّمْتُ كَلِمَةً جَدِيدَةً.", "Yangi so‘z o‘rgandim."],
  ["مَاءٌ", "mā’", "suv", "أَشْرَبُ الْمَاءَ.", "Suv ichaman."],
  ["شَمْسٌ", "šams", "quyosh", "اَلشَّمْسُ حَارَّةٌ.", "Quyosh issiq."],
  ["قَمَرٌ", "qamar", "oy", "اَلْقَمَرُ جَمِيلٌ.", "Oy chiroyli."],
  ["سَلَامٌ", "salām", "tinchlik, salom", "اَلسَّلَامُ عَلَيْكُمْ.", "Assalomu alaykum."],
  ["أُمٌّ", "umm", "ona", "أُمِّي فِي الْبَيْتِ.", "Onam uyda."],
  ["أَبٌ", "ab", "ota", "أَبِي مُعَلِّمٌ.", "Otam o‘qituvchi."],
  ["وَرْدٌ", "ward", "gul", "اَلْوَرْدُ أَحْمَرُ.", "Gul qizil."],
  ["بَحْرٌ", "baḥr", "dengiz", "اَلْبَحْرُ وَاسِعٌ.", "Dengiz keng."],
  ["سَمَاءٌ", "samā’", "osmon", "اَلسَّمَاءُ صَافِيَةٌ.", "Osmon tiniq."],
  ["طَرِيقٌ", "ṭarīq", "yo‘l", "اَلطَّرِيقُ طَوِيلٌ.", "Yo‘l uzun."],
  ["قَلْبٌ", "qalb", "yurak, qalb", "قَلْبُهُ طَيِّبٌ.", "Uning qalbi pok."],
  ["حَيَاةٌ", "ḥayāt", "hayot", "اَلْحَيَاةُ جَمِيلَةٌ.", "Hayot go‘zal."],
  ["وَقْتٌ", "waqt", "vaqt", "اَلْوَقْتُ ثَمِينٌ.", "Vaqt qimmatli."],
  ["عَمَلٌ", "‘amal", "ish, amal", "أَذْهَبُ إِلَى الْعَمَلِ صَبَاحًا.", "Ertalab ishga boraman."],
  ["شَجَرَةٌ", "šajara", "daraxt", "اَلشَّجَرَةُ عَالِيَةٌ.", "Daraxt baland."],
  ["يَدٌ", "yad", "qo‘l", "اِغْسِلْ يَدَكَ.", "Qo‘lingni yuv."],
  ["عَيْنٌ", "‘ayn", "ko‘z", "اَلْعَيْنُ تَرَى.", "Ko‘z ko‘radi."],
  ["بَابٌ", "bāb", "eshik", "اِفْتَحِ الْبَابَ.", "Eshikni och."],
  ["أَرْضٌ", "arḍ", "yer", "اَلْأَرْضُ كَبِيرَةٌ.", "Yer katta."],
  ["جَبَلٌ", "jabal", "tog‘", "اَلْجَبَلُ عَالٍ.", "Tog‘ baland."],
  ["نَهْرٌ", "nahr", "daryo", "اَلنَّهْرُ قَرِيبٌ مِنَ الْبَيْتِ.", "Daryo uyga yaqin."],
  ["مَطَرٌ", "maṭar", "yomg‘ir", "نَزَلَ الْمَطَرُ.", "Yomg‘ir yog‘di."],
  ["نَجْمٌ", "najm", "yulduz", "اَلنَّجْمُ يَلْمَعُ.", "Yulduz charaqlaydi."],
  ["لَيْلٌ", "layl", "tun", "اَللَّيْلُ هَادِئٌ.", "Tun sokin."],
  ["صَبَاحٌ", "ṣabāḥ", "tong", "صَبَاحُ الْخَيْرِ.", "Xayrli tong."],
  ["مَسَاءٌ", "masā’", "kech", "مَسَاءُ الْخَيْرِ.", "Xayrli kech."],
  ["طَعَامٌ", "ṭa‘ām", "ovqat", "اَلطَّعَامُ لَذِيذٌ.", "Ovqat mazali."],
  ["خُبْزٌ", "ḫubz", "non", "أَكَلْتُ الْخُبْزَ.", "Non yedim."],
  ["لَبَنٌ", "laban", "sut", "أَشْرَبُ اللَّبَنَ كُلَّ يَوْمٍ.", "Har kuni sut ichaman."],
  ["شَايٌ", "šāy", "choy", "هَلْ تُرِيدُ شَايًا؟", "Choy xohlaysizmi?"],
  ["تُفَّاحٌ", "tuffāḥ", "olma", "اَلتُّفَّاحُ حُلْوٌ.", "Olma shirin."],
  ["مَدِينَةٌ", "madīna", "shahar", "طَشْقَنْدُ مَدِينَةٌ كَبِيرَةٌ.", "Toshkent — katta shahar."],
  ["سُوقٌ", "sūq", "bozor", "ذَهَبَ أَبِي إِلَى السُّوقِ.", "Otam bozorga bordi."],
  ["سَيَّارَةٌ", "sayyāra", "mashina", "اَلسَّيَّارَةُ جَدِيدَةٌ.", "Mashina yangi."],
  ["نَافِذَةٌ", "nāfiḏa", "deraza", "اِفْتَحِ النَّافِذَةَ.", "Derazani och."],
  ["وَلَدٌ", "walad", "bola, o‘g‘il", "اَلْوَلَدُ يَقْرَأُ.", "Bola o‘qiyapti."],
  ["بِنْتٌ", "bint", "qiz", "اَلْبِنْتُ تَكْتُبُ.", "Qiz yozyapti."],
  ["أَخٌ", "aḫ", "aka-uka", "أَخِي طَالِبٌ.", "Akam talaba."],
  ["أُخْتٌ", "uḫt", "opa-singil", "أُخْتِي فِي الْمَدْرَسَةِ.", "Singlim maktabda."],
  ["عَائِلَةٌ", "‘ā’ila", "oila", "عَائِلَتِي كَبِيرَةٌ.", "Oilam katta."],
  ["طَبِيبٌ", "ṭabīb", "shifokor", "اَلطَّبِيبُ مَشْغُولٌ.", "Shifokor band."],
  ["قِطٌّ", "qiṭṭ", "mushuk", "اَلْقِطُّ صَغِيرٌ.", "Mushuk kichkina."],
  ["طَائِرٌ", "ṭā’ir", "qush", "اَلطَّائِرُ يَطِيرُ.", "Qush uchyapti."],
  ["سَمَكٌ", "samak", "baliq", "اَلسَّمَكُ فِي الْمَاءِ.", "Baliq suvda."],
  ["سُؤَالٌ", "su’āl", "savol", "عِنْدِي سُؤَالٌ.", "Savolim bor."],
  ["جَوَابٌ", "jawāb", "javob", "اَلْجَوَابُ صَحِيحٌ.", "Javob to‘g‘ri."],
  ["شُكْرًا", "šukran", "rahmat", "شُكْرًا جَزِيلًا.", "Katta rahmat."],
  ["جَمِيلٌ", "jamīl", "chiroyli", "اَلْجَوُّ جَمِيلٌ.", "Havo yaxshi."],
  ["كَبِيرٌ", "kabīr", "katta", "هٰذَا بَيْتٌ كَبِيرٌ.", "Bu katta uy."],
  ["صَغِيرٌ", "ṣaġīr", "kichik", "هٰذَا قَلَمٌ صَغِيرٌ.", "Bu kichik qalam."],
  ["يَوْمٌ", "yawm", "kun", "اَلْيَوْمُ يَوْمُ الْجُمُعَةِ.", "Bugun juma."],
  ["أُسْبُوعٌ", "usbū‘", "hafta", "فِي الْأُسْبُوعِ سَبْعَةُ أَيَّامٍ.", "Haftada yetti kun bor."],
  ["فَصْلٌ", "faṣl", "sinf", "اَلْفَصْلُ نَظِيفٌ.", "Sinf toza."],
  ["مَكْتَبَةٌ", "maktaba", "kutubxona", "أَقْرَأُ فِي الْمَكْتَبَةِ.", "Kutubxonada o‘qiyman."],
  ["حَقِيبَةٌ", "ḥaqība", "sumka", "حَقِيبَتِي ثَقِيلَةٌ.", "Sumkam og‘ir."],
  ["مِفْتَاحٌ", "miftāḥ", "kalit", "أَيْنَ الْمِفْتَاحُ؟", "Kalit qayerda?"],
  ["سَاعَةٌ", "sā‘a", "soat", "كَمِ السَّاعَةُ؟", "Soat necha?"]
];
const CHANNEL_DEFAULT = "@saidacademy";

// Toshkent sanasi bo‘yicha kun raqami (UTC+5): har kuni keyingi so‘z, ro‘yxat tugasa boshidan
function wordIndex(now) {
  const day = Math.floor((now.getTime() + 5 * 3600000) / 86400000);
  return ((day % WORDS.length) + WORDS.length) % WORDS.length;
}
function wordPost(w) {
  return "📖 <b>Kunning so‘zi</b>\n\n" +
    "<b>" + w[0] + "</b>\n" +
    "<i>" + w[1] + "</i> — " + w[2] + "\n\n" +
    "Misol: " + w[3] + "\n" + w[4] + "\n\n" +
    "#kunning_sozi · <a href=\"" + SITE + "?ref=telegram\">saidacademy.uz</a>";
}
async function postWord(env, now, quiet) {
  const w = WORDS[wordIndex(now || new Date())];
  const chat = (env.CHANNEL || CHANNEL_DEFAULT).trim();
  const j = await tg(env, "sendMessage", { chat_id: chat, text: wordPost(w), parse_mode: "HTML", disable_web_page_preview: true });
  if (!j.ok && env.CHAT_ID && !quiet) {
    await tg(env, "sendMessage", { chat_id: env.CHAT_ID, text: "⚠️ «Kunning so‘zi» kanalga yuborilmadi (" + chat + "): " + (j.description || "javob yo‘q") + "\n\nBot kanalda admin bo‘lishi va «Xabar joylash» huquqiga ega bo‘lishi kerak." });
  }
  return j;
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
  async scheduled(event, env, ctx) {
    ctx.waitUntil(postWord(env, new Date(event.scheduledTime || Date.now())));
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

    // Avval tugma bilan; Telegram tugmani rad etsa (masalan, raqam Telegramda yo‘q) — tugmasiz qayta yuboriladi
    let j = await tg(env, "sendMessage", { chat_id: env.CHAT_ID, text: text, disable_web_page_preview: true, reply_markup: keyboard });
    if (!j.ok) {
      j = await tg(env, "sendMessage", { chat_id: env.CHAT_ID, text: text, disable_web_page_preview: true });
    }
    return reply({ ok: !!j.ok, description: j.ok ? undefined : "Send failed: " + (j.description || "no response from Telegram") }, j.ok ? 200 : 502, cors);
  }
};

function reply(body, status, headers) {
  const h = Object.assign({ "Content-Type": "application/json" }, headers);
  return new Response(JSON.stringify(body), { status: status, headers: h });
}
