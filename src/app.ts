import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { env } from './config/env';
import { normalizeCity } from './domain/normalization';
import { validateSupplierHotels } from './domain/aggregation';
import { supplierAFixtures, supplierBFixtures } from './suppliers/fixtures';
import { createRedisClient } from './redis/redis.client';
import { RedisHotelService } from './services/redis.service';
import { TemporalService } from './services/temporal.service';

export async function probeSupplierEndpoint(url: string): Promise<void> {
 const response = await fetch(`${url}?city=unknown`, { signal: AbortSignal.timeout(1400) });
 if (!response.ok) throw new Error(`supplier returned HTTP ${response.status}`);
 let payload: unknown;
 try { payload = await response.json(); } catch { throw new Error('supplier returned malformed JSON'); }
 try { validateSupplierHotels(payload, 'unknown'); } catch (error) { throw new Error(`supplier validation failed: ${error instanceof Error ? error.message : String(error)}`); }
}

function errorTreeIncludes(value: unknown, pattern: RegExp, seen = new Set<object>()): boolean {
 if (typeof value === 'string') return pattern.test(value);
 if (!value || typeof value !== 'object' || seen.has(value)) return false;
 seen.add(value);
 const record = value as Record<string, unknown>;
 return ['name', 'message', 'type'].some(key => typeof record[key] === 'string' && pattern.test(record[key] as string))
  || ['cause', 'failure'].some(key => errorTreeIncludes(record[key], pattern, seen));
}

