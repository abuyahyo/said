/**
 * SAID academy — ariza formasi uchun Cloudflare Worker.
 * Saytdan kelgan arizani Telegram botga yuboradi. Bot tokeni saytda emas,
 * Worker'ning maxfiy sozlamalarida saqlanadi.
 *
 * Kerakli sozlamalar (Worker > Settings > Variables and Secrets):
 *   BOT_TOKEN      — @BotFather bergan token (Secret)
 *   CHAT_ID        — arizalar keladigan chat/guruh ID si (Secret)
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
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
    if (!allowed) return new Response("Forbidden", { status: 403, headers: cors });

    let data;
    try { data = await request.json(); } catch { return json({ ok: false, description: "Bad JSON" }, 400, cors); }

    const text = String(data.text || "").slice(0, 3500).trim();
    if (!text) return json({ ok: false, description: "Empty" }, 400, cors);

    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.CHAT_ID, text }),
    });
    const j = await r.json().catch(() => ({ ok: false, description: "Telegram error" }));
    return json({ ok: !!j.ok, description: j.description }, j.ok ? 200 : 502, cors);
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}
