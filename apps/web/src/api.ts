const TENANT_KEY = 'ssma.tenant';

export const getTenant = () => {
  try {
    return localStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
};
export const setTenant = (id: string | null) => {
  try {
    if (id) localStorage.setItem(TENANT_KEY, id);
    else localStorage.removeItem(TENANT_KEY);
  } catch {
    /* armazenamento indisponível */
  }
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: { campo: string; mensagem: string }[]) {
    super(message);
  }
}

function headers(extra: Record<string, string> = {}) {
  const h: Record<string, string> = { 'x-requested-with': 'ssma', ...extra };
  const t = getTenant();
  if (t) h['x-tenant-id'] = t;
  return h;
}

async function handle(res: Response) {
  if (res.ok) {
    const type = res.headers.get('content-type') ?? '';
    return type.includes('application/json') ? res.json() : res;
  }
  let body: { message?: string; error?: string; details?: { campo: string; mensagem: string }[] } = {};
  try {
    body = await res.json();
  } catch {
    /* sem corpo */
  }
  if (res.status === 401 && !location.pathname.startsWith('/login') && body.error !== 'invalid_credentials' && body.error !== 'invalid_code') {
    window.dispatchEvent(new CustomEvent('ssma:unauthorized', { detail: body.error }));
  }
  throw new ApiError(res.status, body.message ?? `Erro ${res.status}`, body.error, body.details);
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: headers(body !== undefined ? { 'content-type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle(res) as Promise<T>;
}

export const get = <T = unknown>(p: string) => api<T>('GET', p);
export const post = <T = unknown>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const patch = <T = unknown>(p: string, b: unknown) => api<T>('PATCH', p, b);
export const put = <T = unknown>(p: string, b: unknown) => api<T>('PUT', p, b);
export const del = <T = unknown>(p: string) => api<T>('DELETE', p);

export async function upload<T = unknown>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', file);
  const res = await fetch(`/api${path}`, { method: 'POST', credentials: 'same-origin', headers: headers(), body: fd });
  return handle(res) as Promise<T>;
}

/** Baixa um arquivo autenticado e dispara o download no navegador. */
export async function download(path: string, fallbackName = 'arquivo') {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', headers: headers() });
  if (!res.ok) await handle(res);
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd) ?? /filename="([^"]+)"/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
