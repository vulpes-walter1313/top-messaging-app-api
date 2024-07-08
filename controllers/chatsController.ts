import type { Response, Request, NextFunction } from "express";
import {
  body,
  matchedData,
  param,
  query,
  validationResult,
} from "express-validator";
import asyncHandler from "express-async-handler";
import { isAuthed, isChatMember } from "../lib/middleware/authMiddleware";
import { db } from "../lib/db";
import { chats, chats_users, messages, users } from "../lib/db/schemas";
import { count, sql, eq, and, like, or, desc } from "drizzle-orm";
import { verifyToken } from "../lib/utils/tokens";
import { ErrorWithStatus } from "../types/types";
import { getChatData } from "../lib/data";
import { validateData } from "../lib/middleware/validationMiddleware";

const POST_Chats = [
  isAuthed,
  body("chatname").isString().isLength({ min: 3, max: 32 }).escape(),
  body("chatTwoLetters").isString().isLength({ min: 2, max: 2 }),
  body("chatDescription").isString().isLength({ min: 1, max: 256 }).escape(),
  validateData,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
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

const GET_Chats = [
  query("type").isIn(["explore", "joined"]),
  query("limit").isInt({ min: 5, max: 20 }),
  query("page").isInt({ min: 1 }),
  query("search").trim().escape(),
  validateData,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // validation passed
    const data = matchedData(req);
    const type: string = data.type;
    const limit: number = parseInt(data.limit);
    const page: number = parseInt(data.page);
    const searchQuery: string | undefined = data.search;
    let currentPage = page;
    switch (type) {
      case "explore":
        // this returns a result wether the user is authed or not.
        const countResult = await db
          .select({ value: count() })
          .from(chats)
          .where(
            or(
              like(chats.chatname, `%${searchQuery}%`),
              like(chats.id, `%${searchQuery}%`),
            ),
          );
        const chatCount = countResult[0].value;
        const totalPages = Math.ceil(chatCount / limit);
        if (currentPage > totalPages) {
          currentPage = totalPages;
        }
        const offset = (currentPage - 1) * limit;

        const chatsData = await getChatData({
          type: type,
          limit: limit,
          offset: offset,
          search: searchQuery,
        });

        res.json({
          success: true,
          totalChats: chatCount,
          totalPages,
          currentPage,
          chats: chatsData,
        });
        return;
        break;
      case "joined":
        // verify token
        const token = req.cookies.session;
        await verifyToken(req, token);
        // get logged in user

        const userId = req.userId;
        if (!userId) {
          res.status(401).json({
            success: false,
            error: {
              message: "User not authenticated",
            },
          });
          return;
        } else {
          // user is authed
          const countResult = await db
            .select({ value: sql<number>`COUNT(${chats_users.chatId})` })
            .from(chats_users)
            .leftJoin(chats, eq(chats_users.chatId, chats.id))
            .where(
              and(
                eq(chats_users.userId, userId),
                or(
                  like(chats.chatname, `%${searchQuery}%`),
                  like(chats.id, `%${searchQuery}%`),
                ),
              ),
            );

          const chatCount = countResult[0].value;
          const totalPages = Math.ceil(chatCount / limit);
          if (currentPage > totalPages) {
            currentPage = totalPages;
          }
          const offset = (currentPage - 1) * limit;

          const chatsData = await getChatData({
            type: type,
            limit: limit,
            offset: offset,
            search: searchQuery,
            userId: userId,
          });

          res.json({
            success: true,
            totalChats: chatCount,
            totalPages,
            currentPage,
            chats: chatsData,
          });
          return;
        }
        break;
      default:
        res.status(500).json({
          success: false,
          error: {
            message: "Unexpected Server Error",
          },
        });
        break;
    }
  }),
];

