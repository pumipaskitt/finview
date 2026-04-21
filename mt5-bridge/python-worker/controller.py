"""
MT5 Controller — รันบน Windows VPS
- Poll /internal/accounts ทุก POLL_INTERVAL วินาที
- พบ account ใหม่ → copy MT5 instance → login ผ่าน mt5.initialize() → spawn worker
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

APPDATA_DIR   = os.environ.get('APPDATA', r'C:\Users\Administrator\AppData\Roaming')

# Hash ของ MT5_BASE_DIR ใน MetaQuotes\Terminal\ (หาได้จาก origin.txt)
# รัน PowerShell:
#   Get-ChildItem "$env:APPDATA\MetaQuotes\Terminal" -Directory | ForEach-Object {
#     $o = Join-Path $_.FullName "origin.txt"
#     if (Test-Path $o) { "$($_.Name) -> $(Get-Content $o)" }
#   }
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

# mt5.initialize/shutdown ไม่ thread-safe — ใช้ lock ทุกครั้ง
mt5_lock = threading.Lock()

# tracks account IDs ที่กำลัง setup อยู่ (กัน duplicate threads)
setting_up: set = set()
setting_up_lock = threading.Lock()


# ────────────────────────────────────────────────────────
# MT5 Instance helpers
# ────────────────────────────────────────────────────────
def instance_dir(account_id: str) -> str:
    return os.path.join(INSTANCES_DIR, account_id)

def terminal_exe(account_id: str) -> str:
    return os.path.join(instance_dir(account_id), 'terminal64.exe')

def calc_mt5_hash(terminal_dir: str) -> str:
    """คำนวณ hash ของ MT5 data directory จาก terminal directory path"""
    return hashlib.md5(terminal_dir.upper().encode('utf-16-le')).hexdigest().upper()

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

def pre_bootstrap_instance_data(account_id: str, account: dict) -> str:
    """
    เตรียม data directory ของ instance ก่อน start terminal:
    - copy servers.dat และ certificates จาก working installation
    - เขียน common.ini พร้อม Login/Server
    ทำให้ terminal รู้จัก broker server ทันทีที่เปิด
    """
    inst_dir   = instance_dir(account_id)
    inst_hash  = calc_mt5_hash(inst_dir)
    data_dir   = os.path.join(APPDATA_DIR, 'MetaQuotes', 'Terminal', inst_hash)
    src_config = os.path.join(APPDATA_DIR, 'MetaQuotes', 'Terminal', MT5_BASE_HASH, 'config')
    dst_config = os.path.join(data_dir, 'config')

    log(f"[{account_id[:8]}] Instance hash : {inst_hash}")
    log(f"[{account_id[:8]}] Data dir      : {data_dir}")

    os.makedirs(dst_config, exist_ok=True)

    # Copy servers.dat — terminal จะรู้จัก server ของ broker
    src_srv = os.path.join(src_config, 'servers.dat')
    if os.path.exists(src_srv):
        shutil.copy2(src_srv, os.path.join(dst_config, 'servers.dat'))
        log(f"[{account_id[:8]}]   ✅ servers.dat copied")
    else:
        err(f"[{account_id[:8]}]   ❌ servers.dat not found at {src_srv}")

    # Copy certificates — ช่วยให้ terminal เชื่อมต่อ broker ได้เร็วขึ้น
    src_certs = os.path.join(src_config, 'certificates')
    dst_certs = os.path.join(dst_config, 'certificates')
    if os.path.exists(src_certs):
        if os.path.exists(dst_certs):
            shutil.rmtree(dst_certs)
        shutil.copytree(src_certs, dst_certs)
        log(f"[{account_id[:8]}]   ✅ certificates copied")

    # เขียน common.ini — terminal อ่าน Login/Server จากนี้ตอนเปิด
    common_ini = os.path.join(dst_config, 'common.ini')
    with open(common_ini, 'w', encoding='utf-8') as f:
        f.write(
            f'[Common]\n'
            f'Login={account["login"]}\n'
            f'Server={account["server"]}\n'
            f'NewsEnable=0\n'
        )
    log(f"[{account_id[:8]}]   ✅ common.ini written ({account['login']}@{account['server']})")

    # เขียน origin.txt (MT5 ใช้ track ว่า exe อยู่ที่ไหน)
    with open(os.path.join(data_dir, 'origin.txt'), 'w', encoding='utf-8') as f:
        f.write(inst_dir)

    return data_dir

def start_terminal(account_id: str) -> 'subprocess.Popen | None':
    """
    Start MT5 terminal แบบ minimized — ไม่มี dialog โผล่ขึ้นหน้าจอ
    Terminal อ่าน Login/Server จาก common.ini ที่เตรียมไว้แล้ว
    """
    exe = terminal_exe(account_id)
    if not os.path.exists(exe):
        err(f"[{account_id[:8]}] terminal64.exe not found: {exe}")
        return None

    # STARTUPINFO — บอก Windows ให้เปิด window แบบ minimized
    si = subprocess.STARTUPINFO()
    si.dwFlags  |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = 6   # SW_MINIMIZE

    log(f"[{account_id[:8]}] Starting terminal (minimized): {exe}")
    try:
        proc = subprocess.Popen(
            [exe],
            cwd=instance_dir(account_id),
            startupinfo=si,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        log(f"[{account_id[:8]}] Terminal PID={proc.pid}")
        return proc
    except Exception as e:
        err(f"[{account_id[:8]}] ❌ Failed to start terminal: {e}")
        return None


# ────────────────────────────────────────────────────────
# Login — program → program (ไม่ใช้ GUI เลย)
# ────────────────────────────────────────────────────────
def _scan_pid_windows(terminal_pid: int) -> dict:
    """คืน {title: hwnd} ของทุก visible window ของ process นี้"""
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


def login_terminal(account: dict, terminal_pid: int, account_id: str,
                   timeout: int = 120) -> bool:
    """
    Login MT5 terminal ผ่าน mt5.initialize() โดยตรง — ไม่มี GUI เลย

    Flow:
    1. ตรวจ window title ก่อน (terminal อาจ auto-login จาก certificate แล้ว)
    2. ถ้ายังไม่ได้ → mt5.initialize(path, login, password, server) ส่ง credentials
       ผ่าน IPC pipe โดยตรง — terminal login โดยไม่ต้องแสดง dialog ใดๆ
    3. retry ทุก 5 วินาที จนครบ timeout
    """
    import psutil
    import MetaTrader5 as mt5

    login_str = str(account['login'])
    password  = str(account.get('password', ''))
    server    = str(account['server'])
    exe       = terminal_exe(account_id)

    log(f"[{account_id[:8]}] Logging in: {login_str}@{server}")

    deadline = time.time() + timeout
    attempt  = 0

    while time.time() < deadline:
        attempt += 1

        # ── ตรวจว่า terminal ยังมีชีวิต ──
        try:
            psutil.Process(terminal_pid)
        except psutil.NoSuchProcess:
            err(f"[{account_id[:8]}] ❌ Terminal process died (PID={terminal_pid})")
            return False

        # ── ตรวจ window title (auto-login จาก certificate) ──
        wins = _scan_pid_windows(terminal_pid)
        if any(login_str in t for t in wins):
            log(f"[{account_id[:8]}] ✅ Auto-logged in (detected in title)")
            return True

        # ── ส่ง credentials ผ่าน mt5.initialize() IPC ──
        log(f"[{account_id[:8]}] Attempt {attempt}: mt5.initialize()...")
        if mt5_lock.acquire(timeout=15):
            try:
                ok = mt5.initialize(
                    path=exe,
                    login=int(login_str),
                    password=password,
                    server=server,
                    timeout=15000,
                )
                if ok:
                    info = mt5.account_info()
                    if info and str(info.login) == login_str:
                        log(f"[{account_id[:8]}] ✅ Logged in: {info.name} | bal={info.balance} {info.currency}")
                        mt5.shutdown()
                        return True
                    else:
                        log(f"[{account_id[:8]}] initialize() OK but account_info None — retrying")
                else:
                    log(f"[{account_id[:8]}] initialize() failed: {mt5.last_error()}")
                mt5.shutdown()
            except Exception as e:
                err(f"[{account_id[:8]}] mt5 error: {e}")
                try: mt5.shutdown()
                except: pass
            finally:
                mt5_lock.release()
        else:
            log(f"[{account_id[:8]}] mt5_lock timeout — will retry")

        time.sleep(5)

    err(f"[{account_id[:8]}] ❌ Login timeout after {timeout}s")
    return False


def wait_for_pipe(account_id: str, terminal_pid: int, mt5_login: str,
                  timeout: int = 60) -> bool:
    """
    ยืนยันว่า terminal login สำเร็จและ IPC pipe พร้อมใช้งาน
    ใช้หลังจาก login_terminal() สำเร็จแล้ว timeout สั้นลงได้
    - วิธี 0: window title (เร็วที่สุด)
    - วิธี 1: named pipe (PowerShell Test-Path)
    """
    import psutil

    inst_hash = calc_mt5_hash(instance_dir(account_id))
    pipe_name = f"MetaQuotes-Server-{inst_hash}"
    log(f"[{account_id[:8]}] Verifying pipe: {pipe_name}")

    deadline = time.time() + timeout
    while time.time() < deadline:

        try:
            psutil.Process(terminal_pid)
        except psutil.NoSuchProcess:
            err(f"[{account_id[:8]}] ❌ Terminal died while waiting for pipe")
            return False

        # วิธี 0: window title
        wins = _scan_pid_windows(terminal_pid)
        for title in wins:
            if mt5_login in title:
                log(f"[{account_id[:8]}] ✅ Pipe ready (title: {title[:60]})")
                return True

        # วิธี 1: named pipe
        try:
            r = subprocess.run(
                ['powershell', '-Command',
                 f'Test-Path "\\\\.\\pipe\\{pipe_name}"'],
                capture_output=True, text=True, timeout=5
            )
            if 'True' in r.stdout:
                log(f"[{account_id[:8]}] ✅ Pipe ready: {pipe_name}")
                return True
        except Exception:
            pass

        time.sleep(3)

    err(f"[{account_id[:8]}] ❌ Pipe not ready after {timeout}s")
    return False


# ────────────────────────────────────────────────────────
# Existing terminal detection (รองรับ controller restart)
# ────────────────────────────────────────────────────────
class _ProcessHandle:
    """Wrap psutil.Process ให้มี interface เหมือน subprocess.Popen"""
    def __init__(self, pid: int):
        import psutil as _psutil
        self.pid = pid
        self._ps = _psutil.Process(pid)

    def poll(self):
        try:
            return None if (self._ps.is_running() and self._ps.status() != 'zombie') else 1
        except Exception:
            return 1

    def terminate(self):
        try: self._ps.terminate()
        except Exception: pass

    def wait(self, timeout=None):
        try: self._ps.wait(timeout=timeout)
        except Exception: pass


def find_running_terminal_pid(account_id: str) -> 'int | None':
    """หา PID ของ terminal ที่รันอยู่แล้ว (กัน duplicate เมื่อ controller restart)"""
    import psutil
    target = terminal_exe(account_id).lower()
    for proc in psutil.process_iter(['pid', 'exe']):
        try:
            if (proc.info.get('exe') or '').lower() == target:
                return proc.pid
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return None


# ────────────────────────────────────────────────────────
# Worker
# ────────────────────────────────────────────────────────
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
        log_file = open(
            os.path.join(INSTANCES_DIR, f'{acc_id}_worker.log'), 'a', encoding='utf-8'
        )
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

    for name, proc in [('worker', state.get('worker')), ('terminal', state.get('terminal'))]:
        if proc and proc.poll() is None:
            log(f"[{account_id[:8]}] Stopping {name} PID={proc.pid}")
            try:
                proc.terminate()
                proc.wait(timeout=10)
            except Exception as e:
                err(f"[{account_id[:8]}] {name} terminate error: {e}")

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
    """รันใน daemon thread — setup account ตั้งแต่ต้นจนเปิด worker"""
    acc_id = str(account['_id'])
    try:
        log(f"[{acc_id[:8]}] ── Setting up account (thread) ──")

        # ── 1. สร้าง MT5 instance (copy exe folder) ──
        if not create_instance(acc_id):
            return

        # ── 2. เตรียม data dir (servers.dat + common.ini + certificates) ──
        try:
            data_dir = pre_bootstrap_instance_data(acc_id, account)
            log(f"[{acc_id[:8]}] Data dir ready: {data_dir}")
        except Exception as e:
            err(f"[{acc_id[:8]}] ❌ pre_bootstrap failed: {e}")
            return

        # ── 3. ตรวจว่ามี terminal รันอยู่แล้วหรือเปล่า (controller restart) ──
        existing_pid = find_running_terminal_pid(acc_id)
        if existing_pid:
            log(f"[{acc_id[:8]}] Found existing terminal PID={existing_pid} — reusing")
            terminal_proc = _ProcessHandle(existing_pid)
            # ถ้า logged in แล้ว ข้ามขั้นตอน login
            wins = _scan_pid_windows(existing_pid)
            already_logged_in = any(str(account['login']) in t for t in wins)
        else:
            # ── 4. Start terminal (minimized, ไม่มี dialog) ──
            terminal_proc = start_terminal(acc_id)
            if terminal_proc is None:
                return
            already_logged_in = False
            # รอให้ terminal initialize ก่อน login
            time.sleep(5)

        # ── 5. Login ผ่าน mt5.initialize() (program → program) ──
        if not already_logged_in:
            if not login_terminal(account, terminal_proc.pid, acc_id):
                err(f"[{acc_id[:8]}] ❌ Login failed — aborting")
                terminal_proc.terminate()
                return
        else:
            log(f"[{acc_id[:8]}] ✅ Already logged in — skip login step")

        # ── 6. ยืนยัน IPC pipe พร้อม ──
        if not wait_for_pipe(acc_id, terminal_proc.pid, str(account['login']), timeout=60):
            err(f"[{acc_id[:8]}] ❌ Pipe not ready — aborting")
            terminal_proc.terminate()
            return

        # ── 7. Start worker ──
        time.sleep(2)
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
        import traceback
        err(traceback.format_exc())
    finally:
        with setting_up_lock:
            setting_up.discard(acc_id)


def sync_accounts(accounts: list):
    target_ids = {str(a['_id']) for a in accounts}

    # หยุด accounts ที่ถูกลบออก
    with running_lock:
        to_stop = [aid for aid in running if aid not in target_ids]
    for aid in to_stop:
        log(f"[{aid[:8]}] Removed — shutting down")
        stop_account(aid)

    # Start / crash-recovery
    for account in accounts:
        acc_id = str(account['_id'])

        with running_lock:
            already_running = acc_id in running
        with setting_up_lock:
            already_setting_up = acc_id in setting_up

        if not already_running and not already_setting_up:
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
            with running_lock:
                state = running.get(acc_id)
            if not state:
                continue

            worker   = state['worker']
            terminal = state['terminal']

            # Worker crash → restart worker เท่านั้น
            if worker.poll() is not None:
                log(f"[{acc_id[:8]}] Worker crashed (exit={worker.returncode}) — restarting")
                new_worker = start_worker(state['account'])
                if new_worker:
                    with running_lock:
                        state['worker'] = new_worker

            # Terminal crash → restart terminal + login + worker
            if terminal.poll() is not None:
                log(f"[{acc_id[:8]}] Terminal closed — restarting")
                new_terminal = start_terminal(acc_id)
                if new_terminal:
                    with running_lock:
                        state['terminal'] = new_terminal
                    time.sleep(5)
                    if login_terminal(state['account'], new_terminal.pid, acc_id):
                        if wait_for_pipe(acc_id, new_terminal.pid,
                                         str(state['account']['login']), timeout=60):
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
            for aid in list(running.keys()):
                stop_account(aid)
            sys.exit(0)
        except Exception as e:
            err(f"Unexpected error: {e}")

        time.sleep(POLL_INTERVAL)
