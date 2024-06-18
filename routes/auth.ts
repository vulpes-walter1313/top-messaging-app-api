import express, {
  type Response,
  type Request,
  type NextFunction,
} from "express";
import authController from "../controllers/authController";

const router = express.Router();

router.post("/register", authController.register);

export default router;
