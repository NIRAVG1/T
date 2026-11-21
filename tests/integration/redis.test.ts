import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { RedisHotelService } from '../../src/services/redis.service';
import type { HotelSnapshotMetadata } from '../../src/domain/hotel.types';
const enabled = process.env.REDIS_TEST === '1';
describe.skipIf(!enabled)('Redis snapshot integration (set REDIS_TEST=1 with Redis available)', () => {
 let client: Redis;
 let store: RedisHotelService;
 beforeAll(async () => { client = new Redis({ host: process.env.REDIS_HOST ?? '127.0.0.1', port: Number(process.env.REDIS_PORT ?? 6379), lazyConnect: true }); await client.connect(); await client.ping(); store = new RedisHotelService(client, 60); });
 afterAll(async () => { if (client?.status === 'ready') await client.quit(); });
 it('writes atomic versioned snapshots, filters inclusively in Redis and publishes monotonic pointers', async () => {
  const meta = (city: string, generation: number, complete: boolean, hotelCount: number): HotelSnapshotMetadata => ({snapshotId:`it-${generation}`,city,generation,createdAt:new Date().toISOString(),supplierAStatus:'healthy',supplierBStatus:complete?'healthy':'unavailable',completeness:complete?'complete':'partial',hotelCount});
  const hotels = [{name:'A',price:10,supplier:'Supplier A' as const,commissionPct:10},{name:'B',price:20,supplier:'Supplier B' as const,commissionPct:20}];
  await store.saveSnapshot(meta('redis-test',2,true,2),hotels);
  await store.saveSnapshot(meta('redis-test',2,true,2),hotels); // Activity retry must safely rewrite the same snapshot.
  await store.saveSnapshot(meta('redis-test',3,false,1),[hotels[0]]);
  await store.saveSnapshot(meta('redis-test',1,true,1),[{name:'Old',price:5,supplier:'Supplier A',commissionPct:1}]);
  await store.saveSnapshot(meta('redis-other',1,true,1),[{name:'Separate',price:10,supplier:'Supplier A',commissionPct:1}]);
  await store.saveSnapshot(meta('redis-empty',1,true,0),[]);
  expect(await store.getHotels('redis-test','it-2')).toEqual(hotels);
  expect(await store.getHotels('redis-test','it-2',10,10)).toEqual([hotels[0]]);
  expect(await store.getHotels('redis-test','it-2',15)).toEqual([hotels[1]]);
  expect(await store.getHotels('redis-test','it-2',undefined,10)).toEqual([hotels[0]]);
  expect(await store.getHotels('redis-empty','it-1')).toEqual([]);
  expect(await store.getHotels('redis-other','it-1')).toHaveLength(1);
  expect(await client.hget('hotels:{redis-test}:latest','snapshotId')).toBe('it-3');
  expect(await client.hget('hotels:{redis-test}:latest-complete','snapshotId')).toBe('it-2');
  expect(await client.ttl('hotels:{redis-test}:snapshot:it-2:data')).toBeGreaterThan(0);
  expect(await client.zcard('hotels:{redis-test}:snapshot:it-2:prices')).toBe(await client.hlen('hotels:{redis-test}:snapshot:it-2:data'));
  const cities=['redis-test','redis-other','redis-empty'];
  for (const city of cities) {
   for (const id of city === 'redis-test' ? ['it-1','it-2','it-3'] : ['it-1']) await client.del(`hotels:{${city}}:snapshot:${id}:prices`,`hotels:{${city}}:snapshot:${id}:data`,`hotels:{${city}}:snapshot:${id}:meta`);
   await client.del(`hotels:{${city}}:generation`,`hotels:{${city}}:latest`,`hotels:{${city}}:latest-complete`);
  }
 });
});
