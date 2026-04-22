const { Server } = require('socket.io');

let io;

const initWS = (server) => {
  io = new Server(server, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    console.log('🔌 Socket.io client connected:', socket.id);
    socket.on('disconnect', () => console.log('🔌 Disconnected:', socket.id));
  });

  console.log('✅ Socket.io server ready');
};

const broadcast = (event, data) => {
  if (!io) return;
  io.emit(event, data);
};

module.exports = { initWS, broadcast };
