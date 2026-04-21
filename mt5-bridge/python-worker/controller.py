"""
MT5 Controller — รันบน Windows VPS
- Poll /internal/accounts ทุก POLL_INTERVAL วินาที
- พบ account ใหม่ → copy MT5 instance → autologin → spawn worker
- account ถูกลบ/หยุด → kill worker + ปิด terminal

Config via environment variables:
  API_URL       : URL ของ Node.js backend
  SECRET_KEY    : secret key
  MT5_BASE_DIR  : MT5 installation จริง เช่น C:\Program Files\MetaTrader 5
  INSTANCES_DIR : C:\MT5_Instances
  PYTHON_EXE    : full path ของ python.exe
  WORKER_SCRIPT : full path ของ worker.py
"""

import os
import sys
import time
import shutil
import hashlib
import requests
import subprocess
import logging
import threading
import win32gui
import win32process
from pywinauto import Application
from pywinauto.keyboard import send_keys

# ────────────────────────────────────────────────────────
# Config
# ────────────────────────────────────────────────────────
API_URL       = os.environ.get('API_URL',       'http://168.144.38.205')
SECRET_KEY    = os.environ.get('SECRET_KEY',    'CHANGE_ME_SECRET')
MT5_BASE_DIR  = os.environ.get('MT5_BASE_DIR',  r'C:\Program Files\MetaTrader 5')
INSTANCES_DIR = os.environ.get('INSTANCES_DIR', r'C:\MT5_Instances')
PYTHON_EXE    = os.environ.get('PYTHON_EXE',    r'C:\Program Files\Python311\python.exe')
WORKER_SCRIPT = os.environ.get('WORKER_SCRIPT', r'C:\worker.py')
POLL_INTERVAL = int(os.environ.get('POLL_INTERVAL', '10'))
SYNC_INTERVAL = int(os.environ.get('SYNC_INTERVAL', '5'))

# APPDATA ของ Windows (default)
APPDATA_DIR   = os.environ.get('APPDATA', r'C:\Users\Administrator\AppData\Roaming')

# Hash ของ MT5_BASE_DIR ใน MetaQuotes\Terminal\ (หาได้จาก origin.txt)
# รัน: Get-ChildItem "$env:APPDATA\MetaQuotes\Terminal" -Directory | ForEach-Object {
#         $o = Join-Path $_.FullName "origin.txt"
#         if (Test-Path $o) { "$($_.Name) -> $(Get-Content $o)" }
#       }
MT5_BASE_HASH = os.environ.get('MT5_BASE_HASH', 'D0E8209F77C8CF37AD8BF550E51FF075')

ACCOUNTS_URL = f"{API_URL.rstrip('/')}/internal/accounts"

# ────────────────────────────────────────────────────────
# Logging
# ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [controller] %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(r'C:\controller.log', encoding='utf-8'),
    ]
)
log = logging.getLogger(__name__).info
err = logging.getLogger(__name__).error

# ────────────────────────────────────────────────────────
# State
# ────────────────────────────────────────────────────────
running: dict = {}
running_lock = threading.Lock()
# lock สำหรับ GUI autologin — ทำทีละตัวเพื่อป้องกัน keyboard focus conflict
autologin_lock = threading.Lock()
# lock สำหรับ mt5.initialize/shutdown — library ไม่ thread-safe
mt5_lock = threading.Lock()
# tracks account IDs currently being set up (to avoid duplicate threads)
setting_up: set = set()
setting_up_lock = threading.Lock()


# ────────────────────────────────────────────────────────
# MT5 Instance helpers
# ────────────────────────────────────────────────────────
def instance_dir(account_id: str) -> str:
    return os.path.join(INSTANCES_DIR, account_id)

def terminal_exe(account_id: str) -> str:
    return os.path.join(instance_dir(account_id), 'terminal64.exe')

def create_instance(account_id: str) -> bool:
    dest = instance_dir(account_id)
    if os.path.exists(terminal_exe(account_id)):
        log(f"[{account_id[:8]}] Instance already exists")
        return True

    log(f"[{account_id[:8]}] Creating instance from {MT5_BASE_DIR}...")
    os.makedirs(INSTANCES_DIR, exist_ok=True)

    if not os.path.isdir(MT5_BASE_DIR):
        err(f"MT5_BASE_DIR not found: {MT5_BASE_DIR}")
        return False

    try:
        shutil.copytree(MT5_BASE_DIR, dest)
        log(f"[{account_id[:8]}] ✅ Instance created at {dest}")
        return True
    except Exception as e:
        err(f"[{account_id[:8]}] ❌ copytree failed: {e}")
        return False

