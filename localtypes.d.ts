/**
 * tell typescript to grab the request object and ad userId to it
 */

import * as express from "express";
import { JWTPayload } from "jose";

declare global {
  namespace Express {
    interface Request {
      userId?: string | undefined;
      session?: JWTPayload | undefined;
    }
  }
}
