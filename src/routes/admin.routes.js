import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import {
  getStatsOverview,
  getMapDistribution,
  getUserOverview,
  setUserStatus,
  updateUsername,
  getBooksMaintenance,
} from "../controllers/admin.controller.js";

const router = Router();

router.get("/stats/overview", requireAuth, requireAdmin, getStatsOverview);
router.get("/stats/map-distribution", requireAuth, requireAdmin, getMapDistribution);
router.get("/books/maintenance", requireAuth, requireAdmin, getBooksMaintenance);
router.get("/users/:id/overview", requireAuth, requireAdmin, getUserOverview);
router.patch("/users/:id/status", requireAuth, requireAdmin, setUserStatus);
router.patch("/users/:id/username", requireAuth, requireAdmin, updateUsername);

export default router;
