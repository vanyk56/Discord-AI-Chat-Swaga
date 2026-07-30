import { Router, type IRouter } from "express";
import healthRouter from "./health";
import geminiRouter from "./gemini/index";
import botStatusRouter from "./bot-status";

const router: IRouter = Router();

router.use(healthRouter);
router.use(geminiRouter);
router.use(botStatusRouter);

export default router;
