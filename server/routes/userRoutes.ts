import { Router } from "express";
import {
  getProfile,
  getUsers,
  searchUsers,
  updateProfile,
  getUserById,
} from "../controllers/userController.js";
import upload from "../middlewares/upload.js";
import { authMiddleware } from "../middlewares/auth.js";

const userRouter = Router();

userRouter.use(authMiddleware);

userRouter.get("/", getUsers);
userRouter.get("/search", searchUsers);

// ✅ Specific routes FIRST
userRouter.get("/profile", getProfile);
userRouter.put("/profile", upload.single("avatar"), updateProfile);

// ✅ Generic route LAST
userRouter.get("/:userId", getUserById);

export default userRouter;