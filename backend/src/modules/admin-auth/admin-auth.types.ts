/** The signed-in owner or staff member, as attached to each admin request. */
export interface AdminIdentity {
  id: string;
  email: string;
  name: string;
}

export interface AdminSession {
  /** Bearer token; shown once at login and stored only as a hash. */
  token: string;
  expiresAt: string;
  admin: AdminIdentity;
}
