import { z } from 'zod';
const schema = z.object({
 NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().positive().default(3000),
 REDIS_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()), REDIS_HOST: z.string().default('localhost'), REDIS_PORT: z.coerce.number().int().positive().default(6379), REDIS_PASSWORD: z.string().optional(),
 SNAPSHOT_TTL_SECONDS: z.coerce.number().int().positive().default(1800), TEMPORAL_ADDRESS: z.string().default('localhost:7233'), TEMPORAL_NAMESPACE: z.string().default('default'), TEMPORAL_TASK_QUEUE: z.string().default('HOTEL_AGGREGATION_QUEUE'), TEMPORAL_WORKFLOW_TIMEOUT_MS: z.coerce.number().positive().default(30000),
 SUPPLIER_API_BASE_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()),
 SUPPLIER_API_HOSTPORT: z.preprocess(value => value === '' ? undefined : value, z.string().optional()),
 SUPPLIER_A_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()), SUPPLIER_B_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()), SUPPLIER_HTTP_TIMEOUT_MS: z.coerce.number().positive().default(3000),
 TEMPORAL_API_KEY: z.string().optional(), WORKER_STARTUP_GRACE_MS: z.coerce.number().int().nonnegative().default(60000),
 MOCK_SUPPLIER_A_MODE: z.enum(['normal','error','timeout','malformed','empty']).default('normal'), MOCK_SUPPLIER_B_MODE: z.enum(['normal','error','timeout','malformed','empty']).default('normal')
});
const parsedEnv = schema.parse(process.env);
const vercelHost = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
const supplierBase = (parsedEnv.SUPPLIER_API_BASE_URL ?? vercelHost ?? (parsedEnv.SUPPLIER_API_HOSTPORT ? `http://${parsedEnv.SUPPLIER_API_HOSTPORT}` : 'http://localhost:3000')).replace(/\/$/, '');
export const env = {
 ...parsedEnv,
 SUPPLIER_A_URL: parsedEnv.SUPPLIER_A_URL ?? `${supplierBase}/supplierA/hotels`,
 SUPPLIER_B_URL: parsedEnv.SUPPLIER_B_URL ?? `${supplierBase}/supplierB/hotels`
};
