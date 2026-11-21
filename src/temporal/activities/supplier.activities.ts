import { ApplicationFailure } from '@temporalio/activity';
import type { SupplierHotel } from '../../domain/hotel.types';
import { validateSupplierHotels } from '../../domain/aggregation';
import { env } from '../../config/env';
async function fetchSupplier(url: string, city: string, supplier: string): Promise<SupplierHotel[]> {
 const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), env.SUPPLIER_HTTP_TIMEOUT_MS);
 try {
  const response = await fetch(`${url}?city=${encodeURIComponent(city)}`, { signal: controller.signal });
  if (response.status === 429 || response.status >= 500) throw new Error(`${supplier} returned retryable HTTP ${response.status}`);
  if (!response.ok) throw ApplicationFailure.nonRetryable(`${supplier} returned HTTP ${response.status}`, 'PermanentSupplierError');
  let payload: unknown; try { payload = await response.json(); } catch { throw ApplicationFailure.nonRetryable(`${supplier} returned malformed JSON`, 'InvalidSupplierResponse'); }
  try { return validateSupplierHotels(payload, city); } catch (error) { throw ApplicationFailure.nonRetryable(`${supplier} response validation failed: ${error instanceof Error ? error.message : String(error)}`, 'InvalidSupplierResponse'); }
 } finally { clearTimeout(timer); }
}
export const fetchSupplierA = (city: string): Promise<SupplierHotel[]> => fetchSupplier(env.SUPPLIER_A_URL, city, 'Supplier A');
export const fetchSupplierB = (city: string): Promise<SupplierHotel[]> => fetchSupplier(env.SUPPLIER_B_URL, city, 'Supplier B');
