require('dotenv').config();
const http       = require('http');
const express    = require('express');
const cors       = require('cors');
const connectDB  = require('./config/database');
const { initWS } = require('./services/wsServer');
// workerManager ใช้เฉพาะบน Windows (MT5 bridge)
// บน Linux VPS worker รันอิสระบน Windows VPS
const IS_LINUX = process.platform === 'linux';
const { restartDeployedWorkers } = IS_LINUX
  ? { restartDeployedWorkers: async () => console.log('ℹ️  Linux mode: worker manager disabled') }
  : require('./services/workerManager');

const app    = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/stats',    require('./routes/stats'));
app.use('/api/friends',  require('./routes/friends'));
app.use('/auth',         require('./routes/auth'));
app.use('/internal',     require('./routes/internal'));
app.get('/health', (_, res) => res.json({ ok: true, time: new Date() }));

const PORT = process.env.PORT || 3000;

(async () => {
  await connectDB();
  initWS(server);

  server.listen(PORT, async () => {
    console.log(`\n🚀 MT5 Bridge Server — http://localhost:${PORT}`);
    console.log(`\n📡 User API:`);
    console.log(`   POST   /auth/login              { username, password }`);
    console.log(`   POST   /auth/register           { username, password, accountId }`);
    console.log(`   GET    /api/stats               (JWT required)`);
    console.log(`\n📡 Admin API:`);
    console.log(`   GET    /api/accounts`);
    console.log(`   POST   /api/accounts`);
    console.log(`   POST   /api/accounts/:id/deploy`);
    console.log(`   POST   /api/accounts/:id/undeploy`);
    console.log(`   DELETE /api/accounts/:id\n`);

    await restartDeployedWorkers();
  });
})();