def preconfigure_instance(account: dict, account_id: str):
    """เขียน config\common.ini ให้ instance (ใช้ใน MT5 portable หรือ backup เท่านั้น)"""
    config_dir = os.path.join(instance_dir(account_id), 'config')
    os.makedirs(config_dir, exist_ok=True)
    common_ini = os.path.join(config_dir, 'common.ini')
    content = (
        '[Common]\n'
        f'Login={account["login"]}\n'
        f'Server={account["server"]}\n'
        'NewsEnable=0\n'
    )
    with open(common_ini, 'w', encoding='utf-8') as f:
        f.write(content)
    log(f"[{account_id[:8]}] Pre-configured common.ini")

def calc_mt5_hash(terminal_dir: str) -> str:
    """คำนวณ hash ของ MT5 data directory จาก terminal directory path"""
    return hashlib.md5(terminal_dir.upper().encode('utf-16-le')).hexdigest().upper()

def pre_bootstrap_instance_data(account_id: str, account: dict):
    """
    คำนวณ hash ของ instance นี้ล่วงหน้า แล้ว copy config จาก working installation
    เรียกก่อน start_terminal() เพื่อให้ terminal มี server list พร้อมทันที
    """
    inst_dir  = instance_dir(account_id)
    inst_hash = calc_mt5_hash(inst_dir)
    data_dir  = os.path.join(APPDATA_DIR, 'MetaQuotes', 'Terminal', inst_hash)
    src_config = os.path.join(APPDATA_DIR, 'MetaQuotes', 'Terminal', MT5_BASE_HASH, 'config')
    dst_config = os.path.join(data_dir, 'config')

    log(f"[{account_id[:8]}] Instance hash: {inst_hash}")
    log(f"[{account_id[:8]}] Pre-bootstrapping data dir: {data_dir}")

    os.makedirs(dst_config, exist_ok=True)

    # Copy servers.dat
    src_srv = os.path.join(src_config, 'servers.dat')
    if os.path.exists(src_srv):
        shutil.copy2(src_srv, os.path.join(dst_config, 'servers.dat'))
        log(f"[{account_id[:8]}]   ✅ servers.dat copied")
    else:
        err(f"[{account_id[:8]}]   ❌ servers.dat not found at {src_srv}")

    # Copy certificates
    src_certs = os.path.join(src_config, 'certificates')
    dst_certs = os.path.join(dst_config, 'certificates')
    if os.path.exists(src_certs):
        if os.path.exists(dst_certs):
            shutil.rmtree(dst_certs)
        shutil.copytree(src_certs, dst_certs)
        log(f"[{account_id[:8]}]   ✅ certificates copied")

    # เขียน common.ini ใน data dir ให้ terminal รู้ login/server
    common_ini = os.path.join(dst_config, 'common.ini')
    with open(common_ini, 'w', encoding='utf-8') as f:
        f.write(
            f'[Common]\n'
            f'Login={account["login"]}\n'
            f'Server={account["server"]}\n'
            f'NewsEnable=0\n'
        )
    log("[{}]   ✅ common.ini written ({}@{})".format(account_id[:8], account['login'], account['server']))

    # เขียน origin.txt
    with open(os.path.join(data_dir, 'origin.txt'), 'w', encoding='utf-8') as f:
        f.write(inst_dir)

    return data_dir

