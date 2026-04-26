// Avoid 0/O/1/I-style ambiguity for spoken/typed codes.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomChunk(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function generateRedemptionCode(merchantName: string): string {
  const prefix = (merchantName || "OFFER")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, "X");
  return `${prefix}-${randomChunk(4)}`;
}

export function isCodeShape(code: string): boolean {
  return /^[A-Z]{2,8}-[A-Z2-9]{3,6}$/i.test(code);
}
