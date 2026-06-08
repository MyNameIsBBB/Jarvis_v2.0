import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import apiRouter from './server/routes';
import { initWebSocketServer } from './server/ws';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json());

// Register API Routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Create HTTP Server
const server = http.createServer(app);

// Attach WebSocket Server
initWebSocketServer(server);

server.listen(port, () => {
  console.log(`[SERVER] Durable Agent Server running at http://localhost:${port}`);
});
