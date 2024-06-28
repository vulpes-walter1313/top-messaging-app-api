import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "../db";
import { chats, chats_users } from "../db/schemas";
import { ErrorWithStatus } from "../../types/types";
import { alias } from "drizzle-orm/sqlite-core";

type GetChatDataProps = {
  type: string;
  limit: number;
  offset: number;
  search?: string;
  userId?: string;
};

export const getChatData = async ({
  type,
  limit,
  offset,
  search,
  userId,
}: GetChatDataProps) => {
  if (search) {
    switch (type) {
      case "explore":
        const chatData1 = await db
          .select({
            id: chats.id,
            chatname: chats.chatname,
            chatLetters: chats.chatLetters,
            createdAt: chats.createdAt,
            updatedAt: chats.updatedAt,
            numOfMembers: sql<number>`COUNT(${chats_users.userId})`,
          })
          .from(chats)
          .leftJoin(chats_users, eq(chats_users.chatId, chats.id))
          .where(
            or(
              like(chats.chatname, `%${search}%`),
              like(chats.id, `%${search}%`),
            ),
          )
          .groupBy(chats.id, chats.chatLetters, chats.chatname)
          .orderBy((t) => desc(t.numOfMembers))
          .limit(limit)
          .offset(offset);
        return chatData1;
        break;
      case "joined":
        const cu1 = alias(chats_users, "cu1");
        const cu2 = alias(chats_users, "cu2");
        const chatsData2 = await db
          .select({
            id: chats.id,
            chatname: chats.chatname,
            chatLetters: chats.chatLetters,
            createdAt: chats.createdAt,
            updatedAt: chats.updatedAt,
            numOfMembers: sql<number>`COUNT(${cu2.userId})`,
          })
          .from(chats)
          .leftJoin(cu1, eq(chats.id, cu1.chatId))
          .leftJoin(cu2, eq(chats.id, cu2.chatId))
          .where(
            and(
              eq(cu1.userId, userId!),
              or(
                like(chats.chatname, `%${search}%`),
                like(chats.id, `%${search}%`),
              ),
            ),
          )
          .groupBy(chats.id)
          .orderBy((t) => desc(t.numOfMembers))
          .limit(limit)
          .offset(offset);
        return chatsData2;
        break;
      default:
        const error: ErrorWithStatus = new Error("unexpected type query param");
        error.status = 400;
        throw error;
        break;
    }
  } else {
    // no search param
    switch (type) {
      case "explore":
        const chatData1 = await db
          .select({
            id: chats.id,
            chatname: chats.chatname,
            chatLetters: chats.chatLetters,
            createdAt: chats.createdAt,
            updatedAt: chats.updatedAt,
            numOfMembers: sql<number>`COUNT(${chats_users.userId})`,
          })
          .from(chats)
          .leftJoin(chats_users, eq(chats_users.chatId, chats.id))
          .groupBy(chats.id, chats.chatLetters, chats.chatname)
          .orderBy((t) => desc(t.numOfMembers))
          .limit(limit)
          .offset(offset);
        return chatData1;
        break;
      case "joined":
        const cu1 = alias(chats_users, "cu1");
        const cu2 = alias(chats_users, "cu2");
        const chatsData2 = await db
          .select({
            id: chats.id,
            chatname: chats.chatname,
            chatLetters: chats.chatLetters,
            createdAt: chats.createdAt,
            updatedAt: chats.updatedAt,
            numOfMembers: sql<number>`COUNT(${cu2.userId})`,
          })
          .from(chats)
          .leftJoin(cu1, eq(chats.id, cu1.chatId))
          .leftJoin(cu2, eq(chats.id, cu2.chatId))
          .where(eq(cu1.userId, userId!))
          .groupBy(chats.id)
          .orderBy((t) => desc(t.numOfMembers))
          .limit(limit)
          .offset(offset);
        return chatsData2;
        break;
      default:
        const error: ErrorWithStatus = new Error("unexpected type query param");
        error.status = 400;
        throw error;
        break;
    }
  }
};
