# Kiến trúc

```text
Browser
  └─ apps/web (Next.js, port 3000)
       └─ REST/JSON
            └─ apps/api (NestJS, port 3001)
                 └─ Mongoose
                      └─ MongoDB 7 replica set rs0 (port 27017)
```

## Thành phần

- `apps/web`: App Router, React, Tailwind CSS và các component shadcn/ui-compatible.
- `apps/api`: cấu hình môi trường, CORS, validation, Swagger, health và transaction test.
- `docker`: MongoDB một node dành cho phát triển local, volume bền vững và script khởi tạo idempotent.

## Quy ước vận hành

- Backend chạy trực tiếp trên macOS và kết nối `127.0.0.1`.
- `/api/health` chỉ phản ánh tiến trình; `/api/health/ready` yêu cầu database đã kết nối.
- Health response không chứa URI, username hoặc password.
- Transaction test dùng `runId` riêng và chỉ xóa document của chính lượt chạy đó.
- Bí mật chỉ nằm trong file môi trường đã được ignore.
