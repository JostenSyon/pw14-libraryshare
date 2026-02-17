import { Router } from "express";
import multer from "multer";
import { requireAdmin } from "../middleware/admin.js";
import { requireAuth , requireUserLocation} from "../middleware/auth.js";
import {
  createBook,
  createBooksBulk,
  updateBook,
  deleteBook,
  getAllBooks,
  getBookByIsbn,
  restoreBook,
  uploadBookCover,
  searchBooksNearMe,
  incrementBookView,
  lookupBookByIsbnOpenLibrary,
  importBookByIsbnOpenLibrary,
  importBookFromOpenLibraryData,
  importBookDescriptionFromOpenLibrary,
  importBookCoverFromOpenLibrary,
  suggestBooks,
} from "../controllers/books.controller.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

router.get("/",getAllBooks);
router.get("/admin/", requireAdmin,getAllBooks);
router.get("/search", requireAuth, requireUserLocation, searchBooksNearMe);
router.get("/suggest", requireAuth, suggestBooks);
router.get("/lookup/openlibrary/:isbn", requireAuth, lookupBookByIsbnOpenLibrary);
router.post("/import/openlibrary", requireAuth, importBookFromOpenLibraryData);
router.post("/import/openlibrary/:isbn", requireAuth, importBookByIsbnOpenLibrary);
router.post("/:isbn/import-description/openlibrary", requireAdmin, importBookDescriptionFromOpenLibrary);
router.post("/:isbn/import-cover/openlibrary", requireAdmin, importBookCoverFromOpenLibrary);
router.post("/:isbn/view", incrementBookView);
router.get("/:isbn", getBookByIsbn);
router.post("/", requireAdmin, createBook);
router.post("/bulk", requireAdmin, createBooksBulk);
router.put("/:isbn", requireAdmin, updateBook);
router.post("/:isbn/cover", requireAdmin, upload.single("cover"), uploadBookCover);
router.delete("/:isbn", requireAdmin, deleteBook);
router.post("/:isbn/restore", requireAdmin, restoreBook);


export default router;
