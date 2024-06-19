import type { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";

export async function isAuthed(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // check for jwt in cookies
  const token = req.cookies.session;
  // verify jwt
  const secret = new TextEncoder().encode(process.env.JWT_SIGNING_KEY!);
  try {
    const { payload } = await jwtVerify(token, secret);
    req.userId = payload.sub;
    req.session = payload;
    next();
  } catch (err: any) {
    err.status = 401;
    next(err);
  }
}
