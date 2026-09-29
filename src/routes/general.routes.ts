import { Router } from "express";

const router = Router();

// Note: express.static serves Frontend/index.html for "/" first, so this handler is never reached
router.get("/", (req, res) => {
    res.send("Welcome to my Test API!");
});

router.get("/hello", (req, res) => {
    res.send("Hello Hamoodi!");
});

router.get("/about", (req, res) => {
    res.send("Test Test.");
});

export default router;
