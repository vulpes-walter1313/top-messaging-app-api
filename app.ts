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

const app = express();

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.PROD_FRONTEND_ORIGIN
        : process.env.DEV_FRONTEND_ORIGIN,
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
    ],
  },
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
      next();
    })
    .catch((err) => {
      next(err);
    });
});

// websocket events
io.on("connection", (socket) => {
  console.log(`a user connected: ${socket.id}`);
  socket.on("join-room", (room) => {
    socket.join(room);
    console.log(`${socket.id} joined room: ${room}`);
  });
  socket.on("send-message", async (message, room) => {
    if (room === "" || room === undefined) {
      return;
    }
    const user = await db.query.users.findFirst({
      where: (user, { eq }) => eq(user.id, socket.data.userId!),
    });
    socket.to(room).emit("receive-message", `${user?.name} ${message}`);
  });
  socket.on("disconnect", (reason) => {
    console.log(`${socket.id} disconnected because: `, reason);
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
