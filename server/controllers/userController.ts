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
      const clerkUser =
        await clerkClient.users.getUser(userId);

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

    console.log("========================================");
    console.log("PROFILE UPDATE STARTED");
    console.log("User ID:", userId);
    console.log("Name:", name);
    console.log("Handle:", handle);
    console.log("Bio:", bio);
    console.log("Avatar received:", Boolean(file));

    if (file) {
      console.log("Avatar details:", {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });
    }

    // --------------------------------------------------
    // 1. Find existing MongoDB user
    // --------------------------------------------------

    const user = await User.findById(userId);

    if (!user) {
      console.error(
        "Profile update failed: user not found",
        userId,
      );

      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    console.log("Existing avatar:", user.avatar);

    // --------------------------------------------------
    // 2. Update normal profile fields
    // --------------------------------------------------

    if (typeof name === "string") {
      user.name = name.trim();
    }

    if (typeof handle === "string") {
      user.handle = handle.trim().toLowerCase();
    }

    if (typeof bio === "string") {
      user.bio = bio.trim();
    }

    // --------------------------------------------------
    // 3. Upload new avatar
    // --------------------------------------------------

    if (file) {
      console.log("Uploading NEW avatar to Cloudinary...");

      const uploadResult = await new Promise<any>(
        (resolve, reject) => {
          const uploadStream =
            cloudinary.uploader.upload_stream(
              {
                folder: "freechatting/avatars",
                resource_type: "image",
                unique_filename: true,
                use_filename: false,
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
          "Cloudinary upload completed but no secure URL was returned",
        );
      }

      const newAvatarUrl =
        uploadResult.secure_url;

      console.log(
        "NEW CLOUDINARY URL:",
        newAvatarUrl,
      );

      // ------------------------------------------------
      // IMPORTANT:
      // Save the NEW Cloudinary URL directly
      // into the MongoDB document.
      // ------------------------------------------------

      user.avatar = newAvatarUrl;

      console.log(
        "Avatar assigned to MongoDB user:",
        user.avatar,
      );
    }

    // --------------------------------------------------
    // 4. Save MongoDB document
    // --------------------------------------------------

    user.updatedAt = new Date();

    console.log("Saving MongoDB user...");

    await user.save();

    console.log(
      "MongoDB save completed.",
    );

    console.log(
      "Avatar after save:",
      user.avatar,
    );

    // --------------------------------------------------
    // 5. Read the document again from MongoDB
    // --------------------------------------------------

    const freshUser =
      await User.findById(userId);

    if (!freshUser) {
      throw new Error(
        "User disappeared after profile update",
      );
    }

    console.log(
      "Fresh avatar read from MongoDB:",
      freshUser.avatar,
    );

    console.log(
      "PROFILE UPDATE COMPLETED",
    );

    console.log("========================================");

    // --------------------------------------------------
    // 6. Return freshly-read MongoDB user
    // --------------------------------------------------

    return res.json({
      success: true,
      message: "Profile updated successfully",
      user: freshUser,
    });
  } catch (error) {
    console.error(
      "========================================",
    );

    console.error(
      "PROFILE UPDATE ERROR:",
      error,
    );

    console.error(
      "========================================",
    );

    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to update profile",
    });
  }
};