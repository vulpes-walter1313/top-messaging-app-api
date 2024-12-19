import type { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";
import { db } from "../db";
import asyncHandler from "express-async-handler";
import { chats, chats_users, users } from "../db/schemas";
import { and, eq } from "drizzle-orm";
import { ErrorWithStatus } from "../../types/types";

export async function isAuthed(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // check for jwt in cookies
  const token = req.cookies.session;

  if (!token) {
    const err: ErrorWithStatus = new Error("No token in cookie");
    err.status = 401;
    next(err);
    return;
  }
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

export const isChatMember = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const chatId = req.params.chatId;
    const userId = req.userId;
    if (userId && chatId) {
      const chat_user = await db
        .select()
        .from(chats_users)
        .where(
          and(eq(chats_users.chatId, chatId), eq(chats_users.userId, userId)),
        );
      if (chat_user.length >= 1) {
        next();
        return;
      } else {
        const error: ErrorWithStatus = new Error(
          "You're forbidden from accessing this resource",
        );
        error.status = 403;
        next(error);
        return;
      }
    } else {
      const error = new Error("Some error occcured");
      next(error);
      return;
    }
  },
);
