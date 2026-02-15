import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getMyBooks,
  addMyBook,
  setMyBookAvailability,
  removeMyBook
} from "../controllers/userBooks.controller.js";

const router = Router();

router.get("/me/books", requireAuth, getMyBooks);
router.post("/me/books", requireAuth, addMyBook);
router.patch("/me/books/:isbn/availability", requireAuth, setMyBookAvailability);
router.delete("/me/books/:isbn", requireAuth, removeMyBook);

export default router;