/**
 * In-process sliding-window rate limiter (backend spec §A.10). State lives in
 * the server process, so limits reset on restart and aren't shared between
 * replicas; that is what the spec asks for.
 */

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  /** Counts one hit for `key` at `now` (epoch ms) and says whether it is allowed. */
  hit(key: string, now?: number): RateLimitResult;
  /** Forgets every key (tests). */
  reset(): void;
};

export function createRateLimiter(options: { limit: number; windowMs: number }): RateLimiter {
  const { limit, windowMs } = options;
  const hits = new Map<string, number[]>();

  function prune(now: number): void {
    for (const [key, times] of hits) {
      const kept = times.filter((t) => now - t < windowMs);
      if (kept.length === 0) hits.delete(key);
      else hits.set(key, kept);
    }
  }

  let lastPrune = 0;

  return {
    hit(key, now = Date.now()) {
      // Drop idle keys now and then so the map can't grow without bound.
      if (now - lastPrune >= windowMs) {
        prune(now);
        lastPrune = now;
      }

      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const retryAfterMs = windowMs - (now - recent[0]);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { allowed: true };
    },
    reset() {
      hits.clear();
      lastPrune = 0;
    },
  };
}

/**
 * Client IP for rate limits and logs: `X-Real-IP`, set by the reverse proxy.
 * `X-Forwarded-For` is never trusted (§A.10). Null when the header is absent.
 */
export function clientIp(headers: Headers): string | null {
  return headers.get("x-real-ip")?.trim() || null;
}

/** `/api/auth/google/start`: 20 per 10 minutes per IP (§A.10). */
export const googleStartRateLimiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });
