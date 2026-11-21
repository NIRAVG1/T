import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSupplierA } from '../../src/temporal/activities/supplier.activities';

afterEach(() => vi.unstubAllGlobals());
describe('supplier activity validation and HTTP failure classification', () => {
 const valid = [{hotelId:'a1',name:'Holtin',price:6000,city:'delhi',commissionPct:10}];
 it('accepts a valid response and preserves empty arrays as successful data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(valid),{status:200})).mockResolvedValueOnce(new Response('[]',{status:200})));
  expect(await fetchSupplierA('delhi')).toEqual(valid);
  expect(await fetchSupplierA('delhi')).toEqual([]);
 });
 it('rejects malformed JSON and invalid supplier records as non-retryable failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{bad',{status:200})).mockResolvedValueOnce(new Response(JSON.stringify([{...valid[0],price:-1}]),{status:200})));
  await expect(fetchSupplierA('delhi')).rejects.toThrow(/malformed JSON/);
  await expect(fetchSupplierA('delhi')).rejects.toThrow(/validation failed/);
 });
 it('classifies 4xx errors as permanent and 429/5xx as retryable activity errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(new Response('',{status:429})).mockResolvedValueOnce(new Response('',{status:503})));
  await expect(fetchSupplierA('delhi')).rejects.toThrow(/HTTP 404/);
  await expect(fetchSupplierA('delhi')).rejects.toThrow(/retryable HTTP 429/);
  await expect(fetchSupplierA('delhi')).rejects.toThrow(/retryable HTTP 503/);
 });
});
