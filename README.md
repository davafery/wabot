# WA Group Bot - Cloud Ready (Railway/Replit)

## Jalankan di Replit
1. Buat Repl → Import from ZIP/Git (repo ini).
2. Buat file `.env` dari `.env.example` (OWNER_PHONE, TZ, SESSION_DIR, PORT).
3. Ganti `assets/qris.jpg` dengan QRIS asli.
4. Run → scan QR → tambah bot ke grup & jadikan admin.
> Replit menyimpan file sesi, jadi QR tidak perlu tiap restart.

## Jalankan di Railway
1. Push repo ini ke GitHub (atau gunakan "Deploy from GitHub").
2. Atur **Variables**: OWNER_PHONE, TZ, SESSION_DIR, PORT=3000.
3. Deploy → buka Logs → scan QR (lihat QR di logs; atau sementara jalankan lokal untuk ambil sesi).
> Railway filesystem bisa reset saat redeploy; gunakan Volume (berbayar) agar sesi bot tidak hilang, atau siap scan ulang setelah redeploy.

## Endpoint
- `GET /health` → cek status sederhana.
