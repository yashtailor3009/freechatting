import { Router } from "express";
import {
  getConversations,
  getConversationById, 
  getMessages,
  sendMessage,
  deleteConversation,
  getOrCreateConversation,
  deleteMessage,
} from "../controllers/messageController.js";
import { authMiddleware } from "../middlewares/auth.js";
import upload from "../middlewares/upload.js"; 

const messageRouter = Router();

messageRouter.use(authMiddleware);

messageRouter.get("/conversations", getConversations);
messageRouter.post("/conversations/get-or-create", getOrCreateConversation); 

messageRouter.get("/conversations/:conversationId/messages", getMessages); 
messageRouter.get("/conversations/:conversationId", getConversationById);

messageRouter.post("/send", upload.single("file"), sendMessage); 

messageRouter.delete("/messages/:messageId", deleteMessage); 
messageRouter.delete("/conversations/:conversationId", deleteConversation);

export default messageRouter;