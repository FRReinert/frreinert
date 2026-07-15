export interface Env {
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
  SITE_URL: string;
  ORDERS: KVNamespace;
  PHOTOS: R2Bucket;
}

export type CatalogPhoto = {
  title: string;
  price: number;
  highresKey: string | null;
  preview?: string | null;
};

export type ResolvedItem = {
  eventId: string;
  photoId: string;
  title: string;
  unitPrice: number;
  highresKey?: string;
  preview?: string;
};

export type CheckoutRequest = {
  email: string;
  emailProof: string;
  items: Array<{ eventId: string; photoId: string }>;
};

export type StoredOrder = {
  externalReference: string;
  preferenceId?: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected' | 'in_process';
  items: ResolvedItem[];
  total: number;
  createdAt: string;
  paidAt?: string;
  paymentId?: string;
  emailSentAt?: string;
};

export type EmailIndex = { refs: string[] };
export type MagicRecord = { email: string; exp: number };
export type SessionRecord = { email: string; exp: number };
export type OtpRecord = { code: string; exp: number; attempts: number };
export type EmailProofRecord = { email: string; exp: number };
export type DownloadGrant = {
  email: string;
  ref: string;
  eventId: string;
  photoId: string;
  exp: number;
};

export const MAGIC_TTL_SEC = 60 * 15;
export const SESSION_TTL_SEC = 60 * 60 * 24 * 7;
export const ORDER_PENDING_TTL = 60 * 60 * 24 * 30;
export const ORDER_PAID_TTL = 60 * 60 * 24 * 90;
export const EMAIL_INDEX_TTL = 60 * 60 * 24 * 365;
export const OTP_TTL_SEC = 60 * 10;
export const EMAIL_PROOF_TTL_SEC = 60 * 30;
export const DOWNLOAD_TOKEN_TTL_SEC = 60 * 15;
export const OTP_MAX_ATTEMPTS = 5;
export const RATE_ORDERS_LIMIT = 30;
export const RATE_DOWNLOAD_LIMIT = 60;
export const RATE_WINDOW_SEC = 60;
