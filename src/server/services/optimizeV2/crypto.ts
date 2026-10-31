// AES-GCM encryption for optimization-platform credentials (customer Zoom /
// RingCentral app secrets). Key: OPTIMIZE_ENC_KEY, a base64 32-byte worker
// secret (`openssl rand -base64 32`). Ciphertext format: "iv.ct", both base64.
//
// Rotating the key makes stored credentials unreadable; they'd need re-entering.

async function importKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("OPTIMIZE_ENC_KEY must be 32 bytes, base64-encoded");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptJson(keyB64: string, value: unknown): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return `${toB64(iv)}.${toB64(ct)}`;
}

export async function decryptJson<T>(keyB64: string, blob: string): Promise<T> {
  const [iv, ct] = blob.split(".");
  if (!iv || !ct) throw new Error("Malformed credential blob");
  const key = await importKey(keyB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, key, fromB64(ct));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
