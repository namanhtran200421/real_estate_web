export interface GuestReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  /** First day of the stay's checkout month, for month/year display without identifying the guest. */
  stayedAt: string;
}

export interface NewReview {
  rating: number;
  comment: string;
}
