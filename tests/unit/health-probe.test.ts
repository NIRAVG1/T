import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeSupplierEndpoint } from '../../src/app';
afterEach(() => vi.unstubAllGlobals());
describe('supplier health probe', () => {
 it('accepts a valid empty response but rejects malformed or schema-invalid HTTP 200 responses', async () => {
  const fetchMock = vi.fn()
   .mockResolvedValueOnce(new Response('[]',{status:200}))
   .mockResolvedValueOnce(new Response('{broken',{status:200}))
   .mockResolvedValueOnce(new Response(JSON.stringify([{hotelId:'x',name:'x',price:-1,city:'unknown',commissionPct:10}]),{status:200}));
  vi.stubGlobal('fetch', fetchMock);
  await expect(probeSupplierEndpoint('http://supplier/hotels')).resolves.toBeUndefined();
  await expect(probeSupplierEndpoint('http://supplier/hotels')).rejects.toThrow(/malformed JSON/);
  await expect(probeSupplierEndpoint('http://supplier/hotels')).rejects.toThrow(/validation failed|Invalid/);
 });
});
