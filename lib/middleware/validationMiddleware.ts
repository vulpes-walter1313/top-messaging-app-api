import type { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

export const validateData = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const valResult = validationResult(req);
  if (!valResult.isEmpty()) {
    res.json({
      success: false,
      error: {
        message: "Failed Validation",
      },
      errors: valResult.array(),
    });
    return;
  } else {
    next();
  }
};
