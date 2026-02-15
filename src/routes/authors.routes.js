import { Router } from "express";
import { getAllAuthors, searchAuthors } from "../controllers/authors.controller.js";

const router = Router();

router.get("/search", searchAuthors);
router.get("/", getAllAuthors);


export default router;