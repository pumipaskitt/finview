import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import MetaTrader5 as mt5

print("MT5 version:", mt5.__version__)

# Step 1: Initialize (เปิด MT5 terminal ใน background)
if not mt5.initialize():
    print("initialize() failed:", mt5.last_error())
    print()
    print(">>> MT5 Terminal ยังไม่ได้ install หรือหาไฟล์ไม่เจอ")
    print(">>> Download MT5 จาก EXNESS แล้วติดตั้งก่อนครับ")
    print(">>> https://www.exness.com/th/metatrader-5/")
    quit()

print("initialize() OK")

# Step 2: Login
login    = 267806322
password = input("ใส่ Investor Password: ")
server   = "Exness-MT5Real39"

if not mt5.login(login, password=password, server=server):
    print("login() failed:", mt5.last_error())
    mt5.shutdown()
    quit()

print("login() OK")

# Step 3: ดึงข้อมูล
info = mt5.account_info()
print(f"\nBalance : {info.balance} {info.currency}")
print(f"Equity  : {info.equity}")
print(f"Profit  : {info.profit}")
print(f"Name    : {info.name}")

positions = mt5.positions_get()
print(f"\nOpen positions: {len(positions) if positions else 0}")

mt5.shutdown()
print("\nDone!")
