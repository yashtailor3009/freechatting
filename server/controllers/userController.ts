import { clerkClient } from "@clerk/express";
import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import User from "../models/User.js";
import cloudinary from "../config/cloudinary.js";
import { Readable } from "stream";

export const getProfile = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user!.id;

    let user = await User.findById(userId);

    if (!user) {
      const clerkUser = await clerkClient.users.getUser(userId);

      user = await User.create({
        _id: clerkUser.id,
        name:
          clerkUser.fullName ||
          clerkUser.username ||
          "User",
        email:
          clerkUser.emailAddresses[0]?.emailAddress || "",
        handle:
          clerkUser.username ||
          `user_${Date.now()}`,
        avatar: clerkUser.imageUrl || "",
        isOnline: false,
        lastSeen: new Date(),
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
};

export const getUserById = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { userId } = req.params;

    const userIdString = Array.isArray(userId)
      ? userId[0]
      : userId;

    let user = await User.findById(userIdString);

    if (!user) {
      const clerkUser =
        await clerkClient.users.getUser(userIdString);

      user = await User.create({
        _id: clerkUser.id,
        name:
          clerkUser.fullName ||
          clerkUser.username ||
          "User",
        email:
          clerkUser.emailAddresses[0]?.emailAddress || "",
        handle:
          clerkUser.username ||
          `user_${Date.now()}`,
        avatar: clerkUser.imageUrl || "",
        isOnline: false,
        lastSeen: new Date(),
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });
  }
};

export const getUsers = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user!.id;

    const users = await User.find({
      _id: { $ne: userId },
    })
      .select(
        "_id name handle avatar isOnline lastSeen",
      )
      .limit(50)
      .sort({ name: 1 });

    return res.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

export const searchUsers = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { q } = req.query;
    const userId = req.user!.id;

    if (
      !q ||
      typeof q !== "string" ||
      q.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const searchTerm = q.trim();

    const users = await User.find({
      $or: [
        {
          name: {
            $regex: searchTerm,
            $options: "i",
          },
        },
        {
          handle: {
            $regex: searchTerm,
            $options: "i",
          },
        },
        {
          email: {
            $regex: searchTerm,
            $options: "i",
          },
        },
      ],
      _id: {
        $ne: userId,
      },
    })
      .select(
        "_id name handle avatar isOnline lastSeen",
      )
      .limit(20)
      .sort({ name: 1 });

    return res.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error searching users:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to search users",
    });
  }
};

export const updateProfile = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user!.id;
    const { name, handle, bio } = req.body;
    const file = req.file;

    console.log("Profile update started");
    console.log("User ID:", userId);
    console.log("Name:", name);
    console.log("Handle:", handle);
    console.log("Bio:", bio);
    console.log("Avatar received:", Boolean(file));

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (typeof name === "string") {
      updateData.name = name.trim();
    }

    if (typeof handle === "string") {
      updateData.handle = handle.trim().toLowerCase();
    }

    if (typeof bio === "string") {
      updateData.bio = bio.trim();
    }

    if (file) {
      console.log("Avatar details:", {
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
      });

      console.log("Uploading avatar to Cloudinary");

      const uploadResult = await new Promise<any>(
        (resolve, reject) => {
          const uploadStream =
            cloudinary.uploader.upload_stream(
              {
                folder: "freechatting/avatars",
                resource_type: "image",
              },
              (error, result) => {
                if (error) {
                  console.error(
                    "Cloudinary upload error:",
                    error,
                  );
                  reject(error);
                  return;
                }

                resolve(result);
              },
            );

          uploadStream.on("error", (error) => {
            console.error(
              "Cloudinary stream error:",
              error,
            );
            reject(error);
          });

          Readable.from(file.buffer).pipe(
            uploadStream,
          );
        },
      );

      if (!uploadResult?.secure_url) {
        throw new Error(
          "Cloudinary upload completed but no image URL was returned",
        );
      }

      updateData.avatar = uploadResult.secure_url;

      console.log(
        "Avatar uploaded successfully:",
        uploadResult.secure_url,
      );
    }

    console.log("Updating MongoDB");

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    console.log("Profile updated successfully");
    console.log("Saved avatar:", user.avatar);

    return res.json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error("Profile update error:", error);

    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to update profile",
    });
  }
};