export function createApp(deps?: { redis?: RedisHotelService; temporal?: TemporalService }) {
 const app = express(); app.disable('x-powered-by'); app.use(express.json());
 const redisClient = deps?.redis ? undefined : createRedisClient();
 const redis = deps?.redis ?? new RedisHotelService(redisClient!, env.SNAPSHOT_TTL_SECONDS);
 const temporal = deps?.temporal ?? new TemporalService();
 app.use((req, res, next) => { res.locals.requestId = req.header('x-request-id')?.trim() || randomUUID(); res.setHeader('X-Request-Id', res.locals.requestId); next(); });
 const supplierRoute = (supplier: 'A'|'B') => (req: Request, res: Response) => {
  const city = normalizeCity(String(req.query.city ?? ''));
  if (!city || !/^[\p{L}\p{N}-]+$/u.test(city)) return res.status(400).json({ error: { code: 'INVALID_CITY', message: 'city is required and must contain letters, numbers, spaces or hyphens', requestId: res.locals.requestId } });
  const mode = env.NODE_ENV === 'production' ? 'normal' : supplier === 'A' ? env.MOCK_SUPPLIER_A_MODE : env.MOCK_SUPPLIER_B_MODE;
  if (mode === 'error') return res.status(500).json({ error: 'Simulated supplier failure' });
  if (mode === 'timeout') return setTimeout(() => { if (!res.headersSent) res.json([]); }, env.SUPPLIER_HTTP_TIMEOUT_MS + 1500);
  if (mode === 'malformed') { res.type('application/json'); return res.status(200).send('{invalid json'); }
  if (mode === 'empty') return res.json([]);
  return res.json((supplier === 'A' ? supplierAFixtures(city) : supplierBFixtures(city)));
 };
 app.get('/supplierA/hotels', supplierRoute('A')); app.get('/supplierB/hotels', supplierRoute('B'));
 app.get('/api/hotels', async (req: Request, res: Response, next: NextFunction) => {
  try {
   const cityRaw = typeof req.query.city === 'string' ? req.query.city : '';
   const city = normalizeCity(cityRaw); if (!city || !/^[\p{L}\p{N}-]+$/u.test(city)) return res.status(400).json({ error: { code: 'INVALID_CITY', message: 'city is required and must contain letters, numbers, spaces or hyphens', requestId: res.locals.requestId } });
   const parsePrice = (name: 'minPrice'|'maxPrice'): number|undefined => {
    const raw = req.query[name]; if (raw === undefined) return undefined;
    if (typeof raw !== 'string' || raw.trim() === '') throw Object.assign(new Error(`${name} must be a finite non-negative number`), { status: 400, code: 'INVALID_PRICE' });
    const n = Number(raw); if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error(`${name} must be a finite non-negative number`), { status: 400, code: 'INVALID_PRICE' }); return n;
   };
   const minPrice = parsePrice('minPrice'), maxPrice = parsePrice('maxPrice');
   if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) throw Object.assign(new Error('minPrice cannot exceed maxPrice'), { status: 400, code: 'INVALID_PRICE_RANGE' });
   let generation: number;
   try { generation = await redis.nextGeneration(city); } catch { throw Object.assign(new Error('Redis is unavailable'), { status: 503, code: 'REDIS_UNAVAILABLE' }); }
   const snapshotId = `${city}-${generation}`; const workflowId = `hotel-aggregation-${city}-${generation}`;
   res.setHeader('X-Workflow-Id', workflowId);
   let result;
   try { result = await temporal.startAndWait({ city, cityKey: city, generation, snapshotId }, workflowId); } catch (error) {
    const e = error as Error & {code?: string};
    if (e.code === 'WORKFLOW_TIMEOUT' || e.code === 'BOTH_SUPPLIERS_UNAVAILABLE') throw error;
    if (e.name === 'WorkflowFailedError' && errorTreeIncludes(e, /Redis|ECONN|connect/i)) throw Object.assign(new Error('Redis snapshot persistence failed'), { status: 503, code: 'REDIS_UNAVAILABLE' });
    if (e.name !== 'WorkflowFailedError') throw Object.assign(new Error('Temporal service is unavailable'), { status: 503, code: 'TEMPORAL_UNAVAILABLE' });
    throw error;
   }
   let hotels;
   try { hotels = await redis.getHotels(city, result.snapshotId, minPrice, maxPrice); } catch { throw Object.assign(new Error('Redis snapshot read failed'), { status: 503, code: 'REDIS_UNAVAILABLE' }); }
   res.setHeader('X-Data-Completeness', result.completeness); res.setHeader('X-Supplier-A-Status', result.supplierAStatus); res.setHeader('X-Supplier-B-Status', result.supplierBStatus); res.setHeader('X-Workflow-Id', workflowId);
   console.info(JSON.stringify({ level: 'info', requestId: res.locals.requestId, workflowId, city, supplierAStatus: result.supplierAStatus, supplierBStatus: result.supplierBStatus, completeness: result.completeness, hotelCount: hotels.length }));
   return res.json(hotels);
  } catch (error) { return next(error); }
 });
 app.get('/health/live', (_req, res) => res.status(200).json({ status: 'alive' }));
 const appStartedAt = Date.now();
 app.get('/health', async (_req, res) => {
  const probe = async (fn: () => Promise<unknown>): Promise<'healthy'|'unavailable'> => {
   let timeout: ReturnType<typeof setTimeout> | undefined;
   try { await Promise.race([fn(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('probe timeout')), 1500); })]); return 'healthy'; }
   catch { return 'unavailable'; } finally { if (timeout) clearTimeout(timeout); }
  };
  const [supplierA, supplierB, redisState, temporalState, workerState] = await Promise.all([probe(() => probeSupplierEndpoint(env.SUPPLIER_A_URL)), probe(() => probeSupplierEndpoint(env.SUPPLIER_B_URL)), probe(() => redis.ping()), probe(() => temporal.ping()), probe(async () => { if (await redisClient?.get('hotel-orchestrator:worker:heartbeat')) return; throw new Error('worker heartbeat missing'); })]);
  const critical = redisState === 'unavailable' || temporalState === 'unavailable'; const bothDown = supplierA === 'unavailable' && supplierB === 'unavailable';
  const workerStarting = workerState === 'unavailable' && Date.now() - appStartedAt < env.WORKER_STARTUP_GRACE_MS;
  const worker = workerState === 'healthy' ? 'healthy' : workerStarting ? 'starting' : 'unavailable';
  const unhealthy = critical || bothDown || worker === 'unavailable';
  const status = unhealthy ? 'unhealthy' : worker === 'starting' || supplierA === 'unavailable' || supplierB === 'unavailable' ? 'degraded' : 'healthy';
  res.status(unhealthy ? 503 : 200).json({ status, services: { supplierA, supplierB, redis: redisState, temporal: temporalState, worker } });
 });
 app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: res.locals.requestId } }));
 app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = error as Error & { status?: number; code?: string };
  const status = e.status ?? (e.code === 'WORKFLOW_TIMEOUT' ? 504 : e.code === 'BOTH_SUPPLIERS_UNAVAILABLE' || e.code === 'REDIS_UNAVAILABLE' || /Both hotel suppliers/.test(e.message) ? 503 : 500);
  console.error(JSON.stringify({ level: 'error', requestId: res.locals.requestId, message: e.message }));
  res.status(status).json({ error: { code: e.code === 'BOTH_SUPPLIERS_UNAVAILABLE' ? 'SUPPLIERS_UNAVAILABLE' : e.code ?? (status === 503 ? 'SERVICE_UNAVAILABLE' : status === 504 ? 'WORKFLOW_TIMEOUT' : 'INTERNAL_ERROR'), message: status === 500 ? 'An unexpected error occurred' : e.message, requestId: res.locals.requestId } });
 });
 return { app, close: async () => { await Promise.all([redisClient?.quit(), deps?.temporal ? Promise.resolve() : temporal.close()]); } };
}
