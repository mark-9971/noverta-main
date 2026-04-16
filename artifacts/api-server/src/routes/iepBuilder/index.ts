import { Router, type IRouter } from "express";
import contextRouter from "./context";
import generateRouter from "./generate";
import draftsRouter from "./drafts";

const router: IRouter = Router();

router.use(contextRouter);
router.use(generateRouter);
router.use(draftsRouter);

export default router;
