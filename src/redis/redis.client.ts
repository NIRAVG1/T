import Redis from 'ioredis';
import { env } from '../config/env';
export function createRedisClient(): Redis {
 const options = { lazyConnect: false, maxRetriesPerRequest: 2, enableReadyCheck: true };
 return env.REDIS_URL ? new Redis(env.REDIS_URL, options) : new Redis({ ...options, host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD || undefined });
}
