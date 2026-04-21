# MT5 Bridge — Setup Guide

## 📋 สิ่งที่ต้องมี
- Python 3.8+ + MetaTrader5 installed บน Windows
- Node.js 18+
- MongoDB
- MT5 Terminal installed (ไม่ต้องเปิด — ระบบเปิดให้เอง)

---

## 🚀 Step 1: ติดตั้ง Python dependencies
```bash
cd python-worker
pip install -r requirements.txt
```

---

## 🚀 Step 2: ติดตั้งและรัน Backend
```bash
cd backend
npm install
cp .env.example .env
# แก้ SECRET_KEY ใน .env ให้เป็น random string
npm run dev
```

---

## 🚀 Step 3: เพิ่ม Angular code เข้า project
```
copy frontend/src/app/admin/ → [angular-project]/src/app/admin/
```

### เพิ่มใน app.routes.ts:
```ts
{
  path: 'admin',
  loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES)
}
```

### เพิ่มใน app.config.ts:
```ts
import { provideHttpClient } from '@angular/common/http';
providers: [ ..., provideHttpClient() ]
```

---

## ✅ การใช้งาน

1. เปิด http://localhost:4200/admin
2. กด **"+ Add Account"**
3. ใส่: ชื่อ / MT5 Login / Password / Server
4. กด **"✓ Add & Start"**
5. ระบบ login MT5 ให้อัตโนมัติ — ไม่ต้องเปิด MT5 เอง

---

## 🔄 Flow จริงๆ
```
User กด Add & Start
     ↓
Node.js บันทึกใน MongoDB + spawn Python process
     ↓
Python เปิด MT5 ใน background → login → ดึงข้อมูลทุก 5s
     ↓
HTTP POST → Node.js → MongoDB
     ↓
WebSocket broadcast → Angular Dashboard (real-time)
```
