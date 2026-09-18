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

    console.log("========================================");
    console.log("PROFILE UPDATE STARTED");
    console.log("========================================");

    console.log("User ID:", userId);
    console.log("Name:", name);
    console.log("Handle:", handle);
    console.log("Bio:", bio);
    console.log("Avatar received:", Boolean(file));

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // ==============================
    // NAME
    // ==============================
    if (typeof name === "string") {
      updateData.name = name.trim();
    }

    // ==============================
    // HANDLE
    // ==============================
    if (typeof handle === "string") {
      updateData.handle = handle
        .trim()
        .toLowerCase();
    }

    // ==============================
    // BIO
    // ==============================
    if (typeof bio === "string") {
      updateData.bio = bio.trim();
    }

    // ==============================
    // AVATAR
    // ==============================
    if (file) {
      console.log("----------------------------------------");
      console.log("AVATAR FILE RECEIVED");
      console.log("----------------------------------------");

      console.log("Original name:", file.originalname);
      console.log("MIME type:", file.mimetype);
      console.log("File size:", file.size);
      console.log(
        "Buffer available:",
        Boolean(file.buffer),
      );
      console.log(
        "Buffer length:",
        file.buffer?.length || 0,
      );

      // Make sure the actual image data exists.
      if (
        !file.buffer ||
        file.buffer.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Avatar file was received but contains no data",
        });
      }

      console.log("----------------------------------------");
      console.log("UPLOADING NEW AVATAR TO CLOUDINARY");
      console.log("----------------------------------------");

      // IMPORTANT:
      // Every upload gets a completely new public_id.
      // Therefore a new selected image will always
      // receive a new Cloudinary URL.
      const uniquePublicId =
        `avatar_${userId}_${Date.now()}`;

      console.log(
        "Cloudinary public_id:",
        uniquePublicId,
      );

      const uploadResult = await new Promise<any>(
        (resolve, reject) => {
          const uploadStream =
            cloudinary.uploader.upload_stream(
              {
                folder: "freechatting/avatars",

                // Force a NEW Cloudinary asset.
                public_id: uniquePublicId,

                resource_type: "image",

                // Do not reuse an existing asset.
                overwrite: false,

                // Make sure Cloudinary does not
                // derive the public ID from filename.
                use_filename: false,

                unique_filename: true,
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

                console.log(
                  "Cloudinary upload completed",
                );

                resolve(result);
              },
            );

          uploadStream.on(
            "error",
            (error) => {
              console.error(
                "Cloudinary stream error:",
                error,
              );

              reject(error);
            },
          );

          // Send the actual image buffer
          // received from Multer to Cloudinary.
          Readable.from(file.buffer).pipe(
            uploadStream,
          );
        },
      );

      // ==============================
      // VERIFY CLOUDINARY RESPONSE
      // ==============================
      if (!uploadResult?.secure_url) {
        throw new Error(
          "Cloudinary upload completed but no image URL was returned",
        );
      }

      console.log("----------------------------------------");
      console.log("NEW CLOUDINARY AVATAR URL:");
      console.log(uploadResult.secure_url);
      console.log("----------------------------------------");

      // Save EXACTLY the new Cloudinary URL
      // into MongoDB.
      updateData.avatar =
        uploadResult.secure_url;
    }

    // ==============================
    // UPDATE MONGODB
    // ==============================
    console.log("----------------------------------------");
    console.log("UPDATING MONGODB");
    console.log("----------------------------------------");

    console.log(
      "MongoDB update data:",
      updateData,
    );

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

    // User does not exist in MongoDB.
    if (!user) {
      console.error(
        "MongoDB user not found:",
        userId,
      );

      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    // ==============================
    // VERIFY SAVED DATA
    // ==============================
    console.log("----------------------------------------");
    console.log(
      "PROFILE UPDATED SUCCESSFULLY",
    );
    console.log("----------------------------------------");

    console.log("MongoDB user ID:", user._id);
    console.log("Saved name:", user.name);
    console.log("Saved handle:", user.handle);
    console.log("Saved bio:", user.bio);
    console.log("Saved avatar:", user.avatar);

    console.log("========================================");
    console.log("PROFILE UPDATE FINISHED");
    console.log("========================================");

    return res.json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error(
      "========================================",
    );
    console.error("PROFILE UPDATE ERROR:", error);
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