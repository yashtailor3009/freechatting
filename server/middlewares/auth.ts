import { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import User from "../models/User.js";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log("\n========== AUTH CHECK ==========");
    console.log("Path:", req.method, req.originalUrl);
    console.log(
      "Authorization:",
      req.headers.authorization ? "TOKEN RECEIVED" : "NO TOKEN RECEIVED"
    );

    const { isAuthenticated, userId, sessionId } = getAuth(req);

    console.log("User ID:", userId);
    console.log("Session ID:", sessionId);
    console.log("Authenticated:", isAuthenticated);
    
    if (!isAuthenticated || !userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthenticated",
      });
    }

    let localUser = await User.findById(userId);

    if (!localUser) {
      console.log("Syncing Clerk user:", userId);

      const clerkUser = await clerkClient.users.getUser(userId);

      const email =
        clerkUser.emailAddresses[0]?.emailAddress || "";

      const name =
        [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean)
          .join(" ") ||
        clerkUser.username ||
        "Anonymous";

      const baseHandle =
        clerkUser.username ||
        email.split("@")[0] ||
        `user${userId.slice(-6)}`;

      let finalHandle = baseHandle
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      if (!finalHandle) {
        finalHandle = `user${Date.now()}`;
      }

      let handleExists = await User.findOne({
        handle: finalHandle,
      });

      let counter = 1;

      while (handleExists) {
        const testHandle = `${finalHandle}${counter}`;

        handleExists = await User.findOne({
          handle: testHandle,
        });

        if (!handleExists) {
          finalHandle = testHandle;
          break;
        }

        counter++;
      }

      localUser = await User.create({
        _id: userId,
        name,
        email,
        handle: finalHandle,
        avatar: clerkUser.imageUrl || "",
        bio: "Hey there! I am using InstaChat.",
        isOnline: true,
        lastSeen: new Date(),
      });

      console.log("User created:", localUser._id);
    }

    req.user = {
      id: String(localUser._id),
      name: localUser.name,
      email: localUser.email,
    };

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};