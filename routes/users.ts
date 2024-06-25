import express, { NextFunction, Request, Response } from "express";
import { isAuthed } from "../lib/middleware/authMiddleware";

const router = express.Router();

/* GET users listing. */
router.get("/", [
  isAuthed,
  function (req: Request, res: Response, next: NextFunction) {
    res.json({ success: true, message: `Hello, ${req.session?.name}` });
  },
]);

export default router;
