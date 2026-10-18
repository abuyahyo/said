# SAID academy — sayt

Toshkentdagi SAID academy arab tili o‘quv markazining rasmiy sayti.
Jonli manzil: https://abuyahyo.github.io/said/

## Tuzilishi

- `index.html` — saytning o‘zi (HTML, CSS va JS bir faylda; uz/ru/en tillari)
- `assets/` — logotip, rahbar surati va litsenziya hujjatlari
- `worker/` — ariza formasi uchun Cloudflare Worker (ixtiyoriy, xavfsiz usul)
- `.github/workflows/pages.yml` — `main` ga har push bo‘lganda saytni GitHub Pages ga joylaydi

## Lokal ko‘rish

```
python3 -m http.server 8000
```

So‘ng brauzerda http://localhost:8000 manzilini oching.

## Ariza formasini Telegram botga ulash

Forma to‘ldirilganda ariza matni Telegram botga yuboriladi. Sozlamalar `index.html`
ichida, `<script>` boshidagi `TG` obyektida:

```js
const TG={
  endpoint:"",   // 2-usul: Cloudflare Worker manzili
  botToken:"",   // 1-usul: bot tokeni
  chatId:""      // 1-usul: chat ID
};
```

Ikkalasi ham bo‘sh bo‘lsa, eski usul ishlaydi: ariza matni nusxalanadi va Telegram ochiladi.

### Bot yaratish (ikkala usul uchun ham kerak)

1. Telegramda **@BotFather** ga `/newbot` deb yozing, nom va username bering.
   BotFather sizga **token** beradi, masalan `123456789:AAH...`.
2. Arizalar keladigan joy:
   - **Shaxsiy chat** bo‘lsa: botga `/start` deb yozing.
   - **Guruh** bo‘lsa: botni guruhga qo‘shing va guruhga istalgan xabar yozing.
3. **Chat ID** ni olish: brauzerda quyidagi manzilni oching (TOKEN o‘rniga o‘z tokeningiz):
   `https://api.telegram.org/botTOKEN/getUpdates`
   Javobdagi `"chat":{"id":...}` qiymati — chat ID. Guruh uchun u manfiy son bo‘ladi (`-100...`).

### 1-usul — oddiy (5 daqiqa)

`index.html` dagi `botToken` va `chatId` ni to‘ldiring. Tamom.

Kamchiligi: token sayt kodida ochiq turadi. Uni ko‘rgan odam shu bot nomidan
chatingizga xabar yuborishi mumkin. Shuning uchun bu bot faqat arizalar uchun
ishlatilsin va boshqa hech qayerga qo‘shilmasin. Muammo bo‘lsa, BotFather'da
`/revoke` bilan tokenni almashtirasiz.

### 2-usul — xavfsiz (Cloudflare Worker, bepul)

Token Cloudflare'da maxfiy saqlanadi, saytda ko‘rinmaydi.

1. https://dash.cloudflare.com da bepul hisob oching.
2. **Workers & Pages → Create → Create Worker**, nom bering, **Deploy**.
3. **Edit code** bosib, `worker/worker.js` tarkibini to‘liq joylashtiring va **Deploy**.
4. **Settings → Variables and Secrets** da qo‘shing:
   - `BOT_TOKEN` (Secret) — bot tokeni
   - `CHAT_ID` (Secret) — chat ID
   - `ALLOWED_ORIGIN` — `https://abuyahyo.github.io`
5. Worker manzilini (`https://....workers.dev`) `index.html` dagi `endpoint` ga yozing.

## E’lon qatori va havolalar

- **E’lon** — `news.json` faylini GitHub'da tahrirlang: `uz`, `ru`, `en` matnlari, `link` (masalan `#apply` yoki to‘liq URL), `until` (`2026-12-31` ko‘rinishida, shu kundan keyin e’lon o‘zi yo‘qoladi). Matn bo‘sh bo‘lsa, qator ko‘rinmaydi. Saqlagandan 1–2 daqiqa o‘tib saytda chiqadi.
- **Kurs havolasi** — `https://abuyahyo.github.io/said/?kurs=bolalar` (yoki `kattalar`, `grammatika`) ochilganda ariza oynasi shu kurs tanlangan holda ochiladi. Instagram bio va postlar uchun.
- **Manba kuzatuvi** — havola oxiriga `?ref=instagram`, `?ref=telegram` yoki `?ref=qr` qo‘shing (masalan Instagram bio uchun `https://abuyahyo.github.io/said/?ref=instagram`). Shu havoladan kelgan odamning arizasida "Manba: Instagram" qatori chiqadi. Kerak bo‘lsa boshqa so‘z ham yozsa bo‘ladi (`?ref=reklama1`), u xabarda xuddi shunday ko‘rinadi.
- **Kontakt fayli** — `said-academy.vcf`, "Kontaktni saqlash" tugmasi shu faylni yuklaydi.

## Keyingi rejalar

Markazdan material kerak:

- [ ] **Yandex Metrika** — hisoblagich raqami
- [ ] **Sharhlar** — o‘quvchi yoki ota-onalarning 2–3 ta qisqa fikri (ism, bir-ikki jumla)
- [ ] **O‘qituvchilar** — ism, rasm, qisqa ma’lumot
- [ ] **O‘z domen** — masalan `saidacademy.uz` bo‘lsa, GitHub Pages'ga ulash
- [ ] **Yangi sertifikatlar** — talabalar natijasi bo‘limiga qo‘shish uchun rasm

Materialsiz qilsa bo‘ladi:

- [ ] Mobil menyuga barcha bo‘limlar
- [ ] Telegram botga `/start` javobi
- [ ] Sayt xatolarini Telegramga yuborish

Qilinmaydi (egasining qarori): dars jadvali, email, bot tokenini yangilash, Google Sheets, narxlar, tilni avtomatik tanlash, haftalik hisobot, ruscha promo video, Instagram post rasmlari, Google Maps, header'da telefon, "Ulashish" tugmasi, alifbo bo‘limi.
