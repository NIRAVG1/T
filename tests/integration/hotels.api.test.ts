import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import type { HotelOffer, WorkflowResult } from '../../src/domain/hotel.types';
const records: HotelOffer[] = [
 {name:'Holtin',price:5340,supplier:'Supplier B',commissionPct:20},
 {name:'Radison',price:5900,supplier:'Supplier A',commissionPct:13}
];
let generation = 0;
let supplierOutcome: 'complete'|'partial'|'both-fail' = 'complete';
let isolateConcurrentSnapshots = false;
let failSnapshotPersistence = false;
const snapshots = new Map<string, HotelOffer[]>();
const redis = {
 nextGeneration: async () => ++generation,
 getHotels: async (_city: string, snapshot: string, min?: number, max?: number) => (snapshots.get(snapshot) ?? records).filter(h => (min === undefined || h.price >= min) && (max === undefined || h.price <= max)),
 ping: async () => undefined
};
const temporal = {
 startAndWait: async (input: {city: string; generation: number; snapshotId: string}, _workflowId: string): Promise<WorkflowResult> => { if (supplierOutcome === 'both-fail') throw Object.assign(new Error('Both hotel suppliers are unavailable'), {code:'BOTH_SUPPLIERS_UNAVAILABLE'}); if (failSnapshotPersistence) throw Object.assign(new Error('Workflow execution failed'), {name:'WorkflowFailedError',cause:{name:'ApplicationFailure',message:'Activity task failed',cause:{name:'ActivityFailure',message:'saveHotelSnapshot failed',cause:{name:'Error',message:'Redis connection refused'}}}}); const resultRows = isolateConcurrentSnapshots ? [{...records[0], price: 5000 + input.generation}] : records; snapshots.set(input.snapshotId, resultRows); return {snapshotId:input.snapshotId,city:input.city,generation:input.generation,createdAt:new Date().toISOString(),supplierAStatus:supplierOutcome === 'partial'?'unavailable':'healthy',supplierBStatus:'healthy',completeness:supplierOutcome === 'partial'?'partial':'complete',hotelCount:resultRows.length}; },
 ping: async () => undefined
};
const instance = createApp({redis: redis as never, temporal: temporal as never});
afterAll(async () => instance.close());
describe('HTTP API behavior (mock workflow/Redis boundaries)', () => {
 it('provides a process-only liveness endpoint', async () => {
  const response = await request(instance.app).get('/health/live');
  expect(response.status).toBe(200); expect(response.body).toEqual({status:'alive'});
 });
 it('validates query errors and returns only the requested inclusive result range', async () => {
  for (const query of ['?city=delhi&minPrice=nope','?city=delhi&minPrice=NaN','?city=delhi&maxPrice=Infinity','?city=delhi&minPrice=-1','?city=delhi&minPrice=5&maxPrice=4','?city=']) {
   expect((await request(instance.app).get(`/api/hotels${query}`)).status).toBe(400);
  }
  const response = await request(instance.app).get('/api/hotels?city=delhi&minPrice=5340&maxPrice=5340');
  expect(response.status).toBe(200); expect(response.body).toEqual([records[0]]); expect(response.headers['x-data-completeness']).toBe('complete');
 });
 it('allocates unique executions concurrently and reads each exact request snapshot', async () => {
  isolateConcurrentSnapshots = true;
  const [one,two] = await Promise.all([request(instance.app).get('/api/hotels?city=delhi'),request(instance.app).get('/api/hotels?city=delhi')]);
  expect(one.status).toBe(200); expect(two.status).toBe(200);
  expect(one.headers['x-workflow-id']).not.toBe(two.headers['x-workflow-id']);
  const oneGeneration = Number(one.headers['x-workflow-id'].split('-').at(-1));
  const twoGeneration = Number(two.headers['x-workflow-id'].split('-').at(-1));
  expect(one.body[0].price).toBe(5000 + oneGeneration); expect(two.body[0].price).toBe(5000 + twoGeneration);
  isolateConcurrentSnapshots = false;
 });
 it('sets partial status headers and maps two supplier failures to HTTP 503', async () => {
  supplierOutcome = 'partial';
  const partial = await request(instance.app).get('/api/hotels?city=delhi');
  expect(partial.status).toBe(200); expect(partial.headers['x-data-completeness']).toBe('partial'); expect(partial.headers['x-supplier-a-status']).toBe('unavailable');
  supplierOutcome = 'both-fail';
  const failed = await request(instance.app).get('/api/hotels?city=delhi');
  expect(failed.status).toBe(503); expect(failed.body.error.code).toBe('SUPPLIERS_UNAVAILABLE');
  supplierOutcome = 'complete';
 });
 it('maps nested Temporal Redis activity failures to HTTP 503', async () => {
  failSnapshotPersistence = true;
  const response = await request(instance.app).get('/api/hotels?city=delhi');
  expect(response.status).toBe(503); expect(response.body.error.code).toBe('REDIS_UNAVAILABLE');
  failSnapshotPersistence = false;
 });
 it('serves deterministic supplier fixtures and an empty list for an unknown city', async () => {
  expect((await request(instance.app).get('/supplierA/hotels?city=delhi')).body).toHaveLength(4);
  expect((await request(instance.app).get('/supplierB/hotels?city=unknown')).body).toEqual([]);
 });
});
