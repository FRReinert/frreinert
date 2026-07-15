export interface Env {
  COMMENTS: KVNamespace;
  TURNSTILE_SECRET_KEY?: string;
}

export type Comment = {
  name: string;
  message: string;
  createdAt: string;
};

export const SLUG_RE = /^[a-z0-9-]{1,120}$/;
export const NAME_MAX = 60;
export const MESSAGE_MAX = 2000;
export const MAX_COMMENTS_PER_POST = 500;
export const RATE_COOLDOWN_SEC = 30;
export const RATE_HOURLY_LIMIT = 10;
export const RATE_HOURLY_WINDOW_SEC = 60 * 60;
