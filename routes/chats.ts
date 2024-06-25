import express from "express";
import chatsController from "../controllers/chatsController";

const router = express.Router();

router.post("/", chatsController.POST_Chats);
router.get("/", chatsController.GET_Chats);
router.get("/:chatId", chatsController.GET_Chat);
router.put("/:chatId", chatsController.PUT_Chat);

export default router;
