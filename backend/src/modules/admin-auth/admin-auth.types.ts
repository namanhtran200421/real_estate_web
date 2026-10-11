/** The signed-in owner or staff member, as attached to each admin request. */
export interface AdminIdentity {
  id: string;
  email: string;
  name: string;
}

/** One signed-in device, as listed on the account page. */
export interface AdminSessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  /** The session making this request. */
  current: boolean;
}

export interface AdminSession {
  /** Bearer token; shown once at login and stored only as a hash. */
  token: string;
  expiresAt: string;
  admin: AdminIdentity;
}
