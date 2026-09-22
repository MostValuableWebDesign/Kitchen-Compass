import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scanRouter from "./scan";
import recipeRouter from "./recipes";
import externalRecipeRouter from "./externalRecipes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scanRouter);
router.use(recipeRouter);
router.use(externalRecipeRouter);

export default router;
