/**
 * Apartment shapes returned by the API.
 *
 * `Apartment` mirrors `frontend/real-estate/src/app/models/apartment.ts` field for field, so the
 * Angular app uses API data without changing any component. All amounts are whole VND.
 */

export interface Photo {
  src: string;
  alt: string;
}

export interface LongStayDiscount {
  nights: number;
  percent: number;
}

export interface Pricing {
  weekday: number;
  weekend: number;
  holiday: number;
  weekly: number;
  monthly: number;
  longStayDiscounts: LongStayDiscount[];
}

export interface NearbyPlace {
  place: string;
  distance: string;
}

/** Everything the owner edits about an apartment. */
export interface ApartmentContent {
  slug: string;
  name: string;
  area: string;
  address: string;
  mapQuery: string;
  tagline: string;
  description: string[];
  photos: Photo[];
  guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  keyFacilities: string[];
  facilities: string[];
  /** Local time, "HH:MM". */
  checkIn: string;
  /** Local time, "HH:MM". */
  checkOut: string;
  rules: string[];
  pricing: Pricing;
  /** Share of the total a guest can pay upfront to secure the booking. */
  depositPercent: number;
  nearby: NearbyPlace[];
}

/** An apartment as stored, before its availability is attached. */
export interface ApartmentRecord extends ApartmentContent {
  id: string;
}

/** Public apartment, with the dates guests cannot book. */
export interface Apartment extends ApartmentRecord {
  /** ISO dates (yyyy-mm-dd) that are booked or blocked, from today onwards. */
  unavailableDates: string[];
}

/** Admin view and input: content plus publishing settings. */
export interface AdminApartment extends ApartmentRecord {
  isActive: boolean;
  sortOrder: number;
}

export interface ApartmentInput extends ApartmentContent {
  isActive: boolean;
  sortOrder: number;
}

export interface BlockedDate {
  date: string;
  reason: string | null;
}
