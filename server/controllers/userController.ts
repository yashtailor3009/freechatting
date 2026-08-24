import { clerkClient } from "@clerk/express";
import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import User from "../models/User.js";

// Get current user's profile
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Try to find user in your database using _id
    let user = await User.findById(userId);

    if (!user) {
      // If user doesn't exist, create from Clerk
      const clerkUser = await clerkClient.users.getUser(userId);
      user = await User.create({
        _id: clerkUser.id,
        name: clerkUser.fullName || clerkUser.username || "User",
        email: clerkUser.emailAddresses[0]?.emailAddress || "",
        handle: clerkUser.username || `user_${Date.now()}`,
        avatar: clerkUser.imageUrl || "",
        isOnline: false,
        lastSeen: new Date(),
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
};

// Get user by ID (for fetching participant details)
export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const userIdString = Array.isArray(userId) ? userId[0] : userId;

    // Try to find user in your database using _id
    let user = await User.findById(userIdString);

    if (!user) {
      // If not in your DB, fetch from Clerk
      const clerkUser = await clerkClient.users.getUser(userIdString);
      user = await User.create({
        _id: clerkUser.id,
        name: clerkUser.fullName || clerkUser.username || "User",
        email: clerkUser.emailAddresses[0]?.emailAddress || "",
        handle: clerkUser.username || `user_${Date.now()}`,
        avatar: clerkUser.imageUrl || "",
        isOnline: false,
        lastSeen: new Date(),
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });
  }
};

// Get all users (for chat list)
export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Exclude current user, limit to 50 (using _id)
    const users = await User.find({
      _id: { $ne: userId },
    })
      .select("_id name handle avatar isOnline lastSeen")
      .limit(50)
      .sort({ name: 1 });

    res.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

// Search users by name, handle, or email
export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query; // Get search query from query param
    const userId = req.user!.id;

    if (!q || typeof q !== "string" || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const searchTerm = q.trim();

    const users = await User.find({
      $or: [
        { name: { $regex: searchTerm, $options: "i" } },
        { handle: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
      ],
      _id: { $ne: userId }, // Exclude current user (using _id)
    })
      .select("_id name handle avatar isOnline lastSeen")
      .limit(20)
      .sort({ name: 1 });

    res.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search users",
    });
  }
};

// Update current user's profile
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, handle, bio } = req.body;
    const file = req.file;

    // Build update object
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (name) updateData.name = name;
    if (handle) updateData.handle = handle;
    if (bio) updateData.bio = bio;

    // Use findByIdAndUpdate instead of findOneAndUpdate({ clerkId })
    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true, // Return updated document
      upsert: true, // Create if doesn't exist
      runValidators: true,
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
};