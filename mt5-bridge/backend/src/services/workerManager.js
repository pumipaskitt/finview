const { spawn }  = require('child_process');
const path        = require('path');
const Account     = require('../models/Account');

// เก็บ process ที่รันอยู่  { accountId: ChildProcess }
const workers = new Map();

const PYTHON      = process.env.PYTHON_PATH  || 'python';
const WORKER_PATH = path.resolve(process.env.WORKER_PATH || '../python-worker/worker.py');
const API_URL     = `http://localhost:${process.env.PORT || 3000}`;
const SECRET_KEY  = process.env.SECRET_KEY;
const INTERVAL    = process.env.SYNC_INTERVAL || '5';

// ── Start worker สำหรับ 1 account ──────────────────────────────
const startWorker = async (account) => {
  const id = account._id.toString();

  if (workers.has(id)) {
    console.log(`[WorkerManager] Account ${id} already running`);
    return;
  }

  console.log(`[WorkerManager] Starting worker for ${account.name} (${account.login})`);

  const proc = spawn(PYTHON, [
    '-u', WORKER_PATH,
    '--account-id', id,
    '--login',      account.login,
    '--password',   account.password,
    '--server',     account.server,
    '--api-url',    API_URL,
    '--secret-key', SECRET_KEY,
    '--interval',   INTERVAL,
  ], {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });

  workers.set(id, proc);

  // Log output จาก Python
  proc.stdout.on('data', (d) => process.stdout.write(`[py:${account.login}] ${d}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[py:${account.login}] ERR: ${d}`));

  // Auto-restart ถ้า crash (สูงสุด 3 ครั้ง)
  let restartCount = 0;
  proc.on('close', async (code) => {
    workers.delete(id);
    console.log(`[WorkerManager] Worker ${account.login} exited (code ${code})`);

    const acc = await Account.findById(id);
    if (!acc || !acc.deployed) return;  // ถ้า undeploy แล้ว ไม่ restart

    if (restartCount < 3) {
      restartCount++;
      console.log(`[WorkerManager] Restarting ${account.login} (attempt ${restartCount})...`);
      setTimeout(() => startWorker(account), 5000);
    } else {
      await Account.findByIdAndUpdate(id, { status: 'error', errorMsg: 'Worker crashed 3 times' });
    }
  });

  await Account.findByIdAndUpdate(id, { deployed: true, status: 'connecting', errorMsg: '' });
};

// ── Stop worker ────────────────────────────────────────────────
const stopWorker = async (accountId) => {
  const id = accountId.toString();
  const proc = workers.get(id);

  if (proc) {
    proc.kill('SIGTERM');
    workers.delete(id);
    console.log(`[WorkerManager] Stopped worker ${id}`);
  }

  await Account.findByIdAndUpdate(id, { deployed: false, status: 'stopped' });
};

// ── Restart workers ที่ deployed=true ตอน server start ─────────
const restartDeployedWorkers = async () => {
  const accounts = await Account.find({ deployed: true });
  console.log(`[WorkerManager] Restarting ${accounts.length} deployed workers...`);
  for (const acc of accounts) {
    await startWorker(acc);
  }
};

// ── Status ─────────────────────────────────────────────────────
const isRunning = (accountId) => workers.has(accountId.toString());

const getRunningCount = () => workers.size;

module.exports = { startWorker, stopWorker, restartDeployedWorkers, isRunning, getRunningCount };
