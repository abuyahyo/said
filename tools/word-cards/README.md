# «Kunning so‘zi» rasmlari

Bot har kuni ertalab @saidacademy kanaliga `worker/words.js` ro‘yxatidagi navbatdagi so‘zni
1080×1080 rasm sifatida yuboradi. Rasmlar `kun/` papkasida, saytning o‘zidan beriladi
(`https://saidacademy.uz/kun/<xesh>.jpg`).

- `template.html` — kartochka dizayni (ranglar, shriftlar, joylashuv).
- `render.mjs` — `words.js` dagi har bir so‘z uchun rasm yaratadi.

Fayl nomi so‘z qatorining SHA-256 xeshidan olinadi, worker ham shunday hisoblaydi. So‘z yoki
misol o‘zgartirilsa, rasmni qayta yaratish kerak; aks holda bot shu kuni matnli post yuboradi.

```
npm i -D playwright      # bir marta
node tools/word-cards/render.mjs            # faqat yangi/o‘zgargan so‘zlar
node tools/word-cards/render.mjs --force    # hammasini qaytadan
node tools/word-cards/render.mjs --only 12  # bitta so‘z (0 dan sanaladi)
```

Ro‘yxatdan olib tashlangan so‘zlarning eski rasmlari avtomatik o‘chiriladi.
