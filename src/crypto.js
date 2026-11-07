const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomToken(bytes = 24) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function makeSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export function fromBase64(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export async function deriveChatKey(passphrase, saltBase64) {
  const material = await crypto.subtle.importKey(
    "raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(saltBase64), iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptMessage(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, encoder.encode(text)
  );
  return { ciphertext: toBase64(encrypted), iv: toBase64(iv) };
}

export async function decryptMessage(ciphertext, iv, key) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(ciphertext)
  );
  return decoder.decode(plain);
}
