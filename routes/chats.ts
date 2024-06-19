import express from "express";
import chatsController from "../controllers/chatsController";

const router = express.Router();

router.post("/", chatsController.POST_Chats);

export default router;
