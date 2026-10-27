/**
 * Bulletproof API and Fetch Helper
 * Handles non-JSON responses, 404s, and prevents WebKit / Safari
 * `DOMException: The string did not match the expected pattern.`
 */

export interface SafeApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

let backendStatusCache: boolean | null = null;
let lastCheckTime = 0;

/**
 * Checks if the backend server (/api/health) is alive and responding with JSON.
 * Caches result for 15 seconds to avoid spamming health checks.
 */
export async function isBackendHealthy(forceCheck = false): Promise<boolean> {
  const now = Date.now();
  if (!forceCheck && backendStatusCache !== null && now - lastCheckTime < 15000) {
    return backendStatusCache;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch('/api/health', {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json.status === 'healthy') {
          backendStatusCache = true;
          lastCheckTime = now;
          return true;
        }
      } catch {
        // Response was not JSON
      }
    }
  } catch {
    // Network / abort error
  }

  backendStatusCache = false;
  lastCheckTime = now;
  return false;
}

/**
 * Safely fetches an endpoint and parses JSON without throwing SyntaxError on HTML / text 404s.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<SafeApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    let data: T | null = null;
    const isJsonLikely =
      contentType.includes('application/json') ||
      (text.trim().startsWith('{') && text.trim().endsWith('}')) ||
      (text.trim().startsWith('[') && text.trim().endsWith(']'));

    if (isJsonLikely && text.trim().length > 0) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const parsedAny = data as any;
      const errorMsg =
        (parsedAny && (parsedAny.error || parsedAny.message || parsedAny.detail)) ||
        (res.status === 404
          ? 'Backend service endpoint not found (404).'
          : `Server error (${res.status})`);

      return {
        ok: false,
        status: res.status,
        data,
        error: errorMsg,
      };
    }

    return {
      ok: true,
      status: res.status,
      data,
      error: null,
    };
  } catch (networkError: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: networkError?.message || 'Network connection failed.',
    };
  }
}
