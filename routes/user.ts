import express, { NextFunction, Request, Response } from "express";
import { isAuthed } from "../lib/middleware/authMiddleware";

const router = express.Router();

/* GET users listing. */
router.get("/", [
  isAuthed,
  function (req: Request, res: Response, next: NextFunction) {
    const name = req.session?.name;
    res.json({ success: true, loggedIn: true, userName: name ? name : "unknown" });
  },
]);

export default router;
