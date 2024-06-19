import type { Request, Response, NextFunction } from "express";
import { body, matchedData, validationResult } from "express-validator";
import { ErrorWithStatus } from "../types/types";
import { db } from "../lib/db";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import { users } from "../lib/db/schemas";
import { SignJWT } from "jose";

const register = [
  body("name").notEmpty().escape(),
  body("email").isEmail(),
  body("password").isLength({ min: 8, max: 40 }),
  body("confirmPassword").custom((value, { req }) => {
    return value === req.body.password;
  }),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // validate data
    const valResult = validationResult(req);
    if (!valResult.isEmpty()) {
      const error: ErrorWithStatus = new Error("Validation error");
      error.status = 400;
      res.json({
        success: false,
        error: error.toString(),
        errors: valResult.array(),
      });
      return;
    }

    // check if user already exists
    // TODO: refactor this to be a custom express-validator
    const { email, password, name } = matchedData(req);
    const user = await db.query.users.findFirst({
      where: (user, { eq }) => eq(user.email, email),
    });
    if (user) {
      const error: ErrorWithStatus = new Error("User already exists");
      error.status = 400;
      next(error);
      return;
    }

    // if not, then hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // save user and respond
    const newUser = await db
      .insert(users)
      .values({
        name: name,
        email: email,
        password: hashedPassword,
      })
      .returning({ email: users.email });

    res.json({
      success: true,
      message: `new user created: ${newUser[0].email}`,
    });
    return;
  }),
];

const signin = [
  body("email").isEmail(),
  body("password").isLength({ min: 1 }).withMessage("Email is required"),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // validate data
    const valResult = validationResult(req);
    if (!valResult.isEmpty()) {
      res.json({ success: false, errors: valResult.array() });
      return;
    }
    const { email, password } = matchedData(req);

    // check if email exists

    const user = await db.query.users.findFirst({
      where: (user, { eq }) => eq(user.email, email),
    });
    if (!user) {
      const error: ErrorWithStatus = new Error("Invalid Credentials");
      error.status = 400;
      next(error);
      return;
    }

    // check if passwords match
    const passwordMatched = await bcrypt.compare(password, user.password);

    if (!passwordMatched) {
      const error: ErrorWithStatus = new Error("Invalid Credentials");
      error.status = 400;
      next(error);
      return;
    }
    // create token
    const secret = new TextEncoder().encode(process.env.JWT_SIGNING_KEY!);
    const expiresIn = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const accessToken = await new SignJWT({ sub: user.id, name: user.name })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(secret);

    // send token to cookie
    res.cookie("session", accessToken, { expires: expiresIn, httpOnly: true });

    // respond
    res.json({ success: true, message: "auth token sent at httpOnly Cookie" });
  }),
];

const signout = asyncHandler(async (req: Request, res: Response) => {
  res.cookie("session", "", { expires: new Date(Date.now()), httpOnly: true });
  res.json({ success: true, message: "Signout out successfully" });
});

export default { register, signin, signout };
