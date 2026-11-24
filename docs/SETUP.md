# Hướng dẫn thiết lập Supabase & GitHub Pages

## 1. Tạo dự án Supabase (Miễn phí)

1. Tạo project mới trên [Supabase](https://supabase.com/).
2. Vào **SQL Editor**, chạy toàn bộ nội dung file [`supabase/migrations/0001_initial_schema.sql`](../supabase/migrations/0001_initial_schema.sql).
3. Vào **Authentication → Providers → Email**:
   - Giữ bật Email/Password.
   - Vào **Authentication → Sign In / Providers** và **tắt Allow new users to sign up** để khóa quyền đăng ký công khai.
4. Vào **Authentication → Users → Add user → Create new user**:
   - Tạo duy nhất 1 tài khoản Email + Mật khẩu của bạn.
5. Vào **Project Settings → API** để lấy `Project URL` (`VITE_SUPABASE_URL`) và `anon public key` (`VITE_SUPABASE_ANON_KEY`).

## 2. Deploy Edge Function đồng bộ Calendar (`.ics`)

Cài Supabase CLI (hoặc dùng `npx supabase`), đăng nhập và deploy function:

```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
supabase functions deploy calendar-ics --no-verify-jwt
```

> Ghi chú: `--no-verify-jwt` cần thiết vì Google/Apple Calendar gọi link `.ics` bằng `?token=...` mà không gửi header Authorization. Token riêng được kiểm tra trong `app_settings.calendar_token`.

## 3. Bật GitHub Pages & Secrets

1. Trên GitHub repo `work-dashboard` → **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Vào **Settings → Pages → Build and deployment → Source**: chọn **GitHub Actions**.
3. Push code lên nhánh `main` → GitHub Actions sẽ tự động lint, test, build và deploy lên `https://cloudain.github.io/work-dashboard/`.

## 4. Import dữ liệu lịch sử 2025–2026

1. Mở web app đã deploy, đăng nhập bằng tài khoản ở bước 1.
2. Vào tab **Cài đặt → Import lịch sử Excel (2025–2026)**.
3. Chọn file `[Gốc] Lịch làm việc hàng tuần .xlsx` trên máy của bạn, kiểm tra bảng xem trước và bấm **Xác nhận Import**.
