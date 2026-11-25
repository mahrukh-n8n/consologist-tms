type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const buckets = new Map<string, Bucket>();

export function loginRateKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

export function isLoginBlocked(key: string): boolean {
  const bucket = buckets.get(key);
  if (!bucket) return false;
  if (bucket.resetAt <= Date.now()) {
    buckets.delete(key);
    return false;
  }
  return bucket.count >= MAX_ATTEMPTS;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

export function clearLoginFailures(key: string): void {
  buckets.delete(key);
}
