import { createApp } from './app';
import { env } from './config/env';
const { app, close } = createApp();
const server = app.listen(env.PORT, '0.0.0.0', () => console.log(JSON.stringify({ level: 'info', message: 'Hotel Offer Orchestrator API listening', port: env.PORT })));
const shutdown = (): void => { server.close(() => { void close().finally(() => process.exit(0)); }); setTimeout(() => process.exit(1), 10000).unref(); };
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
