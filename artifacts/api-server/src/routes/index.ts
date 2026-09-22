import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scanRouter from "./scan";
import recipeRouter from "./recipes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scanRouter);
router.use(recipeRouter);

export default router;
