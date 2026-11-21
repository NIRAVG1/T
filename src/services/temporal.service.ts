import { Connection, Client } from '@temporalio/client';
import { env } from '../config/env';
import type { HotelAggregationInput, WorkflowResult } from '../domain/hotel.types';
export class TemporalService {
 private clientPromise?: Promise<Client>;
 private client(): Promise<Client> { return this.clientPromise ??= Connection.connect({ address: env.TEMPORAL_ADDRESS, ...(env.TEMPORAL_API_KEY ? { apiKey: env.TEMPORAL_API_KEY, tls: true } : {}) }).then(connection => new Client({ connection, namespace: env.TEMPORAL_NAMESPACE })); }
 async startAndWait(input: HotelAggregationInput, workflowId: string): Promise<WorkflowResult> {
  const client = await this.client();
  const handle = await client.workflow.start('HotelAggregationWorkflow', { taskQueue: env.TEMPORAL_TASK_QUEUE, workflowId, args: [input], workflowExecutionTimeout: '2 minutes' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Workflow wait timed out; workflow continues in Temporal'), { code: 'WORKFLOW_TIMEOUT' })), env.TEMPORAL_WORKFLOW_TIMEOUT_MS); });
   return await Promise.race([handle.result() as Promise<WorkflowResult>, deadline]);
  } catch (error) {
   const causes: unknown[] = [error]; let current = error;
   while (current && typeof current === 'object' && 'cause' in current) { current = (current as {cause?: unknown}).cause; causes.push(current); }
   if (causes.some(cause => String(cause).includes('Both hotel suppliers are unavailable'))) throw Object.assign(new Error('Both hotel suppliers are unavailable'), { code: 'BOTH_SUPPLIERS_UNAVAILABLE' });
   throw error;
  } finally { if (timer) clearTimeout(timer); }
 }
 async ping(): Promise<void> { const client = await this.client(); await client.connection.ensureConnected(); }
 async close(): Promise<void> { const client = this.clientPromise ? await this.clientPromise : undefined; await client?.connection.close(); this.clientPromise = undefined; }
}
