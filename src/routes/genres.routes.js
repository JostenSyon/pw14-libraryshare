import { Router } from "express";
import { getAllGenres, searchGenres } from "../controllers/genres.controller.js";

const router = Router();
router.get("/", getAllGenres);
router.get("/search", searchGenres);

export default router;