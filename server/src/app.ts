import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { env } from './lib/env.js';
import { db } from './db/index.js';
import { notifications } from './db/schema.js';
import { me, requireAuth, requireRole } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { validate } from './middleware/validate.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { jobsRouter } from './modules/jobs/jobs.routes.js';
import { seekerRouter } from './modules/seeker/seeker.routes.js';
import { employerRouter } from './modules/employer/employer.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';

const notificationsRouter = Router();
notificationsRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, me(res).id)).orderBy(desc(notifications.createdAt)).limit(30);
  res.json({
    data: rows.map((n) => ({ id: n.id, kind: n.kind, text: n.text, link: n.link, read: Boolean(n.readAt), createdAt: n.createdAt.toISOString() })),
    unread: rows.filter((n) => !n.readAt).length,
  });
});
notificationsRouter.post('/read', validate(z.object({ id: z.number().int().positive().optional() })), async (_req, res) => {
  const id = res.locals.body.id as number | undefined;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, me(res).id), isNull(notifications.readAt), id ? eq(notifications.id, id) : undefined));
  res.status(204).end();
});

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()), credentials: true, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(pinoHttp({ autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', jobsRouter); // public search and job pages
  app.use('/api/me', requireAuth, requireRole('SEEKER'), seekerRouter);
  app.use('/api/employer', requireAuth, requireRole('EMPLOYER'), employerRouter);
  app.use('/api/admin', requireAuth, requireRole('ADMIN'), adminRouter);
  app.use('/api/notifications', requireAuth, notificationsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
