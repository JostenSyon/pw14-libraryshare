import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import {
  getMe,
  updateMe,
  deleteMe,
  getUsers,
  getTrustedUsers,
  setTrustedUser,
  setMyLocation,
  getMyLocationStatus,
  deleteMyLocation,
  getAdmins,
  setAdminUser,
} from "../controllers/users.controller.js";

const router = Router();

router.get("/" , requireAdmin, getUsers);
router.get("/me", requireAuth, getMe);
router.put("/me", requireAuth, updateMe);
router.delete("/me", requireAuth, deleteMe); // soft delete dell'utente loggato

router.post("/me/location", requireAuth, setMyLocation);
router.get("/me/location", requireAuth, getMyLocationStatus);
router.delete("/me/location", requireAuth, deleteMyLocation);

router.get("/trusted", requireAdmin, getTrustedUsers);
router.patch("/trusted", requireAdmin, setTrustedUser);

router.get("/admins", requireAdmin, getAdmins);
router.patch("/admins", requireAdmin, setAdminUser);

export default router;