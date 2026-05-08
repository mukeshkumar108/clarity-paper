import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import documentsRouter from "./documents";
import dashboardRouter from "./dashboard";
import billingRouter from "./billing";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(documentsRouter);
router.use(dashboardRouter);
router.use(billingRouter);
router.use(settingsRouter);

export default router;
