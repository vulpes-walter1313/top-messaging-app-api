import type { Request, Response, NextFunction } from "express";
import { body, matchedData, validationResult } from "express-validator";
import { ErrorWithStatus } from "../types/types";
import { db } from "../lib/db";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import { users } from "../lib/db/schemas";

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

export default { register };
