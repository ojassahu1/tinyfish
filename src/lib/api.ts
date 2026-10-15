export type ApiOptions = {
  token?: string | null;
  workspaceId?: string | null;
  method?: "GET" | "POST";
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (options.workspaceId) headers.set("X-Workspace-ID", options.workspaceId);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`/api/${path.replace(/^\//, "")}`, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail;
    const message = typeof detail === "string" ? detail : detail?.message ?? detail?.code ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}