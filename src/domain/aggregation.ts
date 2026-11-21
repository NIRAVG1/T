import type { HotelOffer, SupplierHotel, SupplierName } from './hotel.types';
import { normalizeHotelName } from './normalization';
import { supplierResponseSchema } from './validation';
const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

export function validateSupplierHotels(payload: unknown, requestedCity: string): SupplierHotel[] {
  const parsed = supplierResponseSchema.parse(payload);
  const city = requestedCity.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  for (const hotel of parsed) {
    if (hotel.city.normalize('NFKC').trim().toLocaleLowerCase('en-US') !== city) throw new Error(`Supplier returned a hotel for an unexpected city: ${hotel.city}`);
  }
  return parsed;
}
export function aggregateHotels(a: SupplierHotel[], b: SupplierHotel[]): HotelOffer[] {
  const offers: Array<HotelOffer & { hotelId: string; normalizedName: string }> = [];
  const add = (records: SupplierHotel[], supplier: SupplierName): void => {
    for (const hotel of records) offers.push({ name: hotel.name.trim().normalize('NFKC').replace(/\s+/g, ' '), price: hotel.price, supplier, commissionPct: hotel.commissionPct, hotelId: hotel.hotelId, normalizedName: normalizeHotelName(hotel.name) });
  };
  add(a, 'Supplier A'); add(b, 'Supplier B');
  offers.sort((x, y) => compareText(x.normalizedName, y.normalizedName) || x.price - y.price || (x.supplier === y.supplier ? compareText(x.hotelId, y.hotelId) : x.supplier === 'Supplier A' ? -1 : 1));
  const chosen = new Map<string, HotelOffer>();
  for (const offer of offers) if (!chosen.has(offer.normalizedName)) chosen.set(offer.normalizedName, { name: offer.name, price: offer.price, supplier: offer.supplier, commissionPct: offer.commissionPct });
  return [...chosen.entries()].sort(([x], [y]) => compareText(x, y)).map(([, value]) => value);
}
