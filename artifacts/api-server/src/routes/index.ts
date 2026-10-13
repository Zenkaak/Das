import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vpnRouter from "./vpn";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vpnRouter);

export default router;
