"""
POC — ทดสอบ MT5 login แบบ verbose (debug mode)
รันบน Windows VPS เท่านั้น
"""

import os
import sys
import time
import subprocess
import psutil
from datetime import datetime, timedelta

# ─── Config ───────────────────────────────────────────────
LOGIN    = 267806322
PASSWORD = "Suppessx@See99"
SERVER   = "Exness-MT5Real39"
MT5_PATH = r"C:\MT5_Template\terminal64.exe"
APPDATA_OVERRIDE = r"C:\MT5_Template\AppData"
# ──────────────────────────────────────────────────────────

def log(msg):
    ts = datetime.now().strftime('%H:%M:%S.%f')[:-3]
    print(f"[{ts}] {msg}", flush=True)

def check_file(path, label):
    exists = os.path.exists(path)
    size   = os.path.getsize(path) if exists else 0
    log(f"  {'✅' if exists else '❌'} {label}: {path} {'(' + str(size) + ' bytes)' if exists else '(NOT FOUND)'}")
    return exists

def find_terminal_procs():
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'exe', 'cmdline', 'environ']):
        try:
            if 'terminal64' in p.info['name'].lower():
                procs.append(p)
        except Exception:
            pass
    return procs

# ──────────────────────────────────────────────────────────
print("=" * 60)
print("MT5 Login POC — VERBOSE DEBUG")
print(f"  Terminal : {MT5_PATH}")
print(f"  Login    : {LOGIN}")
print(f"  Server   : {SERVER}")
print(f"  APPDATA  : {APPDATA_OVERRIDE}")
print("=" * 60)

# ─── [0] ตรวจ environment ──────────────────────────────────
log("[0] Checking environment...")
log(f"  Python   : {sys.version}")
log(f"  Platform : {sys.platform}")
log(f"  CWD      : {os.getcwd()}")
log(f"  APPDATA (before) : {os.environ.get('APPDATA', '(not set)')}")

