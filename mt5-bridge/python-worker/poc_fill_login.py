"""
poc_fill_login.py — กรอก MT5 Login dialog อัตโนมัติ
รันขณะที่ MT5 เปิดอยู่และมี Login dialog โผล่
"""
import time
import sys
import win32gui
import win32con
import win32api
from pywinauto import Application

PASSWORD = "Suppessx@See99"
LOGIN    = 267806322
SERVER   = "Exness-MT5Real39"

def log(msg):
    print(msg, flush=True)

# ─── หา Login dialog ด้วย win32gui ──────────────────────
log("=== Searching for Login dialog ===")

# enumerate ทุก window รวมถึง child windows
found = []
def enum_all(hwnd, _):
    if win32gui.IsWindowVisible(hwnd):
        title = win32gui.GetWindowText(hwnd)
        cls   = win32gui.GetClassName(hwnd)
        if title:
            found.append((hwnd, title, cls))
    return True

win32gui.EnumWindows(enum_all, None)

# enumerate child windows ของทุก top-level window
def enum_children(parent_hwnd):
    children = []
    def cb(hwnd, _):
        title = win32gui.GetWindowText(hwnd)
        cls   = win32gui.GetClassName(hwnd)
        children.append((hwnd, title, cls))
        return True
    win32gui.EnumChildWindows(parent_hwnd, cb, None)
    return children

log("\nAll top-level windows:")
for hwnd, title, cls in found:
    log(f"  [{hwnd}] '{title}' class={cls}")

# หา Login dialog โดยตรง
login_hwnd = win32gui.FindWindow(None, "Login")
log(f"\nFindWindow('Login') -> hwnd={login_hwnd}")

if login_hwnd == 0:
    log("Not found as top-level — searching children of MT5...")
    # หา MT5 main window
    mt5_hwnd = win32gui.FindWindow("MetaQuotes::MetaTrader::5.00", None)
    log(f"MT5 hwnd={mt5_hwnd}")
    if mt5_hwnd:
        children = enum_children(mt5_hwnd)
        log(f"MT5 children ({len(children)}):")
        for hwnd, title, cls in children:
            log(f"  [{hwnd}] '{title}' class={cls}")
            if title == "Login":
                login_hwnd = hwnd
                log(f"  *** Found Login dialog as child: {hwnd}")

if login_hwnd == 0:
    log("\n❌ Login dialog not found — make sure MT5 is open and showing Login dialog")
    sys.exit(1)

log(f"\n✅ Login dialog found: hwnd={login_hwnd}")

# ─── Connect ด้วย win32 backend ──────────────────────────
log("\n=== Connecting to Login dialog ===")
try:
    app = Application(backend="win32").connect(handle=login_hwnd)
    dlg = app.window(handle=login_hwnd)

    log("Controls in Login dialog:")
    for ctrl in dlg.children():
        try:
            ctype = ctrl.friendly_class_name()
            ctext = ctrl.window_text()
            chw   = ctrl.handle
            log(f"  [{chw}] [{ctype}] '{ctext}'")
        except Exception as e:
            log(f"  (error: {e})")

    # ─── หา Password field ────────────────────────────────
    log("\n=== Filling Password ===")

    # Edit fields ใน dialog
    edits = dlg.children(class_name="Edit")
    log(f"Found {len(edits)} Edit fields")
    for i, e in enumerate(edits):
        log(f"  Edit[{i}]: '{e.window_text()}' hwnd={e.handle}")

    if len(edits) == 0:
        log("No Edit fields found — trying ComboBox children...")
        combos = dlg.children(class_name="ComboBox")
        for c in combos:
            log(f"  ComboBox: '{c.window_text()}'")
            for child in c.children():
                log(f"    -> [{child.friendly_class_name()}] '{child.window_text()}'")

    # Password field = Edit ที่มีข้อความว่าง หรือ Edit ที่ 2
    pwd_edit = None
    for e in edits:
        if e.window_text() == "":
            pwd_edit = e
            break

    if pwd_edit is None and len(edits) > 0:
        pwd_edit = edits[0]

    if pwd_edit:
        log(f"Using Edit hwnd={pwd_edit.handle} for password")
        pwd_edit.set_focus()
        time.sleep(0.2)
        pwd_edit.set_text("")
        pwd_edit.type_keys(PASSWORD, with_spaces=False)
        log(f"Typed password ✅")
    else:
        log("❌ Cannot find password field")

    # ─── ติ๊ก Save password ───────────────────────────────
    log("\n=== Save Password checkbox ===")
    try:
        checkboxes = dlg.children(class_name="Button")
        for btn in checkboxes:
            txt = btn.window_text()
            log(f"  Button: '{txt}'")
            if "save" in txt.lower() or "password" in txt.lower():
                btn.check()
                log(f"  Checked: '{txt}' ✅")
    except Exception as e:
        log(f"  Checkbox error: {e}")

    # ─── กด OK ───────────────────────────────────────────
    log("\n=== Clicking OK ===")
    try:
        ok_btn = dlg.child_window(title="OK", class_name="Button")
        ok_btn.click()
        log("Clicked OK ✅")
    except Exception as e:
        log(f"Button error: {e} — trying by text...")
        for btn in dlg.children(class_name="Button"):
            if btn.window_text() == "OK":
                btn.click()
                log("Clicked OK (fallback) ✅")
                break

    log("\nWaiting 15s for login to complete...")
    time.sleep(15)

except Exception as e:
    log(f"Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ─── ตรวจ IPC pipe ────────────────────────────────────────
log("\n=== Checking IPC pipe ===")
import subprocess
r = subprocess.run(
    ['powershell', '-Command',
     r'Get-ChildItem \\.\pipe\ | Where-Object {$_.Name -like "*MetaQuotes*"} | Select-Object -ExpandProperty Name'],
    capture_output=True, text=True, timeout=5
)
pipes = r.stdout.strip()
if pipes:
    log(f"✅ Pipe found: {pipes}")
else:
    log("❌ No MetaQuotes pipe — login may not have succeeded")
    sys.exit(1)

# ─── Connect MT5 Python library ───────────────────────────
log("\n=== Connecting MT5 Python library ===")
import os
import MetaTrader5 as mt5

os.environ["APPDATA"] = r"C:\MT5_Template\AppData"
ok = mt5.initialize(portable=True, timeout=15000)
log(f"Result: {ok} | Error: {mt5.last_error()}")

if ok:
    info = mt5.account_info()
    if info:
        log(f"\n✅ SUCCESS! Connected to {info.name} | {info.balance} {info.currency}")
    mt5.shutdown()
else:
    log("❌ mt5.initialize() failed")
