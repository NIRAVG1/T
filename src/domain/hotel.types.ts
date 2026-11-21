export type SupplierName = 'Supplier A' | 'Supplier B';
export interface SupplierHotel { hotelId: string; name: string; price: number; city: string; commissionPct: number }
export interface HotelOffer { name: string; price: number; supplier: SupplierName; commissionPct: number }
export interface HotelAggregationInput { city: string; cityKey: string; generation: number; snapshotId: string }
export interface SupplierFetchResult { supplier: SupplierName; hotels: SupplierHotel[] }
export interface HotelSnapshotMetadata { snapshotId: string; city: string; generation: number; createdAt: string; supplierAStatus: 'healthy'|'unavailable'; supplierBStatus: 'healthy'|'unavailable'; completeness: 'complete'|'partial'; hotelCount: number }
export interface WorkflowResult extends HotelSnapshotMetadata {}
export interface ApiErrorResponse { error: { code: string; message: string; requestId: string } }
