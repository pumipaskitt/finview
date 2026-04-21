"""
poc_autologin.py — Automated MT5 login via GUI automation
หา Login dialog จาก Process ID ของ terminal โดยตรง
"""
import os, sys, time, subprocess, threading
import win32gui, win32process, win32con
import psutil
from datetime import datetime
from pywinauto import Application
from pywinauto.keyboard import send_keys

# ─── Config ────────────────────────────────────────────────
LOGIN       = 267806322
PASSWORD    = "Suppessx@See99"
SERVER      = "Exness-MT5Real39"
MT5_PATH    = r"C:\MT5_Template\terminal64.exe"
APPDATA_DIR = r"C:\MT5_Template\AppData"
# ───────────────────────────────────────────────────────────

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def get_windows_by_pid(pid):
    """หาทุก window ที่เป็นของ process นี้"""
    result = []
    def cb(hwnd, _):
        try:
            _, wpid = win32process.GetWindowThreadProcessId(hwnd)
            if wpid == pid and win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                cls   = win32gui.GetClassName(hwnd)
                result.append((hwnd, title, cls))
        except Exception:
            pass
        return True
    win32gui.EnumWindows(cb, None)
    return result

def find_login_dialog(pid, timeout=90):
    """Poll หา Login dialog จาก PID จนกว่าจะเจอ"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        wins = get_windows_by_pid(pid)
        for hwnd, title, cls in wins:
            if title == "Login":
                return hwnd
        time.sleep(1)
    return None

def fill_login_dialog(hwnd):
    """กรอก password + Save password + กด OK"""
    log(f"  Filling Login dialog hwnd={hwnd}...")
    try:
        app = Application(backend="win32").connect(handle=hwnd)
        dlg = app.window(handle=hwnd)

        # แสดง controls ทั้งหมด
        log("  Controls:")
        for c in dlg.children():
            try:
                log(f"    [{c.friendly_class_name()}] {repr(c.window_text())} hwnd={c.handle}")
            except Exception:
                pass

        # หา Edit fields
        edits = dlg.children(class_name="Edit")
        log(f"  Edit fields: {len(edits)}")
        for i, e in enumerate(edits):
            log(f"    Edit[{i}] text={repr(e.window_text())} hwnd={e.handle}")

        # Map fields จาก hwnd ที่รู้แล้ว:
        # Edit[0] = Login, Edit[1] = Password, Edit[4] = Server
        # (Edit[2]=Certificate, Edit[3]=OTP ปล่อยว่างไว้)
        def fill_field(edit, value, label):
            edit.set_focus()
            time.sleep(0.15)
            send_keys("^a")
            time.sleep(0.1)
            edit.type_keys(value, with_spaces=False)
            log(f"  ✅ {label} = {value}")
            time.sleep(0.2)

        if len(edits) >= 5:
            fill_field(edits[0], str(LOGIN),   "Login")
            fill_field(edits[1], PASSWORD,      "Password")
            fill_field(edits[4], SERVER,        "Server")
        elif len(edits) >= 2:
            fill_field(edits[0], str(LOGIN),   "Login (fallback)")
            fill_field(edits[1], PASSWORD,      "Password (fallback)")

        time.sleep(0.3)

        # ติ๊ก Save password
        for btn in dlg.children(class_name="Button"):
            txt = btn.window_text()
            if "save" in txt.lower() or "password" in txt.lower():
                try:
                    btn.check()
                    log(f"  ✅ Checked: '{txt}'")
                except Exception:
                    pass

        time.sleep(0.2)

        # กด OK
        for btn in dlg.children(class_name="Button"):
            if btn.window_text() == "OK":
                btn.click()
                log("  ✅ Clicked OK")
                return True

        log("  ⚠️  OK button not found — pressing Enter")
        send_keys("{ENTER}")
        return True

    except Exception as e:
        log(f"  ❌ fill_login_dialog error: {e}")
        import traceback
        traceback.print_exc()
        return False

def wait_for_pipe(timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = subprocess.run(
            ["powershell", "-Command",
             r'Get-ChildItem \\.\pipe\ | Where-Object {$_.Name -like "*MetaQuotes*"} | Select-Object -ExpandProperty Name'],
            capture_output=True, text=True, timeout=5
        )
        pipes = r.stdout.strip()
        if pipes:
            log(f"  IPC pipe: {pipes}")
            return True
        time.sleep(2)
    return False

# ─── Main ──────────────────────────────────────────────────
log("=" * 60)
log("MT5 AutoLogin POC")
log(f"  Login  : {LOGIN} | Server: {SERVER}")
log(f"  Path   : {MT5_PATH}")
log("=" * 60)

# [1] Kill terminals
log("\n[1] Kill existing terminals...")
for p in psutil.process_iter(["pid", "name"]):
    try:
        if "terminal64" in p.info["name"].lower():
            p.kill()
            log(f"  Killed PID={p.info['pid']}")
    except Exception:
        pass
time.sleep(2)

# [2] ไม่ override APPDATA — ใช้ default เพื่อให้ MT5 connect ได้ปกติ
# MT5 แต่ละ exe path จะมี data dir แยกกันอัตโนมัติผ่าน hash
log(f"\n[2] Using default APPDATA: {os.environ.get('APPDATA')}")

# [3] Start terminal
log(f"\n[3] Starting terminal...")
proc = subprocess.Popen(
    [MT5_PATH],
    cwd=os.path.dirname(MT5_PATH),
)
terminal_pid = proc.pid
log(f"  PID={terminal_pid}")

# [4] หา Login dialog จาก PID
log(f"\n[4] Waiting for Login dialog (PID={terminal_pid}, timeout=90s)...")
log("  (watching all windows owned by terminal process)")

login_hwnd = None
deadline = time.time() + 90
while time.time() < deadline:
    wins = get_windows_by_pid(terminal_pid)
    if wins:
        log(f"  Windows of PID={terminal_pid}:")
        for hwnd, title, cls in wins:
            log(f"    [{hwnd}] '{title}' class={cls}")

    for hwnd, title, cls in wins:
        if title == "Login":
            login_hwnd = hwnd
            log(f"  ✅ Found Login dialog! hwnd={hwnd}")
            break

    if login_hwnd:
        break
    time.sleep(3)

if not login_hwnd:
    log("  ❌ Login dialog not found in 90s")
    log("  Windows at timeout:")
    for hwnd, title, cls in get_windows_by_pid(terminal_pid):
        log(f"    [{hwnd}] '{title}' class={cls}")
    sys.exit(1)

time.sleep(1)

# [5] กรอก Login dialog
log(f"\n[5] Filling Login dialog...")
ok = fill_login_dialog(login_hwnd)
if not ok:
    log("❌ Failed to fill dialog")
    sys.exit(1)

# [6] รอ IPC pipe
log(f"\n[6] Waiting for IPC pipe (max 120s)...")
pipe_ok = wait_for_pipe(timeout=120)
if not pipe_ok:
    log("❌ No pipe after 120s — login may have failed")
    log("Check MT5 window for error message")
    sys.exit(1)

time.sleep(3)

# [7] Connect Python library
log(f"\n[7] Connecting MetaTrader5 library...")
import MetaTrader5 as mt5

# ไม่ต้อง set APPDATA — ใช้ default เหมือนกัน
ok = mt5.initialize(path=MT5_PATH, timeout=30000)
log(f"  Result: {ok} | Error: {mt5.last_error()}")

if ok:
    info = mt5.account_info()
    if info:
        log(f"\n✅ SUCCESS!")
        log(f"  Name   : {info.name}")
        log(f"  Login  : {info.login}")
        log(f"  Server : {info.server}")
        log(f"  Balance: {info.balance} {info.currency}")
    else:
        log(f"⚠️  Connected but account_info=None: {mt5.last_error()}")
    mt5.shutdown()
else:
    log(f"❌ mt5.initialize() failed: {mt5.last_error()}")
    sys.exit(1)

log("\n✅ POC passed!")
