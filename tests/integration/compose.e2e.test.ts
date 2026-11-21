import { describe, expect, it } from 'vitest';
const enabled = process.env.RUN_COMPOSE_E2E === '1';
const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
async function get(path: string): Promise<Response> { return fetch(`${base}${path}`, { signal: AbortSignal.timeout(120_000) }); }
describe.skipIf(!enabled)('full Docker Compose E2E (real Express, Temporal worker/server and Redis)', () => {
 it('runs a real aggregation, returns expected offers and filters using the request snapshot', async () => {
  const allResponse = await get('/api/hotels?city=delhi');
  expect(allResponse.status).toBe(200);
  const all = await allResponse.json() as Array<{name:string;price:number;supplier:string;commissionPct:number}>;
  expect(all).toHaveLength(5);
  expect(all.find(h => h.name === 'Holtin')).toMatchObject({price:5340,supplier:'Supplier B',commissionPct:20});
  expect(all.find(h => h.name === 'Radison')).toMatchObject({price:5900,supplier:'Supplier A',commissionPct:13});
  expect(new Set(all.map(h => h.name.toLowerCase())).size).toBe(all.length);
  expect(allResponse.headers.get('x-workflow-id')).toMatch(/^hotel-aggregation-delhi-\d+$/);
  const filtered = await get('/api/hotels?city=delhi&minPrice=5000&maxPrice=7000');
  expect(filtered.status).toBe(200);
  const range = await filtered.json() as typeof all;
  expect(range.map(h=>h.price)).toEqual([5340,5900]);
  expect(filtered.headers.get('x-workflow-id')).not.toBe(allResponse.headers.get('x-workflow-id'));
 });
 it('runs concurrent Temporal executions and returns empty results for successful unknown-city suppliers', async () => {
  const [one,two,unknown] = await Promise.all([get('/api/hotels?city=delhi'),get('/api/hotels?city=delhi'),get('/api/hotels?city=mumbai')]);
  expect(one.status).toBe(200); expect(two.status).toBe(200); expect(one.headers.get('x-workflow-id')).not.toBe(two.headers.get('x-workflow-id'));
  expect(await unknown.json()).toEqual([]);
 });
 it('exercises health probes against all Compose dependencies', async () => {
  const response = await get('/health'); expect(response.status).toBe(200); expect((await response.json()).status).toBe('healthy');
 });
});