# ─── [1] ตรวจไฟล์ที่จำเป็น ────────────────────────────────
log("\n[1] Checking required files...")
check_file(MT5_PATH, "terminal64.exe")
check_file(APPDATA_OVERRIDE, "AppData dir")
common_ini = r"C:\MT5_Template\config\common.ini"
if check_file(common_ini, "common.ini"):
    log(f"  --- common.ini contents ---")
    with open(common_ini, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            log(f"      {line.rstrip()}")
    log(f"  ----------------------------")

# ─── [2] ตรวจ terminal64 processes ที่รันอยู่ ──────────────
log("\n[2] Checking running terminal64 processes...")
procs = find_terminal_procs()
if procs:
    for p in procs:
        try:
            env = p.environ()
            appdata = env.get('APPDATA', '(none)')
            log(f"  ⚠️  terminal64 PID={p.pid} | APPDATA={appdata}")
            log(f"      exe : {p.exe()}")
            log(f"      cmd : {' '.join(p.cmdline())}")
        except Exception as e:
            log(f"  ⚠️  terminal64 PID={p.pid} (cannot read env: {e})")
else:
    log("  ✅ No terminal64 running — clean state")

# ─── [3] Override APPDATA ──────────────────────────────────
log(f"\n[3] Overriding APPDATA -> {APPDATA_OVERRIDE}")
os.makedirs(APPDATA_OVERRIDE, exist_ok=True)
os.environ["APPDATA"] = APPDATA_OVERRIDE
log(f"  APPDATA (after)  : {os.environ.get('APPDATA')}")

# ─── [4] Import MT5 หลัง set APPDATA ──────────────────────
log("\n[4] Importing MetaTrader5 library...")
try:
    import MetaTrader5 as mt5
    log(f"  ✅ MT5 version: {mt5.__version__}" if hasattr(mt5, '__version__') else "  ✅ MT5 imported (no version attr)")
except Exception as e:
    log(f"  ❌ Import failed: {e}")
    sys.exit(1)

# ─── [5] เรียก initialize พร้อม monitor process ──────────────
log(f"\n[5] Calling mt5.initialize()...")
log(f"  path     : {MT5_PATH}")
log(f"  login    : {LOGIN}")
log(f"  server   : {SERVER}")
log(f"  timeout  : 60000ms")
log(f"  portable : True")
log("  (waiting up to 60s...)")

t0 = time.time()

# spawn background thread เพื่อ monitor ว่า terminal64 โผล่ไหม
import threading
monitor_stop = threading.Event()

def monitor_processes():
    seen_pids = set()
    while not monitor_stop.is_set():
        for p in find_terminal_procs():
            if p.pid not in seen_pids:
                seen_pids.add(p.pid)
                try:
                    env     = p.environ()
                    appdata = env.get('APPDATA', '(none)')
                    cmd     = ' '.join(p.cmdline())
                    log(f"  🆕 terminal64 spawned! PID={p.pid} | APPDATA={appdata} | cmd={cmd}")
                except Exception as e:
                    log(f"  🆕 terminal64 spawned! PID={p.pid} (env read err: {e})")
        time.sleep(1)

t = threading.Thread(target=monitor_processes, daemon=True)
t.start()

ok = mt5.initialize(
    path=MT5_PATH,
    login=LOGIN,
    password=PASSWORD,
    server=SERVER,
    timeout=60000,
    portable=True,
)

monitor_stop.set()
elapsed = time.time() - t0

log(f"\n[6] mt5.initialize() returned after {elapsed:.1f}s")
log(f"  Result    : {ok}")
log(f"  last_error: {mt5.last_error()}")

if not ok:
    err_code, err_msg = mt5.last_error()
    log(f"\n❌ initialize() FAILED: ({err_code}, '{err_msg}')")

    log("\n[7] Post-failure diagnostics...")
    procs = find_terminal_procs()
    if procs:
        for p in procs:
            try:
                env     = p.environ()
                appdata = env.get('APPDATA', '(none)')
                status  = p.status()
                log(f"  terminal64 PID={p.pid} status={status} | APPDATA={appdata}")
            except Exception as e:
                log(f"  terminal64 PID={p.pid} (err: {e})")
    else:
        log("  No terminal64 process found after initialize()")
        log("  → terminal64 failed to launch OR crashed immediately")

    # ตรวจ named pipe
    log("\n[8] Checking named pipes (MetaQuotes)...")
    try:
        result = subprocess.run(
            ['powershell', '-Command',
             r'Get-ChildItem \\.\pipe\ | Where-Object { $_.Name -like "*MetaQuotes*" -or $_.Name -like "*MetaTrader*" } | Select-Object -ExpandProperty Name'],
            capture_output=True, text=True, timeout=10
        )
        pipes = result.stdout.strip()
        if pipes:
            log(f"  Found pipes:\n{pipes}")
        else:
            log("  ❌ No MetaQuotes/MetaTrader named pipes found")
            log("  → terminal did not create IPC pipe (never fully started)")
    except Exception as e:
        log(f"  (pipe check failed: {e})")

    # ตรวจ Windows Event Log สำหรับ crash
    log("\n[9] Checking recent Application errors...")
    try:
        result = subprocess.run(
            ['powershell', '-Command',
             'Get-EventLog -LogName Application -EntryType Error -Newest 5 | '
             'Where-Object { $_.Source -like "*terminal*" -or $_.Source -like "*MetaTrader*" } | '
             'Select-Object TimeGenerated, Source, Message | Format-List'],
            capture_output=True, text=True, timeout=10
        )
        out = result.stdout.strip()
        log(out if out else "  (no relevant crash events found)")
    except Exception as e:
        log(f"  (event log check failed: {e})")

    sys.exit(1)

# ─── Success path ──────────────────────────────────────────
log(f"\n✅ initialize() succeeded!")
info = mt5.account_info()
if info is None:
    log(f"❌ account_info() returned None: {mt5.last_error()}")
    mt5.shutdown()
    sys.exit(1)

log(f"  Name     : {info.name}")
log(f"  Login    : {info.login}")
log(f"  Server   : {info.server}")
log(f"  Balance  : {info.balance} {info.currency}")
log(f"  Equity   : {info.equity}")
log(f"  Leverage : 1:{info.leverage}")

positions = mt5.positions_get()
log(f"  Positions: {len(positions) if positions else 0}")

deals = mt5.history_deals_get(datetime.now() - timedelta(days=30), datetime.now())
closed = [d for d in (deals or []) if d.entry == mt5.DEAL_ENTRY_OUT]
log(f"  Trades(30d): {len(closed)}")

mt5.shutdown()
log("\n✅ POC passed!")
