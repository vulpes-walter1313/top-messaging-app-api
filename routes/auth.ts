import express from "express";
import authController from "../controllers/authController";

const router = express.Router();

router.post("/register", authController.register);
router.post("/signin", authController.signin);
router.delete("/signout", authController.signout);

export default router;
