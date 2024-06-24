import type { Request } from "express";
import { jwtVerify } from "jose";
export async function verifyToken(req: Request, token: string) {
  const secret = new TextEncoder().encode(process.env.JWT_SIGNING_KEY!);
  try {
    const { payload } = await jwtVerify(token, secret);
    req.userId = payload.sub;
    req.session = payload;
    return payload;
  } catch (err: any) {
    return;
  }
}