const GET_Chat = [
  param("chatId").isLength({ min: 24, max: 24 }).escape(),
  validateData,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { chatId } = matchedData(req);

    const chatInfo = await db
      .select({
        id: chats.id,
        chatname: chats.chatname,
        chatLetters: chats.chatLetters,
        chatDescription: chats.chatDescription,
        adminName: users.name,
        membersCount: sql<number>`count(${chats_users.userId})`,
      })
      .from(chats)
      .leftJoin(users, eq(chats.chatAdmin, users.id))
      .leftJoin(chats_users, eq(chats_users.chatId, chats.id))
      .where(eq(chats.id, chatId))
      .groupBy(chats.id);

    if (chatInfo.length === 0) {
      const error: ErrorWithStatus = new Error("This chat doesn't exist");
      error.status = 404;
      next(error);
      return;
    } else {
      res.json({
        success: true,
        message: `you are requesting chat ${chatId}`,
        chatInfo: chatInfo[0],
      });
      return;
    }
  }),
];
const PUT_Chat = [
  isAuthed,
  param("chatId").isLength({ min: 24, max: 24 }).escape(),
  body("chatname")
    .isLength({ min: 4, max: 40 })
    .withMessage("Name should be between 4 and 40 characters")
    .escape(),
  body("chatDescription")
    .isLength({ min: 1, max: 256 })
    .withMessage("Chat description should be between 1 and 256 characters long")
    .escape(),
  body("chatLetters")
    .isLength({ min: 2, max: 2 })
    .withMessage("Must be just 2 characters")
    .isAlpha()
    .withMessage("Must be to alphabet letters"),
  validateData,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { chatId, chatname, chatLetters, chatDescription } = matchedData(req);

    // get chat
    const chat = await db.query.chats.findFirst({
      where: (chat, { eq }) => eq(chat.id, chatId),
    });

    if (!chat) {
      const error: ErrorWithStatus = new Error("Chat not found.");
      error.status = 404;
      next(error);
    } else {
      // check if authed user is the chat admin
      const isUserAdmin = chat.chatAdmin === req.userId;

      // revoke if not admin
      if (!isUserAdmin) {
        res.status(403).json({
          success: false,
          error: {
            message: "You are not allowed to access this resource",
          },
        });
        return;
      } else {
        // if valid data, update record.
        const updatedChat = await db
          .update(chats)
          .set({
            chatname: chatname,
            chatLetters: chatLetters,
            chatDescription: chatDescription,
          })
          .where(eq(chats.id, chatId))
          .returning();

        res.json({
          success: true,
          message: `chat: ${updatedChat[0].id} has been updated`,
        });
      }
    }
  }),
];
const DELETE_Chat = [
  isAuthed,
  param("chatId").isLength({ min: 24, max: 24 }).escape(),
  validateData,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { chatId } = matchedData(req);

    // get chat
    const chat = await db.query.chats.findFirst({
      where: (chat, { eq }) => eq(chat.id, chatId),
    });

    // if chat doesn't exist then error
    if (!chat) {
      const error: ErrorWithStatus = new Error("Chat doesn't exist");
      error.status = 404;
      next(error);
      return;
    } else {
      // if chat exists, check if authed user is chatadmin
      const isUserAdmin = req.userId === chat.chatAdmin;

      if (!isUserAdmin) {
        const error: ErrorWithStatus = new Error(
          "You are forbidden from taking this action",
        );
        error.status = 403;
        next(error);
        return;
      }
      // if chat admin, proceed with deletion
      const deletedChat = await db
        .delete(chats)
        .where(eq(chats.id, chatId))
        .returning();
      res.json({
        success: true,
        message: `chat: ${deletedChat[0].id}-${deletedChat[0].chatname} has been deleted`,
      });
      return;
    }
  }),
];

const GET_Membership = [
  isAuthed,
  param("chatId").isLength({ min: 24, max: 24 }).escape(),
  validateData,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { chatId } = matchedData(req);
    const userId = req.userId;
    const user = await db.query.users.findFirst({
      where: (user, { eq }) => eq(user.id, userId!),
    });
    const chat = await db.query.chats.findFirst({
      where: (chat, { eq }) => eq(chat.id, chatId),
    });

    // check if user is already in chats_users for that specific chat.
    if (user && chat) {
      const chat_user = await db
        .select({ chatId: chats_users.chatId, userId: chats_users.userId })
        .from(chats_users)
        .where(
          and(eq(chats_users.chatId, chat.id), eq(chats_users.userId, user.id)),
        );
      if (chat_user.length === 0) {
        // if not, add the new record to chats_users
        const newMembership = await db
          .insert(chats_users)
          .values({ chatId: chat.id, userId: user.id })
          .returning();
        res.json({
          success: true,
          message: `${newMembership[0].userId} is now a member of ${newMembership[0].chatId}`,
          chatId: newMembership[0].chatId,
          userId: newMembership[0].userId,
        });
        return;
      } else {
        // if they are, return already subscribed
        res.status(409).json({
          success: false,
          error: {
            message: "User is already a member of this chatroom",
          },
        });
        return;
      }
    } else {
      const error: ErrorWithStatus = new Error("User doesn't exist");
      error.status = 404;
      next(error);
      return;
    }
  }),
];

