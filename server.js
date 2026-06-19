const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const selfsigned = require('selfsigned');
const { Server } = require('socket.io');

const app = express();
const port = process.env.PORT || 3000;
const certsDir = path.join(__dirname, 'certs');
const keyPath = path.join(certsDir, 'server-key.pem');
const certPath = path.join(certsDir, 'server.pem');

let cameraSocket = null;
let viewerSocket = null;

// Track multiple cameras and viewers
const cameras = {}; // cameraId -> { id, name }
const viewers = {}; // viewerId -> { id }
const messages = [];
const MESSAGE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_CHAT_MESSAGES = 200;

function createChatMessage(type, content, senderName, senderId, filename) {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    senderName: senderName || 'Anonymous',
    senderId,
    text: type === 'text' ? content : null,
    dataUrl: type === 'image' ? content : null,
    filename: filename || null,
    timestamp: now,
    expiresAt: now + MESSAGE_TTL
  };
}

function pruneMessages() {
  const now = Date.now();
  const kept = messages.filter((message) => message.expiresAt > now);
  if (kept.length !== messages.length) {
    messages.length = 0;
    messages.push(...kept);
    io.emit('chat-history', messages);
  }
}

setInterval(pruneMessages, 60 * 1000);

function ensureHttpsCertificates() {
  try {
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return true;
    }

    const localIp = getLocalIPAddress() || '127.0.0.1';
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const options = {
      keySize: 2048,
      days: 365,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true }
      ],
      altNames: [
        'localhost',
        '127.0.0.1',
        '::1',
        localIp
      ]
    };

    const pems = selfsigned.generate(attrs, options);
    fs.writeFileSync(keyPath, pems.private, 'utf8');
    fs.writeFileSync(certPath, pems.cert, 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to create HTTPS certificates:', err);
    return false;
  }
}

const isRender = !!process.env.RENDER_SERVICE_ID || !!process.env.RENDER_INTERNAL_HOSTNAME || process.env.NODE_ENV === 'production';
const hasHttpsCerts = !isRender && ensureHttpsCertificates();
const server = hasHttpsCerts
  ? https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app)
  : http.createServer(app);
const io = new Server(server);

const scheme = hasHttpsCerts ? 'https' : 'http';

app.set('trust proxy', true);

function broadcastCameras() {
  const list = Object.values(cameras).map((c) => ({ id: c.id, name: c.name || c.id }));
  io.emit('cameras', list);
}

app.use(express.static('public'));

app.get('/api/info', (req, res) => {
  const ip = getLocalIPAddress() || '127.0.0.1';
  const protocol = req.protocol || scheme;
  const host = req.get('host') || `localhost:${port}`;
  res.json({ ip, url: `${protocol}://${host}` });
});

app.get('/api/cameras', (req, res) => {
  const list = Object.values(cameras).map((c) => ({ id: c.id, name: c.name || c.id }));
  res.json(list);
});

function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

function broadcastStatus() {
  const status = {
    cameraConnected: !!cameraSocket,
    viewerConnected: !!viewerSocket
  };

  if (cameraSocket) cameraSocket.emit('status', status);
  if (viewerSocket) viewerSocket.emit('status', status);
}

io.on('connection', (socket) => {
  const role = socket.handshake.query.role;
  const name = socket.handshake.query.name || null;
  console.log(`[signal] ${role} connected: ${socket.id}`);

  socket.emit('chat-history', messages);

  if (role === 'camera') {
    // normalize name: ignore empty or literal 'null' strings
    const n = (typeof name === 'string' && name.trim() && name !== 'null') ? name.trim() : null;
    cameras[socket.id] = { id: socket.id, name: n };
    socket.emit('registered', { id: socket.id });
    broadcastCameras();
  }

  if (role === 'viewer') {
    viewers[socket.id] = { id: socket.id };
    // send initial camera list
    const list = Object.values(cameras).map((c) => ({ id: c.id, name: c.name || c.id }));
    socket.emit('cameras', list);
  }

  // Generic signaling forwarding: messages must include `to` to specify target socket id
  socket.on('offer', (message) => {
    const to = message.to;
    if (!to || !io.sockets.sockets.get(to)) {
      socket.emit('signaling-error', { message: 'Target peer not available.' });
      return;
    }
    console.log(`[signal] forwarding offer from ${socket.id} -> ${to}`);
    io.to(to).emit('offer', { from: socket.id, sdp: message.sdp });
  });

  socket.on('answer', (message) => {
    const to = message.to;
    if (!to || !io.sockets.sockets.get(to)) {
      socket.emit('signaling-error', { message: 'Target peer not available.' });
      return;
    }
    console.log(`[signal] forwarding answer from ${socket.id} -> ${to}`);
    io.to(to).emit('answer', { from: socket.id, sdp: message.sdp });
  });

  socket.on('candidate', (message) => {
    const to = message.to;
    if (!to || !io.sockets.sockets.get(to)) {
      socket.emit('signaling-error', { message: 'Target peer not available.' });
      return;
    }
    console.log(`[signal] forwarding candidate from ${socket.id} -> ${to}`);
    io.to(to).emit('candidate', { from: socket.id, candidate: message.candidate });
  });

  socket.on('get-cameras', () => {
    const list = Object.values(cameras).map((c) => ({ id: c.id, name: c.name || c.id }));
    socket.emit('cameras', list);
  });

  socket.on('chat-message', (payload) => {
    if (!payload || typeof payload.text !== 'string') return;
    const senderName = (typeof name === 'string' && name.trim() && name !== 'null') ? name.trim() : `${role}-${socket.id.slice(0, 6)}`;
    const message = createChatMessage('text', payload.text.trim(), senderName, socket.id);
    messages.push(message);
    if (messages.length > MAX_CHAT_MESSAGES) messages.shift();
    io.emit('chat-message', message);
  });

  socket.on('chat-photo', (payload) => {
    if (!payload || typeof payload.dataUrl !== 'string') return;
    const senderName = (typeof name === 'string' && name.trim() && name !== 'null') ? name.trim() : `${role}-${socket.id.slice(0, 6)}`;
    const message = createChatMessage('image', payload.dataUrl, senderName, socket.id, payload.filename);
    messages.push(message);
    if (messages.length > MAX_CHAT_MESSAGES) messages.shift();
    io.emit('chat-message', message);
  });

  socket.on('disconnect', () => {
    console.log(`[signal] ${role} disconnected: ${socket.id}`);
    if (role === 'camera') {
      delete cameras[socket.id];
      broadcastCameras();
      // notify viewers that camera disconnected
      io.emit('camera-disconnected', { id: socket.id });
    }
    if (role === 'viewer') {
      delete viewers[socket.id];
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  const ip = getLocalIPAddress() || '127.0.0.1';
  console.log(`Server running at ${scheme}://${ip}:${port}`);
  console.log('Open this URL from any device on the same network.');
  if (!hasHttpsCerts) {
    console.warn('HTTPS certificate files not found. Generate certs in the certs/ folder for secure local access.');
  }
});
