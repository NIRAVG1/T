import type Redis from 'ioredis';
import type { HotelOffer, HotelSnapshotMetadata } from '../domain/hotel.types';
import { normalizeHotelName } from '../domain/normalization';

const publishScript = `
local g = tonumber(ARGV[1]); local snapshot = ARGV[2]; local complete = ARGV[3]; local ttl = tonumber(ARGV[4])
local latest = tonumber(redis.call('HGET', KEYS[1], 'generation') or '-1')
if g > latest then redis.call('HSET', KEYS[1], 'generation', g, 'snapshotId', snapshot); redis.call('EXPIRE', KEYS[1], ttl) end
if complete == '1' then
 local latestComplete = tonumber(redis.call('HGET', KEYS[2], 'generation') or '-1')
 if g > latestComplete then redis.call('HSET', KEYS[2], 'generation', g, 'snapshotId', snapshot); redis.call('EXPIRE', KEYS[2], ttl) end
end
return 1`;
export class RedisHotelService {
 constructor(private readonly redis: Redis, private readonly ttlSeconds: number) {}
 private base(cityKey: string, snapshotId: string) { const root = `hotels:{${cityKey}}:snapshot:${snapshotId}`; return { root, prices: `${root}:prices`, data: `${root}:data`, meta: `${root}:meta` }; }
 async nextGeneration(cityKey: string): Promise<number> { return this.redis.incr(`hotels:{${cityKey}}:generation`); }
 async saveSnapshot(metadata: HotelSnapshotMetadata, hotels: HotelOffer[]): Promise<void> {
  const keys = this.base(metadata.city.replace(/\s+/g, '-').toLowerCase(), metadata.snapshotId);
  const normalized = hotels.map(h => [normalizeHotelName(h.name), JSON.stringify(h), String(h.price)] as const);
  const multi = this.redis.multi().del(keys.prices, keys.data, keys.meta);
  for (const [field, serialized, score] of normalized) multi.hset(keys.data, field, serialized).zadd(keys.prices, score, field);
  multi.hset(keys.meta, Object.fromEntries(Object.entries(metadata).map(([k,v]) => [k, String(v)])));
  multi.expire(keys.prices, this.ttlSeconds).expire(keys.data, this.ttlSeconds).expire(keys.meta, this.ttlSeconds);
  const result = await multi.exec();
  if (!result || result.some(([error]) => error)) throw new Error('Redis failed to persist snapshot atomically');
  await this.redis.eval(publishScript, 2, `hotels:{${metadata.city.replace(/\s+/g, '-').toLowerCase()}}:latest`, `hotels:{${metadata.city.replace(/\s+/g, '-').toLowerCase()}}:latest-complete`, String(metadata.generation), metadata.snapshotId, metadata.completeness === 'complete' ? '1' : '0', String(this.ttlSeconds));
 }
 async getHotels(cityKey: string, snapshotId: string, minPrice?: number, maxPrice?: number): Promise<HotelOffer[]> {
  const keys = this.base(cityKey, snapshotId);
  const fields = minPrice === undefined && maxPrice === undefined ? await this.redis.zrange(keys.prices, 0, -1) : await this.redis.zrangebyscore(keys.prices, minPrice ?? '-inf', maxPrice ?? '+inf');
  if (!fields.length) return [];
  const records = await this.redis.hmget(keys.data, ...fields);
  if (records.some(value => value === null)) throw new Error('Redis snapshot HASH and ZSET are inconsistent');
  return records.map(value => JSON.parse(value!) as HotelOffer);
 }
 async ping(): Promise<void> { await this.redis.ping(); }
}
