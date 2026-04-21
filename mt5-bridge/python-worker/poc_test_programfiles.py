"""
ทดสอบ autologin กับ C:\Program Files\MetaTrader 5\terminal64.exe โดยตรง
"""
import os, sys, time, subprocess
import win32gui, win32process
import psutil
from pywinauto import Application
from pywinauto.keyboard import send_keys

LOGIN    = 267806322
PASSWORD = "Suppessx@See99"
SERVER   = "Exness-MT5Real39"
MT5_PATH = r"C:\Program Files\MetaTrader 5\terminal64.exe"

def log(msg): print(msg, flush=True)

# Kill terminals
for p in psutil.process_iter(["pid","name"]):
    try:
        if "terminal64" in p.info["name"].lower():
            p.kill()
            log(f"Killed PID={p.info['pid']}")
    except: pass
time.sleep(2)

# Start terminal
log(f"Starting: {MT5_PATH}")
proc = subprocess.Popen([MT5_PATH])
log(f"PID={proc.pid}")
time.sleep(10)

# หา Login dialog จาก PID
def get_wins(pid):
    result = []
    def cb(hwnd, _):
        try:
            _, wpid = win32process.GetWindowThreadProcessId(hwnd)
            if wpid == pid and win32gui.IsWindowVisible(hwnd):
                result.append((hwnd, win32gui.GetWindowText(hwnd)))
        except: pass
        return True
    win32gui.EnumWindows(cb, None)
    return result

wins = get_wins(proc.pid)
log(f"Windows: {wins}")

login_hwnd = next((h for h,t in wins if t == "Login"), None)
if not login_hwnd:
    log("❌ No Login dialog found")
    sys.exit(1)

log(f"✅ Login dialog hwnd={login_hwnd}")

# กรอก dialog
app = Application(backend="win32").connect(handle=login_hwnd)
dlg = app.window(handle=login_hwnd)
edits = dlg.children(class_name="Edit")
log(f"Edit fields: {len(edits)}")
for i,e in enumerate(edits):
    log(f"  [{i}] {repr(e.window_text())}")

def fill(e, v, label):
    e.set_focus()
    time.sleep(0.1)
    send_keys("^a")
    e.type_keys(v, with_spaces=False)
    time.sleep(0.2)
    log(f"  ✅ {label} = {v}")

if len(edits) >= 5:
    fill(edits[0], str(LOGIN),  "Login")
    fill(edits[1], PASSWORD,    "Password")
    fill(edits[4], SERVER,      "Server")

for b in dlg.children(class_name="Button"):
    if "save" in b.window_text().lower():
        b.check()
        log("  ✅ Save password checked")
    if b.window_text() == "OK":
        b.click()
        log("  ✅ OK clicked")

# รอ pipe
log("\nWaiting 60s for IPC pipe...")
deadline = time.time() + 60
while time.time() < deadline:
    r = subprocess.run(
        ["powershell", "-Command",
         r"Get-ChildItem \\.\pipe\ | Where-Object {$_.Name -like '*MetaQuotes*'} | Select-Object -ExpandProperty Name"],
        capture_output=True, text=True
    )
    pipes = r.stdout.strip()
    if pipes:
        log(f"✅ Pipe found: {pipes}")
        break
    time.sleep(3)
else:
    log("❌ No pipe after 60s")
    sys.exit(1)

# Connect
log("\nConnecting MT5 library...")
import MetaTrader5 as mt5
ok = mt5.initialize(path=MT5_PATH, timeout=15000)
log(f"Result: {ok} | Error: {mt5.last_error()}")
if ok:
    i = mt5.account_info()
    if i:
        log(f"✅ Connected: {i.name} | {i.balance} {i.currency}")
    mt5.shutdown()
