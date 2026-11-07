import { OAuth2Client, type Credentials, type TokenPayload } from "google-auth-library";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { desktopRegistration } from "./google-registration.mjs";

type Identity = { sub: string; email: string; name: string };
type Vault = { available(): boolean; encrypt(value: string): Buffer; decrypt(value: Buffer): string };
export class CredentialUnlockError extends Error {
  constructor() {
    super("Saved Google credentials could not be unlocked. Cached files were preserved.");
    this.name = "CredentialUnlockError";
  }
}
export function collegeIdentity(claims: TokenPayload | undefined): Identity {
  if (!claims?.sub || claims.email_verified !== true || claims.hd !== "rajagiri.edu" || !claims.email?.toLowerCase().endsWith("@rajagiri.edu")) {
    throw new Error("Sign in with a verified rajagiri.edu college Google account.");
  }
  return { sub: claims.sub, email: claims.email, name: claims.name || claims.email };
}
export class GoogleAccount {
  private client?: OAuth2Client;
  identity?: Identity;
  private config?: { client_id: string; client_secret?: string };
  constructor(private directory: string, private vault: Vault, private openBrowser: (url: string) => Promise<void>) {}
  get configured() { return !!this.config; }
  get key() { return this.identity ? createHash("sha256").update(this.identity.sub).digest("hex").slice(0, 32) : null; }
  private async save(name: string, value: unknown) {
    if (!this.vault.available()) throw new Error("Windows credential encryption is unavailable. Google tokens were not stored.");
    await fs.mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, name);
    const temp = `${target}.${randomBytes(8).toString("hex")}.tmp`;
    await fs.writeFile(temp, this.vault.encrypt(JSON.stringify(value)), { mode: 0o600, flag: "wx" });
    await fs.rename(temp, target);
  }
  private async read(name: string) {
    try {
      const bytes = await fs.readFile(path.join(this.directory, name));
      if (!this.vault.available()) throw new Error("Windows credential encryption is unavailable");
      return JSON.parse(this.vault.decrypt(bytes));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new CredentialUnlockError();
    }
  }
  async initialize() {
    this.config = await this.read("google-client.bin") || undefined;
    if (!this.config) return;
    const stored = await this.read("google-session.bin");
    if (stored) {
      this.client = new OAuth2Client(this.config.client_id, this.config.client_secret);
      this.client.setCredentials(stored.tokens as Credentials);
      this.identity = stored.identity;
    }
  }
  /** Called only after explicit recovery confirmation. Never touches workspaces. */
  async recoverLockedCredentials() {
    const backup = `${this.directory}.recovery-${randomBytes(12).toString("hex")}`;
    // Rename before changing memory: if preservation fails, recovery fails closed.
    await fs.rename(this.directory, backup);
    this.client = undefined;
    this.identity = undefined;
    this.config = undefined;
  }
  async configure(json: unknown) {
    const config = desktopRegistration(json);
    if (this.identity) throw new Error("Log out safely before changing the Google application registration.");
    await this.save("google-client.bin", config);
    this.config = config;
  }
  async signIn() {
    if (!this.config) throw new Error("Load the registered Google Desktop OAuth client JSON first. A developer registers this client once; students do not need individual API keys.");
    if (!this.vault.available()) throw new Error("Secure credential storage is unavailable.");
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    let timeout: NodeJS.Timeout | undefined;
    const server = createServer();
    try {
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Google sign-in callback could not start.");
      const redirect = `http://127.0.0.1:${address.port}/oauth2callback`;
      const client = new OAuth2Client(this.config.client_id, this.config.client_secret, redirect);
      const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      const scope = "openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly";
      authorization.search = new URLSearchParams({ client_id: this.config.client_id, redirect_uri: redirect, response_type: "code",
        scope, access_type: "offline", prompt: "consent select_account", state, nonce,
        code_challenge: challenge, code_challenge_method: "S256", hd: "rajagiri.edu" }).toString();
      const code = new Promise<string>((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Google sign-in timed out. No account was changed.")), 180_000);
        server.on("request", (req, res) => {
          const url = new URL(req.url || "/", redirect);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          if (req.method !== "GET" || url.pathname !== "/oauth2callback" || req.headers.host !== `127.0.0.1:${address.port}` || url.searchParams.get("state") !== state) {
            res.writeHead(403).end("Authorization callback rejected."); return;
          }
          if (url.searchParams.has("error") || !url.searchParams.get("code")) {
            res.end("Authorization was not completed. Return to College Record Maker.");
            reject(new Error("Google authorization was declined or blocked by college policy.")); return;
          }
          res.end("Authorization received. Return to College Record Maker.");
          resolve(url.searchParams.get("code")!);
        });
      });
      await this.openBrowser(authorization.href);
      const { tokens } = await client.getToken({ code: await code, codeVerifier: verifier, redirect_uri: redirect })
        .catch(() => { throw new Error("Google authorization could not be exchanged. Check your network and the registered Desktop OAuth client, then try again."); });
      if (!tokens.id_token || !tokens.refresh_token || !tokens.scope?.split(" ").includes("https://www.googleapis.com/auth/drive.file")) {
        throw new Error("Google did not grant persistent app-file access. Sign in again and grant Drive permission.");
      }
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: this.config.client_id })
        .catch(() => { throw new Error("Google identity verification failed. No account was changed."); });
      const claims = ticket.getPayload();
      if ((claims as any)?.nonce !== nonce) throw new Error("Google identity nonce did not match.");
      const identity = collegeIdentity(claims);
      if (this.identity && this.identity.sub !== identity.sub) throw new Error("Reconnect the same college account. Use sync-and-logout before switching students.");
      client.setCredentials(tokens);
      await this.save("google-session.bin", { tokens, identity });
      this.client = client;
      this.identity = identity;
    } finally { clearTimeout(timeout); server.closeAllConnections(); server.close(); }
  }
  async token() {
    if (!this.client || !this.identity) throw new Error("Connect your college Google account first.");
    const { token } = await this.client.getAccessToken()
      .catch(() => { throw new Error("Google access could not be refreshed. Check your network or reconnect the same college account; local work is preserved."); });
    if (!token) throw new Error("Google access expired. Reconnect your college account.");
    await this.save("google-session.bin", { identity: this.identity, tokens: this.client.credentials });
    return token;
  }
  async clear() {
    await fs.rm(path.join(this.directory, "google-session.bin"), { force: true });
    this.client = undefined; this.identity = undefined;
  }
}
