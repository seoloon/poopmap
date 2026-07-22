export type ToiletKind = "gratuit" | "payant" | "commerce";
export type ToiletStatus = "pending" | "approved" | "rejected" | "hidden" | "deleted";

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
  /** The current user's own most recent completion submission on this spot, if any. */
  myCompletionStatus?: "pending" | "approved" | "rejected";
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

export type Role = "user" | "moderator" | "admin";

export type SessionUser = {
  id: number;
  pseudo: string;
  role: Role;
  username: string;
};

export type AdminUserRow = {
  id: number;
  pseudo: string;
  username: string;
  role: Role;
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
  completions: number;
  reports: number;
};

/**
 * A toilet carrying published photos and/or a user-supplied name (`nameSetById` set)
 * — surfaced so an admin can still delete a stray photo or reset a name after the
 * fact, even though new submissions now flow through the reviews/completions queues.
 */
export type AdminModeratableToilet = {
  id: number;
  name: string | null;
  /** Set when a user (not OSM data) supplied the name — eligible for an admin reset. */
  nameSetById: number | null;
  kind: ToiletKind;
  address: string | null;
  photos: { id: number; url: string }[];
};

/** A published (or rejected) review, flattened with its toilet for the "Avis" tab. */
export type AdminReviewRow = {
  id: number;
  toiletId: number;
  toiletName: string | null;
  pseudo: string;
  proprete: number;
  confort: number;
  experience: number;
  comment: string | null;
  status: "published" | "rejected";
  createdAt: string;
};

/** A "compléter ce spot" submission awaiting (or past) moderation. */
export type AdminCompletion = {
  id: number;
  toiletId: number;
  toiletName: string | null;
  userPseudo: string;
  name: string | null;
  address: string | null;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  photos: { id: number; url: string }[];
};

export type NotificationKind = "toilet" | "review" | "completion" | "report";
export type NotificationOutcome = "approved" | "rejected" | "partial";

/** A moderation-outcome notification — message/details are server-generated. */
export type AppNotification = {
  id: number;
  type: NotificationKind;
  /** A toilet id — "voir" always means "show this spot on the map". */
  referenceId: number;
  status: NotificationOutcome;
  message: string;
  details: { keptFields?: string[]; rejectedFields?: string[]; comment?: string } | null;
  read: boolean;
  createdAt: string;
};

export type ReportCategory = "closed" | "not_existing" | "wrong_info" | "inappropriate" | "unsafe" | "other";

/** Shared between the report modal (client) and the submit route (server-side validation). */
export const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: "closed", label: "🚫 Toilette fermée" },
  { value: "not_existing", label: "👻 N'existe pas / introuvable" },
  { value: "wrong_info", label: "❌ Informations incorrectes" },
  { value: "inappropriate", label: "🔞 Photos/contenu inapproprié" },
  { value: "unsafe", label: "⚠️ Insalubre / dangereux" },
  { value: "other", label: "💬 Autre" },
];

/** A single report within a stack — one card per toilet groups these in the admin UI. */
export type AdminReport = {
  id: number;
  userPseudo: string;
  category: ReportCategory;
  description: string | null;
  createdAt: string;
};

/** All pending reports against one toilet, grouped — see the `Report` model's doc comment. */
export type AdminReportGroup = {
  toiletId: number;
  toiletName: string | null;
  reports: AdminReport[];
};
