import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import type { HotelAggregationInput, HotelOffer, HotelSnapshotMetadata, SupplierHotel, WorkflowResult } from '../../domain/hotel.types';
import { aggregateHotels } from '../../domain/aggregation';
interface Activities { fetchSupplierA(city: string): Promise<SupplierHotel[]>; fetchSupplierB(city: string): Promise<SupplierHotel[]>; saveHotelSnapshot(metadata: HotelSnapshotMetadata, hotels: HotelOffer[]): Promise<void> }
const { fetchSupplierA, fetchSupplierB, saveHotelSnapshot } = proxyActivities<Activities>({ startToCloseTimeout: '5 seconds', retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '5 seconds', maximumAttempts: 3, nonRetryableErrorTypes: ['InvalidSupplierResponse','PermanentSupplierError'] } });
export async function HotelAggregationWorkflow(input: HotelAggregationInput): Promise<WorkflowResult> {
 const outcomes = await Promise.allSettled([fetchSupplierA(input.city), fetchSupplierB(input.city)]);
 const a = outcomes[0], b = outcomes[1];
 if (a.status === 'rejected' && b.status === 'rejected') throw ApplicationFailure.nonRetryable('Both hotel suppliers are unavailable', 'BOTH_SUPPLIERS_UNAVAILABLE');
 const hotels = aggregateHotels(a.status === 'fulfilled' ? a.value : [], b.status === 'fulfilled' ? b.value : []);
 const metadata: HotelSnapshotMetadata = { snapshotId: input.snapshotId, city: input.city, generation: input.generation, createdAt: new Date().toISOString(), supplierAStatus: a.status === 'fulfilled' ? 'healthy' : 'unavailable', supplierBStatus: b.status === 'fulfilled' ? 'healthy' : 'unavailable', completeness: a.status === 'fulfilled' && b.status === 'fulfilled' ? 'complete' : 'partial', hotelCount: hotels.length };
 await saveHotelSnapshot(metadata, hotels);
 return metadata;
}
