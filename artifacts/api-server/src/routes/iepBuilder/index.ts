import { Router, type IRouter } from "express";
import contextRouter from "./context";
import generateRouter from "./generate";
import draftsRouter from "./drafts";
import presenceRouter from "./presence";
import commentsRouter from "./comments";

const router: IRouter = Router();

router.use(contextRouter);
router.use(generateRouter);
router.use(draftsRouter);
router.use(presenceRouter);
router.use(commentsRouter);

export default router;
