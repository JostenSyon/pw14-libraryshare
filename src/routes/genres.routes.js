import { Router } from "express";
import { getAllGenres, searchGenres, createGenre } from "../controllers/genres.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";

const router = Router();
router.get("/", getAllGenres);
router.get("/search", searchGenres);
router.post("/", requireAuth, requireAdmin, createGenre);

export default router;
