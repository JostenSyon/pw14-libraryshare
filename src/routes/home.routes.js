import { Router } from "express";
import { getMostViewed, getMostRequested } from "../controllers/home.controller.js";

const router = Router();

// Home: libri più visualizzati
// Rotta: GET /api/home/most-viewed?limit=12
router.get("/most-viewed", getMostViewed);

// Home: libri più richiesti
// Rotta: GET /api/home/most-requested?limit=12
router.get("/most-requested", getMostRequested);

export default router;
