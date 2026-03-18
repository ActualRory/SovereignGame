const BASE = '/api';

export async function apiGet<T>(path: string, sessionToken?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (sessionToken) headers['x-session-token'] = sessionToken;

  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown, sessionToken?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionToken) headers['x-session-token'] = sessionToken;

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiPatch<T>(path: string, body: unknown, sessionToken?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionToken) headers['x-session-token'] = sessionToken;

  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
