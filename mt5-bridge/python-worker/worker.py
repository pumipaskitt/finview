"""
MT5 Worker — login MT5 ใน background แล้วส่งข้อมูลไป Node.js server
รันโดย controller.py

Args:
  --account-id   : MongoDB account _id
  --login        : MT5 login number
  --password     : MT5 password
  --server       : MT5 server name เช่น Exness-MT5Real39
  --api-url      : Node.js server URL เช่น http://168.144.38.205
  --secret-key   : secret key สำหรับ authentication
  --mt5-path     : path ของ terminal64.exe ใน instance folder
                   เช่น C:\MT5_Instances\<accountId>\terminal64.exe
  --interval     : sync interval (วินาที) default=5
"""

import os
import MetaTrader5 as mt5
import requests
import time
import argparse
import sys
from datetime import datetime, timedelta

# Fix Windows Unicode encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ────────────────────────────────────────────────────────
# Parse arguments
# ────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument('--account-id', required=True)
parser.add_argument('--login',      required=True, type=int)
parser.add_argument('--password',   required=True)
parser.add_argument('--server',     required=True)
parser.add_argument('--api-url',    required=True)
parser.add_argument('--secret-key', required=True)
parser.add_argument('--mt5-path',   required=False, default=None,
                    help='Full path to terminal64.exe of this account instance')
parser.add_argument('--interval',   default=5, type=int)
args = parser.parse_args()

API_URL    = args.api_url.rstrip('/')
SYNC_URL   = f"{API_URL}/internal/sync"
STATUS_URL = f"{API_URL}/internal/status"

def log(msg):
    ts = datetime.now().strftime('%H:%M:%S')
    print(f"[{ts}][{args.account_id[:8]}] {msg}", flush=True)

# ────────────────────────────────────────────────────────
# Connect to MT5
# ────────────────────────────────────────────────────────
def connect():
    """
    Initialize MT5 พร้อม auto-login ในคำสั่งเดียว
    ส่ง login/password/server ให้ mt5.initialize() โดยตรง
    → terminal จะ login ให้อัตโนมัติ ไม่ต้องกด manual
    """
    init_kwargs = dict(
        login=args.login,
        password=args.password,
        server=args.server,
        timeout=60000,   # รอ terminal เปิดได้นานสุด 60 วินาที
    )
    if args.mt5_path:
        init_kwargs['path'] = args.mt5_path
        log(f"Using MT5 instance: {args.mt5_path}")

    # Retry สูงสุด 5 ครั้ง (terminal instance ใหม่อาจใช้เวลาเปิด)
    for attempt in range(1, 6):
        if mt5.initialize(**init_kwargs):
            break
        log(f"⏳ MT5 initialize attempt {attempt}/5 failed: {mt5.last_error()} — retrying in 10s")
        time.sleep(10)
    else:
        log(f"❌ MT5 initialize failed after 5 attempts: {mt5.last_error()}")
        sys.exit(1)

    info = mt5.account_info()
    if info is None:
        log(f"❌ Login failed: {mt5.last_error()}")
        mt5.shutdown()
        sys.exit(1)

    log(f"✅ Connected — {info.name} | Balance: {info.balance} {info.currency}")
    return True

# ────────────────────────────────────────────────────────
# Build payload
# ────────────────────────────────────────────────────────
def get_account():
    i = mt5.account_info()
    if i is None:
        return None
    return {
        "login":      str(i.login),
        "name":       i.name,
        "server":     i.server,
        "currency":   i.currency,
        "balance":    i.balance,
        "equity":     i.equity,
        "margin":     i.margin,
        "freeMargin": i.margin_free,
        "profit":     i.profit,
        "leverage":   i.leverage,
    }

def get_positions():
    positions = mt5.positions_get()
    if positions is None:
        return []
    result = []
    for p in positions:
        result.append({
            "ticket":       str(p.ticket),
            "symbol":       p.symbol,
            "type":         "buy" if p.type == mt5.ORDER_TYPE_BUY else "sell",
            "volume":       p.volume,
            "openPrice":    p.price_open,
            "currentPrice": p.price_current,
            "sl":           p.sl,
            "tp":           p.tp,
            "profit":       p.profit,
            "swap":         p.swap,
            "openTime":     p.time,
        })
    return result

def get_history():
    from_date = datetime.now() - timedelta(days=30)
    deals = mt5.history_deals_get(from_date, datetime.now())
    if deals is None:
        return []
    result = []
    for d in deals:
        if d.entry != mt5.DEAL_ENTRY_OUT:
            continue
        result.append({
            "ticket":     str(d.ticket),
            "symbol":     d.symbol,
            "type":       "buy" if d.type == mt5.DEAL_TYPE_BUY else "sell",
            "volume":     d.volume,
            "price":      d.price,
            "profit":     d.profit,
            "swap":       d.swap,
            "commission": d.commission,
            "time":       d.time,
        })
    return result

# ────────────────────────────────────────────────────────
# Send data to Node.js
# ────────────────────────────────────────────────────────
def send(account, positions, history):
    payload = {
        "secretKey":  args.secret_key,
        "accountId":  args.account_id,
        "account":    account,
        "positions":  positions,
        "history":    history,
    }
    try:
        r = requests.post(SYNC_URL, json=payload, timeout=5)
        if r.status_code == 200:
            hist_info = f" new_trades:{len(history)}" if history else ""
            log(f"📤 Synced — bal:{account['balance']} pos:{len(positions)}{hist_info}")
        else:
            log(f"⚠️  Server responded {r.status_code}")
    except Exception as e:
        log(f"⚠️  Send error: {e}")

def send_status(status, error=None):
    payload = {
        "secretKey": args.secret_key,
        "accountId": args.account_id,
        "status":    status,
        "error":     error,
    }
    try:
        requests.post(STATUS_URL, json=payload, timeout=3)
    except:
        pass

# ────────────────────────────────────────────────────────
# Main loop
# ────────────────────────────────────────────────────────
if __name__ == "__main__":
    log("🚀 Starting worker...")
    send_status("connecting")

    connect()
    send_status("connected")

    # โหลด history ครั้งแรก เพื่อรู้ว่า ticket ล่าสุดคืออะไร
    history_all  = get_history()
    last_ticket  = history_all[-1]["ticket"] if history_all else None
    log(f"📚 Loaded {len(history_all)} historical trades | last_ticket={last_ticket}")

    while True:
        try:
            account   = get_account()
            positions = get_positions()

            if account is None:
                log("⚠️  Cannot get account info — reconnecting...")
                send_status("connecting")
                mt5.shutdown()
                time.sleep(5)
                connect()
                send_status("connected")
                time.sleep(args.interval)
                continue

            # ตรวจ trade ใหม่ทุก cycle
            history_all = get_history()
            latest_ticket = history_all[-1]["ticket"] if history_all else None

            if latest_ticket != last_ticket:
                # มี trade ใหม่ — ส่ง history ทั้งหมดให้ backend upsert
                log(f"🔔 New trade detected! ticket:{latest_ticket} (was:{last_ticket})")
                last_ticket  = latest_ticket
                new_history  = history_all
            else:
                new_history  = []

            send(account, positions, new_history)

        except KeyboardInterrupt:
            log("🛑 Worker stopped")
            mt5.shutdown()
            sys.exit(0)
        except Exception as e:
            log(f"❌ Error: {e}")
            send_status("error", str(e))
            time.sleep(10)
            try:
                connect()
                send_status("connected")
            except:
                pass

        time.sleep(args.interval)
