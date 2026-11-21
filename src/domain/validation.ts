import { z } from 'zod';
export const supplierHotelSchema = z.object({
  hotelId: z.string().trim().min(1), name: z.string().trim().min(1),
  price: z.number().finite().nonnegative(), city: z.string().trim().min(1),
  commissionPct: z.number().finite().min(0).max(100)
});
export const supplierResponseSchema = z.array(supplierHotelSchema);
