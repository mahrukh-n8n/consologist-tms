import { createHash } from "node:crypto";
import { TokenType } from "@streamparser/json";
import type { BackupManifest } from "../registry/types";
/** Canonical wire tokens are hashed without assembling source rows. BigInt wire
 * tags are converted to the checksum's legacy decimal-string representation. */
const SYMBOLS: Record<number, string> = { [TokenType.LEFT_BRACE]: "{", [TokenType.RIGHT_BRACE]: "}", [TokenType.LEFT_BRACKET]: "[", [TokenType.RIGHT_BRACKET]: "]", [TokenType.COLON]: ":", [TokenType.COMMA]: ",", [TokenType.TRUE]: "true", [TokenType.FALSE]: "false", [TokenType.NULL]: "null" };
export class TokenChecksum {
  private pending = "";
  private text(value: string) { this.pending += value; if (this.pending.length >= 65536) { this.hash.update(this.pending); this.pending = ""; } }
  private hash = createHash("sha256");
  private probe: Array<{ token: TokenType; value?: unknown }> | null = null;
  begin(manifest: BackupManifest) { const { checksum, ...fields } = manifest; if (typeof checksum !== "string") throw new Error("Missing backup checksum"); this.hash.update('{"manifest":'); this.hash.update(JSON.stringify(fields)); this.hash.update(',"data":'); }
  write(token: TokenType, value?: unknown) {
    if (this.probe) {
      const at = this.probe.length;
      if (at === 1 && token === TokenType.STRING && value === "__bigint" || at === 2 && token === TokenType.COLON || at === 3 && token === TokenType.STRING) { this.probe.push({ token, value }); return; }
      if (at === 4) {
        if (token !== TokenType.RIGHT_BRACE || !/^-?\d+$/.test(String(this.probe[3]?.value))) throw new Error("Invalid BigInt backup tag");
        this.text(JSON.stringify(String(this.probe[3]!.value))); this.probe = null; return;
      }
      const prefix = this.probe; this.probe = null;
      for (const item of prefix) this.raw(item.token, item.value);
      this.write(token, value); return;
    }
    if (token === TokenType.LEFT_BRACE) { this.probe = [{ token }]; return; }
    this.raw(token, value);
  }
  private raw(token: TokenType, value?: unknown) {
    this.text(token === TokenType.STRING || token === TokenType.NUMBER ? JSON.stringify(value) : SYMBOLS[token]!);
  }
  end() { if (this.probe) throw new Error("Incomplete backup checksum"); this.text("}"); this.hash.update(this.pending); this.pending = ""; return this.hash.digest("hex"); }
}
