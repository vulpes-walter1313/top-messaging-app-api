import "dotenv/config";
import express, {
  type Express,
  Request,
  Response,
  NextFunction,
} from "express";
import path from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";
import indexRouter from "./routes/index";
import userRouter from "./routes/user";
import chatsRouter from "./routes/chats";
import authRouter from "./routes/auth";
import http from "http";
import { ErrorWithStatus } from "./types/types";
import cors from "cors";
import helmet from "helmet";
import { Server as SocketServer } from "socket.io";
import { jwtVerify } from "jose";
import { db } from "./lib/db";
import { messages, users } from "./lib/db/schemas";
import { desc, eq } from "drizzle-orm";
import { getUserById } from "./lib/data";
import { instrument } from "@socket.io/admin-ui";

const app = express();

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  cors({
    origin: [
      process.env.NODE_ENV === "production"
        ? process.env.PROD_FRONTEND_ORIGIN!
        : process.env.DEV_FRONTEND_ORIGIN!,
      "https://admin.socket.io",
    ],
    credentials: true,
  }),
);
app.use(helmet());

app.use("/", authRouter);
app.use("/", indexRouter);
app.use("/user", userRouter);
app.use("/chats", chatsRouter);
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: [
      process.env.NODE_ENV === "production"
        ? process.env.PROD_FRONTEND_ORIGIN!
        : process.env.DEV_FRONTEND_ORIGIN!,
      "https://admin.socket.io",
    ],
    credentials: true,
  },
});

instrument(io, {
  auth: false,
  mode: "development",
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    const err = new Error("Please attach token");
    next(err);
  }
  const secret = new TextEncoder().encode(process.env.JWT_SIGNING_KEY!);
  jwtVerify(token, secret)
    .then((payload) => {
      socket.data.userId = payload.payload.sub;
      socket.data.userName = payload.payload.name;
      next();
    })
    .catch((err) => {
      next(err);
    });
});

// websocket events
io.on("connection", (socket) => {
  // console.log(`a user connected: ${socket.data.userName}`);

  socket.on("join-room", async (room) => {
    socket.join(room);
    // console.log(`${socket.data.userName} joined room: ${room} ${Date.now()}`);

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
      .where(eq(messages.chatId, room))
      .orderBy(desc(messages.createdAt))
      .limit(50);

    // console.log(`sending initial messages to ${socket.data.userName}`);
    socket.emit("receive-initial-messages", dbMessages);
  });

  socket.on("send-message", async (message, room, callback) => {
    if (room === "" || room === undefined) {
      return;
    }
    const newMessageId = await db
      .insert(messages)
      .values({ chatId: room, authorId: socket.data.userId, content: message })
      .returning({ id: messages.id });

    const finalMessage = await db
      .select({
        id: messages.id,
        authorId: messages.authorId,
        author: users.name,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(eq(messages.id, newMessageId[0].id));
    // console.log(`${socket.data.userName} is broadcasting to ${room}`)
    socket.to(room).emit("receive-message", finalMessage[0]);
    callback(finalMessage[0]);
  });

  socket.on("delete-message", async (messageId: string, callback) => {
    const messageToDelete = await db.query.messages.findFirst({
      where: (message, { eq }) => eq(message.id, messageId),
    });
    if (!messageToDelete) {
      callback({
        success: false,
        error: "Message you want to delete does not exist",
      });
      return;
    }

    const user = await getUserById(socket.data.userId);
    if (!user) {
      callback({ success: false, error: "User not logged in" });
      return;
    }

    if (messageToDelete.authorId != user.id) {
      callback({ success: false, error: "User not allowed" });
      return;
    }

    const messageDeleted = await db
      .delete(messages)
      .where(eq(messages.id, messageId))
      .returning({ id: messages.id });
    callback({ success: true, messageDeleted: messageDeleted[0].id });
    return;
  });
  socket.on("leave-room", (room) => {
    socket.leave(room);
    // console.log(`${socket.data.userName} left room: ${room} ${Date.now()}`);
  });
  socket.on("disconnect", (reason) => {
    // console.log(`${socket.data.userName} disconnected because: `, reason);
  });
});

const port = parseInt(process.env.PORT || "3000");
app.set("port", port);

app.all("*", (req, res, next) => {
  const error = new Error("This resource does not exist") as Error & {
    status: number;
  };
  error.status = 404;
  next(error);
});
app.use(
  (
    err: ErrorWithStatus,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    console.error(err);
    err.message = err.message ?? "Unexpected Error occured";
    res.status(err.status ?? 500).json({
      success: false,
      error: {
        message: err.toString(),
        status: err.status ?? 500,
      },
    });
  },
);

server.listen(port);
server.on("error", (error) => {
  //@ts-ignore
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

  // handle specific listen errors with friendly messages
  // @ts-ignore
  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
      break;
    default:
      throw error;
  }
});