def start_terminal(account_id: str) -> 'subprocess.Popen | None':
    exe = terminal_exe(account_id)
    if not os.path.exists(exe):
        err(f"[{account_id[:8]}] terminal64.exe not found: {exe}")
        return None

    log(f"[{account_id[:8]}] Starting terminal: {exe}")
    try:
        proc = subprocess.Popen(
            [exe],
            cwd=instance_dir(account_id),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        log(f"[{account_id[:8]}] Terminal PID={proc.pid}")
        return proc
    except Exception as e:
        err(f"[{account_id[:8]}] ❌ Failed to start terminal: {e}")
        return None

def _trigger_login_dialog(mt5_main_hwnd: int, account_id: str) -> bool:
    """
    เปิด Login dialog โดย scan File menu แล้วส่ง WM_COMMAND ตรงๆ
    ไม่ใช้ keyboard focus — ทำงานได้แม้มี MT5 ตัวอื่น active อยู่
    """
    import win32con
    try:
        hmenu = win32gui.GetMenu(mt5_main_hwnd)
        if not hmenu:
            log(f"[{account_id[:8]}] No menu bar on hwnd={mt5_main_hwnd}")
            return False

        n_top = win32gui.GetMenuItemCount(hmenu)
        log(f"[{account_id[:8]}] Scanning menu bar ({n_top} items)...")

        for i in range(n_top):
            try:
                top_text = win32gui.GetMenuString(hmenu, i, win32con.MF_BYPOSITION)
            except Exception:
                top_text = f"[{i}]"

            hsubmenu = win32gui.GetSubMenu(hmenu, i)
            if not hsubmenu:
                continue

            n_sub = win32gui.GetMenuItemCount(hsubmenu)
            for j in range(n_sub):
                try:
                    sub_text = win32gui.GetMenuString(hsubmenu, j, win32con.MF_BYPOSITION)
                except Exception:
                    sub_text = ""

                if 'login' in sub_text.lower():
                    cmd_id = win32gui.GetMenuItemID(hsubmenu, j)
                    log(f"[{account_id[:8]}] Found '{sub_text}' (id={cmd_id}) in '{top_text}' menu")
                    win32gui.PostMessage(mt5_main_hwnd, win32con.WM_COMMAND, cmd_id, 0)
                    log(f"[{account_id[:8]}] ✅ Triggered Login via WM_COMMAND")
                    return True

        log(f"[{account_id[:8]}] ❌ Login menu item not found in any menu")
        return False
    except Exception as e:
        err(f"[{account_id[:8]}] _trigger_login_dialog error: {e}")
        return False


def _scan_pid_windows(terminal_pid: int) -> dict:
    """คืน dict ของ {title: hwnd} ทุก visible window ของ process นี้"""
    result = {}
    def cb(hwnd, _):
        try:
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            if pid == terminal_pid and win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if title:
                    result[title] = hwnd
        except Exception:
            pass
        return True
    win32gui.EnumWindows(cb, None)
    return result


def autologin_terminal(account: dict, terminal_pid: int, account_id: str) -> bool:
    """
    Phase 1 (ไม่ lock): รอ + dismiss LiveUpdate, ปิด "Open an Account",
                         trigger Login dialog ผ่าน File menu ถ้าจำเป็น
    Phase 2 (lock):     กรอก Login dialog ทีละตัวป้องกัน keyboard conflict
    """
    import win32con

    login    = str(account['login'])
    password = str(account.get('password', ''))
    server   = str(account['server'])

    log(f"[{account_id[:8]}] Watching terminal windows (PID={terminal_pid})...")

    login_hwnd        = None
    last_trigger_time = 0.0          # กันการ trigger Login ซ้ำถี่เกินไป
    deadline          = time.time() + 120   # รวม LiveUpdate + Open an Account + Login

    while time.time() < deadline:
        wins = _scan_pid_windows(terminal_pid)

        if wins:
            log(f"[{account_id[:8]}] Windows: {list(wins.keys())}")

        # ── 0. ตรวจว่า terminal auto-login สำเร็จแล้วหรือยัง ──
        # ถ้า window title มีเลข login อยู่ → MT5 เชื่อมต่อสำเร็จแล้ว ไม่ต้องเปิด dialog
        for title in wins:
            if login in title:
                log(f"[{account_id[:8]}] ✅ Terminal already logged in as {login} (detected in title)")
                return True

        # ── 1. Dismiss LiveUpdate popup ── (FindWindow โดยตรง ไม่ต้องกรอง PID)
        for lu_title in ('Welcome to LiveUpdate', 'LiveUpdate', 'MetaTrader 5 Update'):
            lu_hwnd = win32gui.FindWindow(None, lu_title)
            if lu_hwnd and win32gui.IsWindowVisible(lu_hwnd):
                try:
                    app2 = Application(backend='win32').connect(handle=lu_hwnd)
                    dlg2 = app2.window(handle=lu_hwnd)
                    dismissed = False
                    for btn in dlg2.children(class_name='Button'):
                        txt = btn.window_text()
                        if txt.lower() in ('later', 'nein', 'no', 'cancel', 'позже'):
                            btn.click()
                            log(f"[{account_id[:8]}] ✅ Dismissed LiveUpdate ('{txt}')")
                            dismissed = True
                            time.sleep(0.5)
                            break
                    if not dismissed:
                        win32gui.PostMessage(lu_hwnd, win32con.WM_CLOSE, 0, 0)
                        log(f"[{account_id[:8]}] ✅ Dismissed LiveUpdate (WM_CLOSE)")
                        time.sleep(0.5)
                except Exception as e:
                    log(f"[{account_id[:8]}] LiveUpdate dismiss error: {e}")

        # ── 2. ปิด "Open an Account" wizard ── (FindWindow โดยตรง ไม่ต้องกรอง PID)
        oa_hwnd = win32gui.FindWindow(None, "Open an Account")
        if oa_hwnd and win32gui.IsWindowVisible(oa_hwnd):
            try:
                # กด Cancel ก่อน (ดีกว่า WM_CLOSE เพราะ MT5 จะรู้ว่า user กด Cancel)
                app2 = Application(backend='win32').connect(handle=oa_hwnd)
                dlg2 = app2.window(handle=oa_hwnd)
                cancelled = False
                for btn in dlg2.children(class_name='Button'):
                    if btn.window_text().lower() in ('cancel', 'ยกเลิก', 'отмена'):
                        btn.click()
                        cancelled = True
                        break
                if not cancelled:
                    win32gui.PostMessage(oa_hwnd, win32con.WM_CLOSE, 0, 0)
                log(f"[{account_id[:8]}] ✅ Closed 'Open an Account' dialog")
                time.sleep(1.5)  # รอให้ MT5 main window active
                last_trigger_time = 0.0  # reset เพื่อ trigger Login ทันทีหลังปิด dialog
            except Exception as e:
                log(f"[{account_id[:8]}] Close 'Open an Account' error: {e}")

        # ── 3. ถ้าเจอ Login dialog แล้ว → ออก loop ──
        # scan อีกครั้งหลัง dismiss เพราะ wins อาจเก่าแล้ว
        wins = _scan_pid_windows(terminal_pid)
        if 'Login' in wins:
            login_hwnd = wins['Login']
            log(f"[{account_id[:8]}] Login dialog found hwnd={login_hwnd}")
            break

        # ── 4. ถ้า MT5 main window โผล่แล้วแต่ยังไม่มี Login → trigger Login dialog ──
        #      trigger ซ้ำได้ แต่เว้นระยะ 8 วินาที เพื่อให้ dialog มีเวลาปรากฏ
        mt5_main = None
        for title, hwnd in wins.items():
            cls = ''
            try:
                cls = win32gui.GetClassName(hwnd)
            except Exception:
                pass
            log(f"[{account_id[:8]}]   window: '{title}' class='{cls}' hwnd={hwnd}")
            if 'MetaQuotes' in cls or 'MetaTrader' in title:
                mt5_main = hwnd

        now = time.time()
        if mt5_main and 'Login' not in wins and (now - last_trigger_time) >= 8:
            log(f"[{account_id[:8]}] MT5 main found hwnd={mt5_main} — triggering Login dialog...")
            _trigger_login_dialog(mt5_main, account_id)
            last_trigger_time = now
            time.sleep(2)

        time.sleep(2)

    if not login_hwnd:
        err(f"[{account_id[:8]}] ❌ Login dialog not found after {int(time.time()-deadline+120)}s")
        return False

    # ── Phase 2: กรอก credentials ด้วย SendMessage (ไม่ต้อง focus) ──
    log(f"[{account_id[:8]}] Filling credentials ({login}@{server}) via SendMessage...")
    try:
        import win32api
        import win32con

        app = Application(backend='win32').connect(handle=login_hwnd)
        dlg = app.window(handle=login_hwnd)
        edits = dlg.children(class_name='Edit')
        log(f"[{account_id[:8]}] Edit fields: {len(edits)}")

        def fill(edit, value, label):
            """ส่ง WM_SETTEXT ตรงไปที่ HWND — ไม่ต้องการ focus"""
            hwnd = edit.handle
            win32api.SendMessage(hwnd, win32con.WM_SETTEXT, 0, value)
            time.sleep(0.1)
            log(f"[{account_id[:8]}]   ✅ {label}")

        if len(edits) >= 5:
            fill(edits[0], login,    'Login')
            fill(edits[1], password, 'Password')
            fill(edits[4], server,   'Server')
        elif len(edits) >= 2:
            fill(edits[0], login,    'Login')
            fill(edits[1], password, 'Password')
        else:
            err(f"[{account_id[:8]}] ❌ Not enough Edit fields ({len(edits)})")
            return False

        time.sleep(0.3)

        # ติ๊ก Save password + กด OK ด้วย PostMessage
        ok_clicked = False
        for btn in dlg.children(class_name='Button'):
            txt = btn.window_text()
            if 'save' in txt.lower():
                try:
                    win32api.SendMessage(btn.handle, win32con.BM_SETCHECK,
                                        win32con.BST_CHECKED, 0)
                except Exception:
                    pass
            if txt == 'OK':
                win32gui.PostMessage(btn.handle, win32con.BM_CLICK, 0, 0)
                ok_clicked = True
                log(f"[{account_id[:8]}] ✅ Login submitted ({login}@{server})")

        if not ok_clicked:
            # fallback: กด Enter บน dialog
            win32gui.PostMessage(login_hwnd, win32con.WM_KEYDOWN, win32con.VK_RETURN, 0)
            log(f"[{account_id[:8]}] ✅ Login submitted via VK_RETURN")

        return True

    except Exception as e:
        err(f"[{account_id[:8]}] ❌ autologin error: {e}")
        import traceback
        err(traceback.format_exc())
        return False

def wait_for_pipe(account_id: str, terminal_pid: int, mt5_login: str, timeout: int = 180) -> bool:
    """
    รอให้ MT5 terminal login สำเร็จ
    - วิธี 0: ตรวจ window title (เร็วที่สุด)
    - วิธี 1: ตรวจ named pipe ผ่าน PowerShell
    - วิธี 2: mt5.initialize() พร้อม mt5_lock
    """
    import psutil

    inst_hash = calc_mt5_hash(instance_dir(account_id))
    pipe_name = f"MetaQuotes-Server-{inst_hash}"
    log(f"[{account_id[:8]}] Waiting for pipe: {pipe_name}")

    deadline = time.time() + timeout
    while time.time() < deadline:

        # ตรวจว่า terminal ยังมีชีวิตอยู่
        try:
            psutil.Process(terminal_pid)
        except psutil.NoSuchProcess:
            err(f"[{account_id[:8]}] ❌ Terminal process died (PID={terminal_pid})")
            return False

        # วิธี 0: ตรวจจาก window title — "267806322 - Exness-MT5Real39:..." = logged in
        wins = _scan_pid_windows(terminal_pid)
        for title in wins:
            if mt5_login in title:
                log(f"[{account_id[:8]}] ✅ Terminal connected (title: {title[:60]})")
                time.sleep(2)
                return True

        # วิธี 1: ตรวจ named pipe โดยตรง
        try:
            r = subprocess.run(
                ['powershell', '-Command',
                 f'Test-Path "\\\\.\\pipe\\{pipe_name}"'],
                capture_output=True, text=True, timeout=5
            )
            if 'True' in r.stdout:
                log(f"[{account_id[:8]}] ✅ Pipe found: {pipe_name}")
                # รอให้ terminal login จริงๆ อีกนิด
                time.sleep(3)
                return True
        except Exception:
            pass

        # วิธี 2: ลอง mt5.initialize() ด้วย lock (ทำทีละคน)
        if mt5_lock.acquire(timeout=10):
            try:
                import MetaTrader5 as mt5
                exe = terminal_exe(account_id)
                if mt5.initialize(path=exe, timeout=5000):
                    info = mt5.account_info()
                    mt5.shutdown()
                    if info:
                        log(f"[{account_id[:8]}] ✅ MT5 connected (login={info.login})")
                        return True
                    mt5.shutdown()
            except Exception:
                pass
            finally:
                mt5_lock.release()

        time.sleep(5)

    return False

class _ProcessHandle:
    """
    Wrapper ที่ให้ interface เหมือน subprocess.Popen
    ใช้ wrap psutil.Process ของ terminal ที่รันอยู่แล้ว (ไม่ได้ start เอง)
    """
    def __init__(self, pid: int):
        import psutil as _psutil
        self.pid  = pid
        self._ps  = _psutil.Process(pid)

    def poll(self):
        try:
            if self._ps.is_running() and self._ps.status() != 'zombie':
                return None
            return 1
        except Exception:
            return 1

    def terminate(self):
        try:
            self._ps.terminate()
        except Exception:
            pass

    def wait(self, timeout=None):
        try:
            self._ps.wait(timeout=timeout)
        except Exception:
            pass


def find_running_terminal_pid(account_id: str) -> 'int | None':
    """
    ค้นหา PID ของ terminal64.exe ที่รันอยู่แล้วสำหรับ account นี้
    ใช้ตรวจสอบก่อน start ใหม่ เพื่อกัน duplicate terminal
    """
    import psutil
    target_exe = terminal_exe(account_id).lower()
    for proc in psutil.process_iter(['pid', 'exe']):
        try:
            exe = (proc.info.get('exe') or '').lower()
            if exe == target_exe:
                return proc.pid
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return None


def start_worker(account: dict) -> 'subprocess.Popen | None':
    acc_id   = str(account['_id'])
    login    = str(account['login'])
    password = str(account.get('password', ''))
    server   = str(account['server'])
    mt5_path = terminal_exe(acc_id)

    cmd = [
        PYTHON_EXE, '-u', WORKER_SCRIPT,
        '--account-id', acc_id,
        '--login',      login,
        '--password',   password,
        '--server',     server,
        '--api-url',    API_URL,
        '--secret-key', SECRET_KEY,
        '--mt5-path',   mt5_path,
        '--interval',   str(SYNC_INTERVAL),
    ]

    log(f"[{acc_id[:8]}] Spawning worker (login={login})")
    try:
        log_file = open(os.path.join(INSTANCES_DIR, f'{acc_id}_worker.log'), 'a', encoding='utf-8')
        proc = subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=log_file,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        log(f"[{acc_id[:8]}] Worker PID={proc.pid}")
        return proc
    except Exception as e:
        err(f"[{acc_id[:8]}] ❌ Failed to spawn worker: {e}")
        return None

def stop_account(account_id: str):
    state = running.pop(account_id, None)
    if not state:
        return

    worker   = state.get('worker')
    terminal = state.get('terminal')

    if worker and worker.poll() is None:
        log(f"[{account_id[:8]}] Stopping worker PID={worker.pid}")
        try:
            worker.terminate()
            worker.wait(timeout=5)
        except Exception as e:
            err(f"[{account_id[:8]}] Worker terminate error: {e}")

    if terminal and terminal.poll() is None:
        log(f"[{account_id[:8]}] Stopping terminal PID={terminal.pid}")
        try:
            terminal.terminate()
            terminal.wait(timeout=10)
        except Exception as e:
            err(f"[{account_id[:8]}] Terminal terminate error: {e}")

    log(f"[{account_id[:8]}] Stopped")


# ────────────────────────────────────────────────────────
# Account polling
# ────────────────────────────────────────────────────────
def fetch_accounts() -> list:
    try:
        r = requests.get(ACCOUNTS_URL, params={'secretKey': SECRET_KEY}, timeout=10)
        if r.status_code == 200:
            return r.json()
        err(f"fetch_accounts: HTTP {r.status_code}")
    except Exception as e:
        err(f"fetch_accounts error: {e}")
    return []

def setup_account_thread(account: dict):
    """
    รันใน thread แยก — setup account ตั้งแต่ต้นจนเปิด worker
    """
    acc_id = str(account['_id'])
    try:
        log(f"[{acc_id[:8]}] New account — setting up... (thread)")

        # 1. Create instance (copy MT5 exe folder)
        if not create_instance(acc_id):
            return

        # 2. Pre-bootstrap data dir: copy servers.dat + write common.ini
        try:
            data_dir = pre_bootstrap_instance_data(acc_id, account)
            log(f"[{acc_id[:8]}] Data dir ready: {data_dir}")
        except Exception as e:
            err(f"[{acc_id[:8]}] ❌ pre_bootstrap_instance_data failed: {e}")
            return

        # 3. Start terminal
        terminal_proc = start_terminal(acc_id)
        if terminal_proc is None:
            return

        # 4. Autologin via GUI (fill Login dialog)
        if not autologin_terminal(account, terminal_proc.pid, acc_id):
            err(f"[{acc_id[:8]}] Autologin failed — skipping")
            terminal_proc.terminate()
            return

        # 5. รอ IPC pipe (= terminal logged in สำเร็จ)
        log(f"[{acc_id[:8]}] Waiting for IPC pipe...")
        if not wait_for_pipe(acc_id, terminal_proc.pid, str(account['login']), timeout=120):
            err(f"[{acc_id[:8]}] IPC pipe timeout — skipping")
            terminal_proc.terminate()
            return

        # 6. Start worker
        time.sleep(3)
        worker_proc = start_worker(account)
        if worker_proc is None:
            terminal_proc.terminate()
            return

        with running_lock:
            running[acc_id] = {
                'worker':   worker_proc,
                'terminal': terminal_proc,
                'account':  account,
            }
        log(f"[{acc_id[:8]}] ✅ Account fully started")

    except Exception as e:
        err(f"[{acc_id[:8]}] ❌ setup_account_thread error: {e}")
    finally:
        with setting_up_lock:
            setting_up.discard(acc_id)


def sync_accounts(accounts: list):
    target_ids = {str(a['_id']) for a in accounts}

    # Stop accounts ที่ไม่อยู่ใน target
    with running_lock:
        to_stop = [acc_id for acc_id in running if acc_id not in target_ids]
    for acc_id in to_stop:
        log(f"[{acc_id[:8]}] Removed — shutting down")
        stop_account(acc_id)

    # Start / restart accounts
    for account in accounts:
        acc_id = str(account['_id'])

        with running_lock:
            already_running = acc_id in running
        with setting_up_lock:
            already_setting_up = acc_id in setting_up

        if not already_running and not already_setting_up:
            # ยังไม่ได้ start → spawn thread ใหม่
            with setting_up_lock:
                setting_up.add(acc_id)
            t = threading.Thread(
                target=setup_account_thread,
                args=(account,),
                name=f"setup-{acc_id[:8]}",
                daemon=True,
            )
            t.start()
            log(f"[{acc_id[:8]}] Setup thread spawned")

        elif already_running:
            # ตรวจ crash แล้ว restart
            with running_lock:
                state = running.get(acc_id)
            if not state:
                continue

            worker   = state['worker']
            terminal = state['terminal']

            if worker.poll() is not None:
                log(f"[{acc_id[:8]}] Worker crashed (exit={worker.returncode}) — restarting...")
                new_worker = start_worker(state['account'])
                if new_worker:
                    with running_lock:
                        state['worker'] = new_worker

            if terminal.poll() is not None:
                log(f"[{acc_id[:8]}] Terminal closed — restarting...")
                new_terminal = start_terminal(acc_id)
                if new_terminal:
                    with running_lock:
                        state['terminal'] = new_terminal
                    autologin_terminal(state['account'], new_terminal.pid, acc_id)
                    if wait_for_pipe(acc_id, new_terminal.pid, str(state['account']['login']), timeout=120):
                        worker.terminate()
                        new_worker = start_worker(state['account'])
                        if new_worker:
                            with running_lock:
                                state['worker'] = new_worker


# ────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────
if __name__ == '__main__':
    log("=" * 60)
    log("MT5 Controller starting")
    log(f"  API_URL       : {API_URL}")
    log(f"  MT5_BASE_DIR  : {MT5_BASE_DIR}")
    log(f"  MT5_BASE_HASH : {MT5_BASE_HASH}")
    log(f"  INSTANCES_DIR : {INSTANCES_DIR}")
    log(f"  PYTHON_EXE    : {PYTHON_EXE}")
    log(f"  WORKER_SCRIPT : {WORKER_SCRIPT}")
    log(f"  POLL_INTERVAL : {POLL_INTERVAL}s")
    log("=" * 60)

    os.makedirs(INSTANCES_DIR, exist_ok=True)

    while True:
        try:
            accounts = fetch_accounts()
            log(f"Fetched {len(accounts)} account(s)")
            sync_accounts(accounts)
        except KeyboardInterrupt:
            log("Shutting down...")
            for acc_id in list(running.keys()):
                stop_account(acc_id)
            sys.exit(0)
        except Exception as e:
            err(f"Unexpected error: {e}")

        time.sleep(POLL_INTERVAL)
