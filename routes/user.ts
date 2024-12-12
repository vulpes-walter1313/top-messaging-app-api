import express, { NextFunction, Request, Response } from "express";
import { ErrorWithStatus } from "../types/types";
import { isAuthed } from "../lib/middleware/authMiddleware";
import asyncHandler from "express-async-handler";
import { SignJWT } from "jose";
import { db } from "../lib/db";
import { users } from "../lib/db/schemas";

const router = express.Router();

/* GET users listing. */
// GET /user
router.get("/", [
  isAuthed,
  function (req: Request, res: Response, next: NextFunction) {
    const name = req.session?.name;
    res.json({
      success: true,
      loggedIn: true,
      userName: name ? name : "unknown",
      userId: req.userId,
    });
  },
]);

router.get("/token", [
  isAuthed,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const secret = new TextEncoder().encode(process.env.JWT_SIGNING_KEY!);
    const expiresIn = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const dbUser = await db.query.users.findFirst({
      where: (user, { eq }) => eq(user.id, req.userId!),
    });
    if (!dbUser) {
      const error: ErrorWithStatus = new Error("auth couldn't be verified");
      error.status = 404;
      next(error);
      return;
    }
    const accessToken = await new SignJWT({ sub: dbUser.id, name: dbUser.name })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(secret);
    res.json({ success: true, token: accessToken });
    return;
  }),
]);

export default router;
