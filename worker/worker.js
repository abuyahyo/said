/**
 * SAID academy — ariza formasi uchun Cloudflare Worker.
 * Saytdan kelgan arizani Telegram botga yuboradi. Bot tokeni saytda emas,
 * Worker'ning sozlamalarida saqlanadi.
 *
 * Kerakli sozlamalar (Worker > Settings > Variables and Secrets):
 *   BOT_TOKEN      — @BotFather bergan token
 *   CHAT_ID        — arizalar keladigan chat/guruh ID si
 *   ALLOWED_ORIGIN — ixtiyoriy, masalan: https://abuyahyo.github.io
 */
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = !env.ALLOWED_ORIGIN || origin === env.ALLOWED_ORIGIN;
    const cors = {
      "Access-Control-Allow-Origin": allowed ? (origin || "*") : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
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
    let data;
    try {
      data = await request.json();
    } catch (e) {
      return reply({ ok: false, description: "Bad JSON" }, 400, cors);
    }
    const text = String(data.text || "").slice(0, 3500).trim();
    if (!text) {
      return reply({ ok: false, description: "Empty" }, 400, cors);
    }
    const url = "https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.CHAT_ID, text: text })
    });
    let j;
    try {
      j = await r.json();
    } catch (e) {
      j = { ok: false, description: "Telegram error" };
    }
    return reply({ ok: !!j.ok, description: j.description }, j.ok ? 200 : 502, cors);
  }
};

function reply(body, status, headers) {
  const h = Object.assign({ "Content-Type": "application/json" }, headers);
  return new Response(JSON.stringify(body), { status: status, headers: h });
}
