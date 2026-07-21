export type ToiletKind = "gratuit" | "payant" | "commerce";
export type ToiletStatus = "pending" | "approved" | "rejected";

/**
 * Lean shape for the map/list sync — this is what gets sent for every toilet on every
 * load, so it only carries what's needed to draw a pin and apply filters. At
 * OSM-seeded scale (tens of thousands of rows) the difference between this and the
 * full detail shape is several MB of JSON, so keep new fields off this type unless
 * the map/filter logic actually needs them.
 */
export type ToiletPin = {
  id: number;
  lat: number;
  lng: number;
  kind: ToiletKind;
  status: ToiletStatus;
  /** Average of the 3 criteria (0 if no reviews yet). */
  score: number;
  reviewCount: number;
  /** true when created by the current user (visible even while pending). */
  mine?: boolean;
};

/** Full detail for a single toilet, fetched on demand when its detail panel opens. */
export type ToiletDetail = ToiletPin & {
  /** Null for OSM-seeded toilets with no name tag yet — see "complete this spot". */
  name: string | null;
  address: string | null;
  price: string | null;
  description: string | null;
  createdById: number | null;
  createdByPseudo: string | null;
  createdAt: string;
  avgP: number;
  avgC: number;
  avgE: number;
  photos: { id: number; url: string }[];
};

export type Review = {
  id: number;
  pseudo: string;
  proprete: number;
  confort: number;
  experience: number;
  comment: string | null;
  createdAt: string;
  mine?: boolean;
};

export type SessionUser = {
  id: number;
  pseudo: string;
  role: "user" | "admin";
  username: string;
};

export type AdminUserRow = {
  id: number;
  pseudo: string;
  username: string;
  role: string;
  status: string;
  createdAt: string;
  reviewCount: number;
};

export type AdminStats = {
  pending: number;
  approved: number;
  rejected: number;
  users: number;
  reviews: number;
};

/** Full review detail for moderation — unlike the public `Review`, no 5-item cap. */
export type AdminReview = {
  id: number;
  pseudo: string;
  proprete: number;
  confort: number;
  experience: number;
  comment: string | null;
  createdAt: string;
};

/**
 * An approved-or-pending toilet with something for an admin to review: a review, a
 * photo, or a name a user filled in via "complete this spot" (`nameSetById` set).
 */
export type AdminModeratableToilet = {
  id: number;
  name: string | null;
  /** Set when a user (not OSM data) supplied the name — eligible for an admin reset. */
  nameSetById: number | null;
  kind: ToiletKind;
  address: string | null;
  lat: number;
  lng: number;
  reviews: AdminReview[];
  photos: { id: number; url: string }[];
};
