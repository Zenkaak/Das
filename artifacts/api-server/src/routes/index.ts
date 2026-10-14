import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import vpnRouter from "./vpn.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vpnRouter);

export default router;
