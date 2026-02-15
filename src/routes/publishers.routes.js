import { Router } from "express";
import { getAllPublishers, searchPublishers } from "../controllers/publishers.controller.js";

const router = Router();
router.get("/", getAllPublishers);
router.get("/search", searchPublishers);

export default router;