const DELETE_Membership = [
  isAuthed,
  param("chatId").isLength({ min: 24, max: 24 }).escape(),
  validateData,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { chatId } = matchedData(req);
    const userId = req.userId;
    const user = await db.query.users.findFirst({
      where: (user, { eq }) => eq(user.id, userId!),
    });
    const chat = await db.query.chats.findFirst({
      where: (chat, { eq }) => eq(chat.id, chatId),
    });

    // check if user is already in chats_users for that specific chat.
    if (user && chat) {
      const chat_user = await db
        .select({ chatId: chats_users.chatId, userId: chats_users.userId })
        .from(chats_users)
        .where(
          and(eq(chats_users.chatId, chat.id), eq(chats_users.userId, user.id)),
        );
      if (chat_user.length === 0) {
        // if not, return error
        res.status(409).json({
          success: true,
          error: {
            message: "User was already not a member",
          },
        });
        return;
      } else {
        // if they are, delete this record.
        const deletedMembership = await db
          .delete(chats_users)
          .where(
            and(
              eq(chats_users.chatId, chat.id),
              eq(chats_users.userId, user.id),
            ),
          )
          .returning();
        res.json({
          success: true,
          message: `user: ${user.id} was removed from chat: ${deletedMembership[0].chatId}`,
        });
        return;
      }
    } else {
      const error: ErrorWithStatus = new Error("User doesn't exist");
      error.status = 404;
      next(error);
      return;
    }
  }),
];

const POST_Messages = [
  isAuthed,
  param("chatId").isLength({ min: 24, max: 24 }).escape(),
  body("content").isLength({ min: 1, max: 2046 }).escape(),
  validateData,
  isChatMember,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { chatId, content } = matchedData(req);
    // at this point, we know the authed user is a member of the chat.
    const newMessage = await db
      .insert(messages)
      .values({ chatId: chatId, authorId: req.userId!, content: content })
      .returning();

    res.json({
      success: true,
      message: `New Message created: ${newMessage[0].id}`,
    });
    return;
  }),
];

const GET_Messages = [
  isAuthed,
  param("chatId").isLength({ min: 24, max: 24 }).escape(),
  query("page").isInt(),
  query("limit").isInt({ min: 50, max: 100 }),
  validateData,
  isChatMember,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const data = matchedData(req);

    let page = parseInt(data.page);
    const limit = parseInt(data.limit);
    const chatId: string = data.chatId;
    let currentPage = page;

    const countRes = await db
      .select({ count: sql<number>`COUNT(${messages.id})` })
      .from(messages)
      .where(eq(messages.chatId, chatId));

    const totalPages = Math.ceil(countRes[0].count / limit);
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }
    const offset = (currentPage - 1) * limit;

    const dbMessages = await db
      .select({
        id: messages.id,
        authorId: messages.authorId,
        author: users.name,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);
      
      //@ts-ignore
    const finalMessages: {
      id: string;
      authorId: string;
      author: string | null;
      authorIsUser: boolean;
      content: string | null;
      createdAt: string | null;
  }[] = dbMessages.map(message => {
        if (message.authorId === req.userId) {
        // @ts-ignore
          message.authorIsUser = true;
        } else {
        // @ts-ignore
          message.authorIsUser = false;
        }
        return message;
    })
    res.json({
      success: true,
      numOfMessages: dbMessages.length,
      totalPages: totalPages,
      currentPage: currentPage,
      messages: finalMessages,
    });

    // at this point, we know the authed user is a member of the chat.
    return;
  }),
];

const DELETE_Message = [
  isAuthed,
  param("chatId").isLength({ min: 24, max: 24 }).escape(),
  param("messageId").isLength({ min: 24, max: 24 }).escape(),
  validateData,
  isChatMember,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { chatId, messageId } = matchedData(req);
    // check if message exist
    const message = await db.query.messages.findFirst({
      where: (message, { eq }) =>
        and(eq(message.id, messageId), eq(message.chatId, chatId)),
    });

    if (!message) {
      const error: ErrorWithStatus = new Error("message doesn't exist");
      error.status = 404;
      next(error);
      return;
    } else {
      // check is authed user is message author
      if (message.authorId === req.userId) {
        // if author then delete message
        const deletedMessage = await db
          .delete(messages)
          .where(eq(messages.id, message.id))
          .returning();

        res.json({
          success: true,
          message: `Message: ${deletedMessage[0].id} was successfully deleted`,
        });
        return;
      } else {
        // if not author, throw error
        const error: ErrorWithStatus = new Error(
          "You are forbidden from performing this action",
        );
        error.status = 403;
        next(error);
        return;
      }
    }
  }),
];

export default {
  POST_Chats,
  GET_Chats,
  GET_Chat,
  PUT_Chat,
  DELETE_Chat,
  GET_Membership,
  DELETE_Membership,
  POST_Messages,
  GET_Messages,
  DELETE_Message,
};
