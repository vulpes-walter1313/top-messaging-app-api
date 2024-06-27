import express from "express";
import chatsController from "../controllers/chatsController";

const router = express.Router();

router.post("/", chatsController.POST_Chats);
router.get("/", chatsController.GET_Chats);
router.get("/:chatId", chatsController.GET_Chat);
router.put("/:chatId", chatsController.PUT_Chat);
router.delete("/:chatId", chatsController.DELETE_Chat);
router.get("/:chatId/membership", chatsController.GET_Membership);
router.delete("/:chatId/membership", chatsController.DELETE_Membership);
router.post("/:chatId/messages", chatsController.POST_Messages);
router.get("/:chatId/messages", chatsController.GET_Messages);
router.delete("/:chatId/messages/:messageId", chatsController.DELETE_Message);

export default router;
