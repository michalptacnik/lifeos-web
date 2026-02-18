import { createHmac } from "node:crypto";

export type MatrixBridgePayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function createMatrixBridgeToken(payload: MatrixBridgePayload, secret: string) {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}
