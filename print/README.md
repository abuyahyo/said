# Chop etish uchun materiallar

Barcha QR-kodlar https://abuyahyo.github.io/said/?ref=qr manziliga olib boradi. `?ref=qr` qismi tufayli QR orqali kelgan arizalarda "Manba: QR-kod (flayer)" qatori chiqadi.

- `qr-plain.png` — oddiy QR, 2000×2000 px. Vizitka, flayer, e’lonlarga qo‘yish uchun.
- `qr.svg` — vektor QR, istalgan o‘lchamga sifat yo‘qotmasdan kattalashadi. Dizaynerga berish uchun.
- `qr-flyer.png` / `qr-flyer.jpg` — tayyor bezatilgan flayer, 2400×3000 px, logotip, QR va "Skanerlang — saytimizga o‘ting" yozuvi. Markaz eshigiga, stolga yoki devorga.

Chop etishda QR hech bo‘lmaganda 3×3 sm bo‘lsin, atrofida oq bo‘sh joy qolsin.

## Reklama videosi

- `promo-uz.mp4` — 25 soniya, vertikal 1080×1920 (Instagram Reels / Stories, Telegram), ovozsiz. Musiqani Instagram'ning o‘zida qo‘shing.

## Broshyura

- `said-academy-broshyura.pdf` — 10 sahifali A4 broshyura, brendbuk (Said_Academy___Brendbuk) qoidalari asosida: ranglar 60-30-10 (qog‘oz · osmon · said-ko‘k · navy, oltin faqat bitta urg‘u), Cormorant Garamond (sarlavhalar, katta raqamlar, urg‘u so‘zlari) + Montserrat (matn) + Amiri (arab harfi), mehrob shaklidagi ramkalar. Sahifalar: muqova, biz haqimizda, nega aynan biz, kurslar, uch qadam, ustozlar (2 sahifa), natijalar, savol-javob, orqa muqovada QR-kodlar (sayt `?ref=qr`, Telegram admin, Instagram). Telegram’da yuborish va chop etish uchun.
- `brochure-src/` — broshyuraning manbasi (`index.html`, shriftlar, QR-kodlar). Ma’lumot o‘zgarganda `index.html` tahrirlanadi va PDF qayta yaratiladi:

  ```
  node print/brochure-src/render.mjs
  ```

  (Playwright kerak; `PLAYWRIGHT=` va `CHROME=` muhit o‘zgaruvchilari orqali yo‘l ko‘rsatish mumkin.)
