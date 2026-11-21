import { describe, expect, it } from 'vitest';
import { aggregateHotels, validateSupplierHotels } from '../../src/domain/aggregation';
import type { SupplierHotel } from '../../src/domain/hotel.types';
const make = (hotelId: string, name: string, price: number, commissionPct = 10): SupplierHotel => ({ hotelId, name, price, city: 'delhi', commissionPct });
describe('hotel aggregation', () => {
 it('chooses Supplier A when it has the cheaper offer and preserves A commission', () => {
  expect(aggregateHotels([make('a','Radison',5900,13)],[make('b','Radison',6200,12)])).toEqual([{name:'Radison',price:5900,supplier:'Supplier A',commissionPct:13}]);
 });
 it('chooses Supplier B when it has the cheaper offer and preserves B commission', () => {
  expect(aggregateHotels([make('a','Holtin',6000,10)],[make('b','Holtin',5340,20)])).toEqual([{name:'Holtin',price:5340,supplier:'Supplier B',commissionPct:20}]);
 });
 it('retains hotels unique to either supplier', () => {
  expect(aggregateHotels([make('a','Only A',1)],[make('b','Only B',2)])).toHaveLength(2);
 });
 it('prefers Supplier A on equal cross-supplier prices regardless of commission', () => {
  expect(aggregateHotels([make('a','Equal',400,1)],[make('b','Equal',400,99)])[0]).toMatchObject({supplier:'Supplier A',commissionPct:1});
 });
 it('chooses the cheapest same-supplier duplicate and breaks equal offers by hotel ID', () => {
  expect(aggregateHotels([make('z','Twin',15),make('b','Twin',10),make('a','Twin',10)],[])[0]).toMatchObject({price:10,name:'Twin'});
  expect(aggregateHotels([make('z','Twin',10),make('a','tWin',10)],[])[0].name).toBe('tWin');
 });
 it('deduplicates case, Unicode-normalized names, and whitespace', () => {
  const got = aggregateHotels([make('a','  Cafe\u0301   Inn ',12)],[make('b','CAFÉ Inn',11)]);
  expect(got).toHaveLength(1); expect(got[0]).toMatchObject({price:11,name:'CAFÉ Inn'});
 });
 it('rejects invalid prices, missing names, empty IDs, and out-of-range commissions', () => {
  expect(() => validateSupplierHotels([{...make('x','x',-1)}], 'delhi')).toThrow();
  expect(() => validateSupplierHotels([{...make('x','',1)}], 'delhi')).toThrow();
  expect(() => validateSupplierHotels([{...make('','x',1)}], 'delhi')).toThrow();
  expect(() => validateSupplierHotels([{...make('x','x',1,101)}], 'delhi')).toThrow();
 });
 it('rejects records from a different city', () => {
  expect(() => validateSupplierHotels([make('x','x',1)], 'mumbai')).toThrow();
 });
 it('supports empty supplier arrays and two empty suppliers', () => {
  expect(aggregateHotels([],[])).toEqual([]); expect(aggregateHotels([make('a','A',1)],[])).toHaveLength(1); expect(aggregateHotels([],[make('b','B',1)])).toHaveLength(1);
 });
 it('is deterministic across repeat aggregation', () => {
  const a=[make('a2','B',12),make('a1','A',4)], b=[make('b1','B',10)];
  expect(aggregateHotels(a,b)).toEqual(aggregateHotels(a,b));
 });
});
