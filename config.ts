import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const port = Number(process.env.PORT ?? 18889);
export const receiverPort = Number(process.env.EVENTS_RECEIVER_PORT ?? 18890);
export const tokenFile = new URL("./.demo-token", import.meta.url);

export function getToken(): string {
  if (process.env.DEMO_TOKEN) return process.env.DEMO_TOKEN;
  try {
    return readFileSync(tokenFile, "utf8").trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const token = randomBytes(24).toString("hex");
    writeFileSync(tokenFile, `${token}\n`, { mode: 0o600, flag: "wx" });
    return token;
  }
}
