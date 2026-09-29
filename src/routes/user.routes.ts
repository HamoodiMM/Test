import { Router } from "express";
import { getUsers, getProfile } from "../controllers/user.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Both routes require a valid JWT
router.get("/users", requireAuth, getUsers);
router.get("/profile", requireAuth, getProfile);

export default router;
