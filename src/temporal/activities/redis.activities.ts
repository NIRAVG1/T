import type { HotelOffer, HotelSnapshotMetadata } from '../../domain/hotel.types';
import { env } from '../../config/env';
import { createRedisClient } from '../../redis/redis.client';
import { RedisHotelService } from '../../services/redis.service';
const redis = createRedisClient();
const service = new RedisHotelService(redis, env.SNAPSHOT_TTL_SECONDS);
const heartbeatKey = 'hotel-orchestrator:worker:heartbeat';
let closePromise: Promise<'OK'> | undefined;
export async function closeRedisActivities(): Promise<void> { closePromise ??= redis.quit(); await closePromise; }
export async function saveHotelSnapshot(metadata: HotelSnapshotMetadata, hotels: HotelOffer[]): Promise<void> { await service.saveSnapshot(metadata, hotels); }
export async function publishWorkerHeartbeat(token: string): Promise<void> { await redis.set(heartbeatKey, token, 'EX', 35); }
export async function clearWorkerHeartbeat(token: string): Promise<void> {
 await redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", 1, heartbeatKey, token);
}
