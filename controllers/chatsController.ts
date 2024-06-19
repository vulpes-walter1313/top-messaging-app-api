import type { Response, Request, NextFunction } from "express";
import { body, matchedData, validationResult } from "express-validator";
import asyncHandler from "express-async-handler";
import { isAuthed } from "../lib/middleware/authMiddleware";
import { db } from "../lib/db";
import { chats, chats_users } from "../lib/db/schemas";

const POST_Chats = [
  isAuthed,
  body("chatname").isString().isLength({ min: 3, max: 32 }).escape(),
  body("chatTwoLetters").isString().isLength({ min: 2, max: 2 }),
  body("chatDescription").isString().isLength({ min: 1, max: 256 }).escape(),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const valResult = validationResult(req);
    if (!valResult.isEmpty()) {
      res.json({
        success: false,
        message: "Failed Validation",
        messages: valResult.array(),
      });
      return;
    }

    const { chatname, chatTwoLetters, chatDescription } = matchedData(req);
    const user = await db.query.users.findFirst({
      where: (user, { eq }) => eq(user.id, req.userId!),
    });

    if (!user) {
      res.status(500).json({ success: false, message: "User doesn't exist" });
    } else {
      // create a chat with authed user as admin
      const newChat = await db
        .insert(chats)
        .values({
          chatname: chatname,
          chatLetters: chatTwoLetters,
          chatDescription: chatDescription,
          chatAdmin: user.id,
        })
        .returning({ id: chats.id });

      await db.insert(chats_users).values({
        chatId: newChat[0].id,
        userId: user.id,
      });
      res.json({
        success: true,
        message: `New chat created: ${newChat[0].id} by ${user.name}: ${user.id}`,
      });
      return;
    }
  }),
];

export default { POST_Chats };
