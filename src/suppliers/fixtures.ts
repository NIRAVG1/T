import type { SupplierHotel } from '../domain/hotel.types';
const a: SupplierHotel[] = [
 {hotelId:'a1',name:'Holtin',price:6000,city:'delhi',commissionPct:10}, {hotelId:'a2',name:'Radison',price:5900,city:'delhi',commissionPct:13}, {hotelId:'a3',name:'Taj Palace',price:8500,city:'delhi',commissionPct:15}, {hotelId:'a4',name:'City Inn',price:4200,city:'delhi',commissionPct:8}
];
const b: SupplierHotel[] = [
 {hotelId:'b1',name:'Holtin',price:5340,city:'delhi',commissionPct:20}, {hotelId:'b2',name:'Radison',price:6200,city:'delhi',commissionPct:12}, {hotelId:'b3',name:'The Imperial',price:9500,city:'delhi',commissionPct:18}, {hotelId:'b4',name:'City Inn',price:4500,city:'delhi',commissionPct:11}
];
export const supplierAFixtures = (city: string): SupplierHotel[] => a.filter(h => h.city === city);
export const supplierBFixtures = (city: string): SupplierHotel[] => b.filter(h => h.city === city);
