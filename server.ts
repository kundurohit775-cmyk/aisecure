import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import dotenv from 'dotenv';
import { initDatabase } from './server/db';
import { authRouter } from './server/routes/auth';
import { orgRouter } from './server/routes/org';
import { documentsRouter } from './server/routes/documents';
import { sharesRouter } from './server/routes/shares';
import { auditRouter } from './server/routes/audit';
import { notificationsRouter } from './server/routes/notifications';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Initialize Database Schema
initDatabase();

// Security Headers: configure Helmet for iframe compatibility in AI Studio preview
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false, // Allows applet preview in AI Studio iframe
    crossOriginEmbedderPolicy: false,
  })
);

// CORS locked to app origin
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Mount API Routes
app.use('/api/auth', authRouter);
app.use('/api/org', orgRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/notifications', notificationsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'HavenVault Enterprise Backend',
  });
});

async function startServer() {
  if (!isProd) {
    // Mount Vite dev server middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HavenVault Server] Running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[HavenVault Server Error]', err);
  process.exit(1);
});
