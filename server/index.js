import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORT } from './config.js';
import { initDb } from './db.js';
import { logger } from './utils/logger.js';
import { setupSocketHandler } from './socket/socketHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialize database
initDb();

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Join room URL handler - serve game page
app.get('/join/:code', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Set up socket handlers
setupSocketHandler(io);

httpServer.listen(PORT, () => {
  logger.info(`UNO server running on port ${PORT}`);
});

export { app, httpServer, io };
