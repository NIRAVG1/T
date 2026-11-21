export const normalizeCity = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, '-');
export const normalizeHotelName = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
