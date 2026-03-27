import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import friendsRouter from "./friends";
import messagesRouter from "./messages";
import groupsRouter from "./groups";
import voiceRouter from "./voice";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/friends", friendsRouter);
router.use("/messages", messagesRouter);
router.use("/groups", groupsRouter);
router.use("/voice", voiceRouter);

export default router;
