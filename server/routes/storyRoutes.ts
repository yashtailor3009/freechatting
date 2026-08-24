import { Router } from "express";
import { createStory, getStories } from "../controllers/storyController.js";
import { authMiddleware } from "../middlewares/auth.js";
import upload from "../middlewares/upload.js";

const storyRouter = Router();

storyRouter.use(authMiddleware);

storyRouter.get("/", getStories);
storyRouter.post("/", upload.single("file"), createStory);

export default storyRouter;