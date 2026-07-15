const SESSION_KEY = 'frreinert-photos-session-v1';

export type PhotosSession = {
  token: string;
  email: string;
  expiresAt: number;
};

export function savePhotosSession(token: string, email: string, expiresInSec: number) {
  const data: PhotosSession = {
    token,
    email,
    expiresAt: Date.now() + expiresInSec * 1000,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  return data;
}

export function readPhotosSession(): PhotosSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PhotosSession;
    if (!data.token || !data.email || data.expiresAt < Date.now()) {
      clearPhotosSession();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearPhotosSession() {
  localStorage.removeItem(SESSION_KEY);
}
