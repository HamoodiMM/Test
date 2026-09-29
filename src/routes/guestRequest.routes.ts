import { Router } from "express";
import { createGuestRequest } from "../controllers/guestRequest.controller";
import { guestRequestLimiter } from "../middleware/rateLimiters";

const router = Router();

router.post("/requests", guestRequestLimiter, createGuestRequest);

export default router;
