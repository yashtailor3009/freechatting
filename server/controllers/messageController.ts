import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import Conversation from "../models/Conversation.js";
import cloudinary from "../config/cloudinary.js";
import { Readable } from "stream";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { handleConversationEvent } from "../socket/socketManager.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findConversation(userId: string, otherId: string) {
  return Conversation.findOne({
    $and: [
      { participants: { $elemMatch: { $eq: userId } } },
      { participants: { $elemMatch: { $eq: otherId } } },
      { $expr: { $eq: [{ $size: "$participants" }, 2] } },
    ],
  } as any);
}

// Start or get a conversation with a user
export const getOrCreateConversation = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user!.id;

    // ✅ MUST MATCH ROUTE PARAM
    const targetUserId = String(req.params.userId);

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: "Target user ID is required",
      });
    }

    // Prevent chatting with yourself
    if (targetUserId === userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot start a conversation with yourself",
      });
    }

    // Check target user exists
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let conversation: any = await findConversation(userId, targetUserId);

    // Existing conversation
    if (conversation) {
      await conversation.populate("lastMessage");
    } else {
      // Create new conversation
      conversation = await Conversation.create({
        participants: [userId, targetUserId],
      });
    }

    const otherId =
      (conversation.participants as string[]).find(
        (p: string) => String(p) !== userId,
      ) || targetUserId;

    const otherUser = await User.findById(otherId).select(
      "name avatar handle isOnline lastSeen",
    );

    return res.status(200).json({
      success: true,
      conversation: {
        _id: conversation._id,
        participantId: otherId,
        participant: otherUser,
        lastMessage: conversation.lastMessage || null,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error creating/fetching conversation:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create/fetch conversation",
    });
  }
};

export const getConversations = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  try {
    const conversations = await Conversation.find({
      participants: { $in: [userId] },
    })
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    const shaped = await Promise.all(
      conversations.map(async (conversation) => {
        const otherId =
          (conversation.participants as string[]).find(
            (participantId: string) => String(participantId) !== String(userId),
          ) || "";

        const otherUser = await User.findById(otherId).select(
          "name avatar handle isOnline lastSeen",
        );

        const unreadCount = await Message.countDocuments({
          conversationId: conversation._id,
          receiver: userId,
          read: false,
        });

        return {
          _id: conversation._id,
          isGroup: false,
          participantId: otherId,
          participant: otherUser,
          lastMessage: conversation.lastMessage || null,
          updatedAt: conversation.updatedAt,
          unreadCount,
        };
      }),
    );

    return res.json({
      success: true,
      conversations: shaped,
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
    });
  }
};

export const getConversationById = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { conversationId } = req.params;

  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: { $in: [userId] },
    }).populate("lastMessage");

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const otherId =
      (conversation.participants as string[]).find(
        (p: string) => String(p) !== userId,
      ) || "";

    const otherUser = await User.findById(otherId).select(
      "name avatar handle isOnline lastSeen",
    );

    return res.json({
      success: true,
      conversation: {
        _id: conversation._id,
        participantId: otherId,
        participant: otherUser,
        lastMessage: conversation.lastMessage || null,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  const senderId = req.user!.id;
  const { receiverId, conversationId, text } = req.body;
  const file = req.file;

  if ((!receiverId && !conversationId) || (!text?.trim() && !file)) {
    return res.status(400).json({
      success: false,
      message: "receiverId/conversationId and (text or file) are required",
    });
  }

  let mediaUrl = "";
  let mediaType: "image" | "video" | undefined;

  if (file) {
    try {
      const resourceType = file.mimetype.startsWith("video")
        ? "video"
        : "image";

      mediaType = resourceType;

      const uploadsDir = path.join(process.cwd(), "uploads");

      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const safeFileName =
        file.originalname && file.originalname !== ""
          ? file.originalname
          : resourceType === "video"
            ? "video.mp4"
            : "image.jpg";

      const fileName = `${Date.now()}-${safeFileName}`;
      const filePath = path.join(uploadsDir, fileName);

      fs.writeFileSync(filePath, file.buffer);

      // Render backend URL
      const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";

      mediaUrl = `${backendUrl}/uploads/${fileName}`;
    } catch (err) {
      console.error("Error saving media:", err);

      return res.status(500).json({
        success: false,
        message: "Media upload failed",
      });
    }
  }

  let conversation;

  if (conversationId) {
    conversation = await Conversation.findOne({
      _id: conversationId,
      participants: { $in: [senderId] },
    });
  } else {
    conversation = await findConversation(senderId, receiverId);

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, receiverId],
      });
    }
  }

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: "Conversation not found",
    });
  }

  const validReceiverId =
    receiverId ||
    (conversation.participants as string[]).find(
      (p: string) => String(p) !== senderId,
    ) ||
    "";

  if (!validReceiverId) {
    return res.status(400).json({
      success: false,
      message: "Receiver ID is required",
    });
  }

  const message = await Message.create({
    sender: senderId,
    receiver: validReceiverId,
    conversationId: conversation._id,
    text: text?.trim() || "",
    mediaUrl: mediaUrl || undefined,
    mediaType,
  });

  conversation.lastMessage = message._id as any;
  conversation.updatedAt = new Date();

  await conversation.save();
  await conversation.populate("lastMessage");

  // Calculate the recipient's unread count after creating the message.
  // This lets the client update its conversation badge immediately
  // without waiting for a manual conversation-list refresh.
  const unreadCount = await Message.countDocuments({
    conversationId: conversation._id,
    receiver: validReceiverId,
    read: false,
  });

  // Send realtime message + unread count to the receiver.
  await handleConversationEvent(senderId, String(conversation._id), {
    type: "message",
    payload: message.toObject(),
    unreadCount,
    conversationId: String(conversation._id),
  });

  return res.status(201).json({
    success: true,
    message: { ...message.toObject() },
  });
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { conversationId } = req.params;

  res.setHeader("Cache-Control", "no-store");

  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: { $in: [userId] },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const messages = await Message.find({ conversationId }).sort({
      createdAt: 1,
    });

    await Message.updateMany(
      {
        conversationId,
        receiver: userId,
        read: false,
      },
      {
        read: true,
      },
    );

    return res.json({
      success: true,
      messages,
      conversation: {
        _id: conversation._id,
        participants: conversation.participants,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching messages:", error);

    return res.status(500).json({
      success: false,
      message: "Server error fetching messages",
    });
  }
};

export const deleteMessage = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { messageId } = req.params;

  try {
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    const conversation = await Conversation.findById(message.conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const isParticipant = (conversation.participants as string[]).some(
      (p: string) => String(p) === userId,
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to delete this message",
      });
    }

    await message.deleteOne();

    if (conversation.lastMessage?.toString() === messageId) {
      conversation.lastMessage = undefined;
      await conversation.save();
    }

    return res.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting message:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const deleteConversation = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { conversationId } = req.params;

  try {
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const isParticipant = (conversation.participants as string[]).some(
      (p: string) => String(p) === userId,
    );

    if (!isParticipant) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    await handleConversationEvent(userId, String(conversationId), {
      type: "chat_deleted",
      conversationId,
    });

    await Message.deleteMany({
      conversationId,
    });

    await Conversation.findByIdAndDelete(conversationId);

    return res.json({
      success: true,
      message: "Chat deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting conversation:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
