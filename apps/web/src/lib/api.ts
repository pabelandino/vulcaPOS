const TOKEN_KEY = 'vulcapos-token';
const USER_KEY = 'vulcapos-user';

export type SessionUser = {
  sub: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'CASHIER';
  branchId: number | null;
  access?: string[];
};

export class NetworkError extends Error {}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function parseError(response: Response) {
  try {
    const body = await response.json();
    const message = body.message || body.error || 'Error de servidor';
    return Array.isArray(message) ? message.join(', ') : String(message);
  } catch {
    return 'No se pudo completar la operación';
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers, cache: 'no-store' });
  } catch {
    throw new NetworkError('Sin conexión. El dato se puede guardar en este dispositivo.');
  }
  if (response.status === 401) {
    clearSession();
    if (!path.includes('/auth/login')) window.location.href = '/login';
    throw new Error('La sesión expiró. Entre de nuevo.');
  }
  if (!response.ok) throw new Error(await parseError(response));
  if (response.status === 204) return null as T;
  const text = await response.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('La respuesta del servidor llegó vacía o incompleta');
  }
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export async function apiBlob(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers, cache: 'no-store' });
  } catch {
    throw new NetworkError('Sin conexión. No se pudo generar el respaldo.');
  }
  if (!response.ok) throw new Error(await parseError(response));
  const blob = await response.blob();
  const match = (response.headers.get('Content-Disposition') || '').match(/filename="?([^"]+)"?/);
  return { blob, name: match?.[1] || 'respaldo.sql.gz' };
}
