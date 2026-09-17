// The store has no sign-in, so identity is fixed data rather than a session.
// This shopper is the matching customer row in lib/db.

export interface Shopper {
  id: string;
  username: string;
  email: string;
}

export const DEMO_USER: Shopper = {
  id: "cust_01",
  username: "ada",
  email: "ada@example.com",
};
