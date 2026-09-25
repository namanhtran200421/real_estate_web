export interface Photo {
  src: string;
  alt: string;
}

export interface LongStayDiscount {
  nights: number;
  percent: number;
}

/** All amounts in VND. */
export interface Pricing {
  weekday: number; // Mon–Thu, per night
  weekend: number; // Fri–Sun, per night
  holiday: number; // per night
  weekly: number;
  monthly: number;
  longStayDiscounts: LongStayDiscount[];
}

export interface NearbyPlace {
  place: string;
  distance: string;
}

export interface Apartment {
  id: string;
  slug: string;
  name: string;
  area: string;
  address: string;
  /** Search query used for the embedded map. */
  mapQuery: string;
  /** One-line pitch shown on cards. */
  tagline: string;
  description: string[];
  /** Ordered as the owner arranges them; the first photo is the cover. */
  photos: Photo[];
  guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  keyFacilities: string[];
  facilities: string[];
  checkIn: string;
  checkOut: string;
  rules: string[];
  pricing: Pricing;
  /** ISO dates (yyyy-mm-dd) that are booked or blocked. */
  unavailableDates: string[];
  nearby: NearbyPlace[];
}
