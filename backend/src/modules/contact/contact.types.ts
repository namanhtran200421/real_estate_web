export interface NewContactMessage {
  name: string;
  phone: string;
  email?: string;
  topic: string;
  apartmentSlug?: string;
  message: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  topic: string;
  apartmentName: string | null;
  message: string;
  handledAt: Date | null;
  createdAt: Date;
}
