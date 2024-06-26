import type { Response, Request, NextFunction } from "express";
import {
  body,
  matchedData,
  param,
  query,
  validationResult,
} from "express-validator";
import asyncHandler from "express-async-handler";
import { isAuthed } from "../lib/middleware/authMiddleware";
import { db } from "../lib/db";
import { chats, chats_users, users } from "../lib/db/schemas";
import { count, sql, eq, desc, and } from "drizzle-orm";
import { verifyToken } from "../lib/utils/tokens";
import { client as tursoClient } from "../lib/db";
import { ErrorWithStatus } from "../types/types";

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

const GET_Chats = [
  query("type").isIn(["explore", "joined"]),
  query("limit").isInt({ min: 5, max: 20 }),
  query("page").isInt({ min: 1 }),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // Check validation results
    const valResult = validationResult(req);
    if (!valResult.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          message: "Validation result error",
          errors: valResult.array(),
        },
      });
    } else {
      // validation passed
      const data = matchedData(req);
      const type: string = data.type;
      const limit: number = parseInt(data.limit);
      const page: number = parseInt(data.page);
      let currentPage = page;
      switch (type) {
        case "explore":
          // this returns a result wether the user is authed or not.
          const countResult = await db.select({ value: count() }).from(chats);
          const chatCount = countResult[0].value;
          const totalPages = Math.ceil(chatCount / limit);
          if (currentPage > totalPages) {
            currentPage = totalPages;
          }
          const offset = (currentPage - 1) * limit;

          const chatsData = await db
            .select({
              id: chats.id,
              chatname: chats.chatname,
              chatLetters: chats.chatLetters,
              userCount: sql<number>`COUNT(${chats_users.userId})`,
            })
            .from(chats)
            .leftJoin(chats_users, eq(chats_users.chatId, chats.id))
            .groupBy(chats.id, chats.chatLetters, chats.chatname)
            .orderBy((t) => desc(t.userCount))
            .limit(limit)
            .offset(offset);

          res.json({
            success: true,
            numOfChats: chatCount,
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
              .select({ value: count() })
              .from(chats_users)
              .where(eq(chats_users.userId, userId));
            const chatCount = countResult[0].value;
            const totalPages = Math.ceil(chatCount / limit);
            if (currentPage > totalPages) {
              currentPage = totalPages;
            }
            const offset = (currentPage - 1) * limit;

            // const chatsData = await db
            //   .select({
            //     id: chats.id,
            //     chatname: chats.chatname,
            //     chatLetters: chats.chatLetters,
            //     userCount: sql<number>`COUNT(${chats_users.userId})`,
            //   })
            //   .from(chats)
            //   .leftJoin(chats_users, eq(chats_users.chatId, chats.id))
            //   .where(eq(chats_users.userId, userId))
            //   .groupBy(chats.id, chats.chatLetters, chats.chatname)
            //   .orderBy((t) => desc(t.userCount))
            //   .limit(limit)
            //   .offset(offset);
            // const statement = sql`SELECT c.id, c.chatname, c.chat_letters, c.created_at, c.updated_at, COUNT(cu2.user_id) AS user_count FROM chats c JOIN chats_users cu1 ON c.id = cu1.chat_id JOIN chats_users cu2 ON c.id = cu2.chat_id WHERE cu1.user_id = ? GROUP BY c.id`
            // const chatsData = await db.execute()
            //
            // TODO: Come back later to see if we can do this with drizzle in a single query.
            const chatsRawData = await tursoClient.execute({
              sql: "SELECT c.id, c.chatname, c.chat_letters, c.created_at, c.updated_at, COUNT(cu2.user_id) AS user_count FROM chats c JOIN chats_users cu1 ON c.id = cu1.chat_id JOIN chats_users cu2 ON c.id = cu2.chat_id WHERE cu1.user_id = ? GROUP BY c.id ORDER BY user_count DESC LIMIT ? OFFSET ?",
              args: [userId, limit, offset],
            });
            const chatsData = chatsRawData.rows.map((row) => ({
              id: row[0],
              chatname: row[1],
              chatTwoLetters: row[2],
              numOfMembers: row[5],
            }));
            res.json({
              success: true,
              numOfChats: chatCount,
              totalPages,
              currentPage,
              chats: chatsData,
            });
            return;
          }
          // get the number of chats that the user is joined.
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
    }
  }),
];

const GET_Chat = [
  param("chatId").isLength({ min: 24, max: 24 }).escape(),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const valResult = validationResult(req);

    if (!valResult.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          message: "failed validation result",
        },
        errors: valResult.array(),
      });
      return;
    } else {
      const { chatId } = matchedData(req);

      const chatInfo = await db
        .select({
          id: chats.id,
          chatname: chats.chatname,
          chatLetters: chats.chatLetters,
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
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const valResult = validationResult(req);

    if (!valResult.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          message: "validation result error",
        },
        errors: valResult.array(),
      });
      return;
    }
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
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const valResult = validationResult(req);

    if (!valResult.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          message: "Validation failed",
        },
        errors: valResult.array(),
      });
      return;
    }
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
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const valResult = validationResult(req);

    if (!valResult.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          message: "Validation failed",
        },
        errors: valResult.array(),
      });
      return;
    }

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

export default {
  POST_Chats,
  GET_Chats,
  GET_Chat,
  PUT_Chat,
  DELETE_Chat,
  GET_Membership,
};
