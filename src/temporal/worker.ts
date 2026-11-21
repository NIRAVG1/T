import { NativeConnection, Worker } from '@temporalio/worker';
import { randomUUID } from 'node:crypto';
import * as activities from './activities/supplier.activities';
import { clearWorkerHeartbeat, closeRedisActivities, publishWorkerHeartbeat, saveHotelSnapshot } from './activities/redis.activities';
import { env } from '../config/env';
async function run(): Promise<void> {
 const connection = await NativeConnection.connect({ address: env.TEMPORAL_ADDRESS, ...(env.TEMPORAL_API_KEY ? { apiKey: env.TEMPORAL_API_KEY, tls: true } : {}) });
 const worker = await Worker.create({ connection, namespace: env.TEMPORAL_NAMESPACE, taskQueue: env.TEMPORAL_TASK_QUEUE, workflowsPath: require.resolve('./workflows/hotel.workflow'), activities: { ...activities, saveHotelSnapshot } });
 const token = randomUUID();
 let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
 let shutdownPromise: Promise<void> | undefined;
 const shutdown = (): Promise<void> => shutdownPromise ??= (async () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  try { await worker.shutdown(); } finally {
   try { await clearWorkerHeartbeat(token); } catch (error) { console.error(JSON.stringify({ level: 'warn', message: 'Unable to clear worker heartbeat', error: String(error) })); }
   await connection.close(); await closeRedisActivities();
  }
 })();
 process.once('SIGINT', () => { void shutdown(); }); process.once('SIGTERM', () => { void shutdown(); });
 await publishWorkerHeartbeat(token);
 heartbeatTimer = setInterval(() => { void publishWorkerHeartbeat(token).catch(error => console.error(JSON.stringify({ level: 'error', message: 'Worker heartbeat update failed', error: String(error) }))); }, 10000);
 try { await worker.run(); } finally { await shutdown(); }
}
run().catch(async error => { console.error(JSON.stringify({ level: 'error', message: 'Temporal worker failed', error: String(error) })); try { await closeRedisActivities(); } catch { /* keep the original startup failure */ } process.exitCode = 1; });
