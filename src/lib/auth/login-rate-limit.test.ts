import { describe, expect, it } from "vitest";
import {
  clearLoginFailures,
  isLoginBlocked,
  loginRateKey,
  recordLoginFailure,
} from "./login-rate-limit";

describe("login rate limit", () => {
  it("blocks after five failures", () => {
    const key = loginRateKey(`blocked-${Date.now()}@example.com`, "127.0.0.1");
    for (let i = 0; i < 5; i += 1) recordLoginFailure(key);
    expect(isLoginBlocked(key)).toBe(true);
  });

  it("clears on success", () => {
    const key = loginRateKey(`clear-${Date.now()}@example.com`, "127.0.0.1");
    recordLoginFailure(key);
    clearLoginFailures(key);
    expect(isLoginBlocked(key)).toBe(false);
  });

  it("scopes by email and ip", () => {
    const a = loginRateKey("a@example.com", "1.1.1.1");
    const b = loginRateKey("a@example.com", "2.2.2.2");
    for (let i = 0; i < 5; i += 1) recordLoginFailure(a);
    expect(isLoginBlocked(a)).toBe(true);
    expect(isLoginBlocked(b)).toBe(false);
  });
});
