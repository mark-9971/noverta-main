import { customFetch } from "@workspace/api-client-react";

export { customFetch };

export async function apiGet<T = unknown>(path: string): Promise<T> {
  return customFetch<T>(path, { method: "GET" });
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown
): Promise<T> {
  return customFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch<T = unknown>(
  path: string,
  body?: unknown
): Promise<T> {
  return customFetch<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T = unknown>(
  path: string,
  body?: unknown
): Promise<T> {
  return customFetch<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  return customFetch<T>(path, { method: "DELETE" });
}
