import { verifyToken } from "@clerk/express";
import { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";

//Map userId -> WebSocket
const onlineUsers = new Map<string, WebSocket>();

//Initialize socket server
export function initSocketServer(server: any) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    console.log("Client connected");

    //Extract token from query string: /ws?token=...
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(1008, "No token");
      return;
    }

    let userId: string;
    try {
      const decoded = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY
      });
      userId = decoded.sub ?? "";
      if (!userId) {
        throw new Error("Missing user id");
      }
    } catch (error) {
      console.error("ws verification error:", error);
      ws.close(1008, "Invalid token");
      return;
    }

    //Register user as online
    onlineUsers.set(userId, ws);
    await User.findByIdAndUpdate(userId, { isOnline: true });
    //broadcast user is Online
    broadcastOnlineStatus(userId, true);

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        // CALL SIGNALING

        if (msg.type === "call_offer") {
          const { receiverId, conversationId, offer, callType } = msg;

          if (conversationId) {
            handleConversationEvent(userId, conversationId, {
              type: "call_offer",
              senderId: userId,
              offer,
              callType,
            });
          } else if (receiverId) {
            const receiverWs = onlineUsers.get(receiverId);

            if (receiverWs?.readyState === WebSocket.OPEN) {
              receiverWs.send(
                JSON.stringify({
                  type: "call_offer",
                  senderId: userId,
                  offer,
                  callType,
                }),
              );
            }
          }
        }

        if (msg.type === "call_answer") {
          const { receiverId, conversationId, answer } = msg;

          if (conversationId) {
            handleConversationEvent(userId, conversationId, {
              type: "call_answer",
              senderId: userId,
              answer,
            });
          } else if (receiverId) {
            const receiverWs = onlineUsers.get(receiverId);

            if (receiverWs?.readyState === WebSocket.OPEN) {
              receiverWs.send(
                JSON.stringify({
                  type: "call_answer",
                  senderId: userId,
                  answer,
                }),
              );
            }
          }
        }

        if (msg.type === "ice_candidate") {
          const { receiverId, conversationId, candidate } = msg;

          if (conversationId) {
            handleConversationEvent(userId, conversationId, {
              type: "ice_candidate",
              senderId: userId,
              candidate,
            });
          } else if (receiverId) {
            const receiverWs = onlineUsers.get(receiverId);

            if (receiverWs?.readyState === WebSocket.OPEN) {
              receiverWs.send(
                JSON.stringify({
                  type: "ice_candidate",
                  senderId: userId,
                  candidate,
                }),
              );
            }
          }
        }

        if (msg.type === "call_end") {
          const { receiverId, conversationId } = msg;

          if (conversationId) {
            handleConversationEvent(userId, conversationId, {
              type: "call_end",
              senderId: userId,
            });
          } else if (receiverId) {
            const receiverWs = onlineUsers.get(receiverId);

            if (receiverWs?.readyState === WebSocket.OPEN) {
              receiverWs.send(
                JSON.stringify({
                  type: "call_end",
                  senderId: userId,
                }),
              );
            }
          }
        }
        //Forward message to receiver(s)
        if (msg.type === "message") {
          const { receiverId, conversationId, payload } = msg;
          if (conversationId) {
            //Direct message with conversationId
            handleConversationEvent(userId, conversationId, {type: "message", senderId: userId, payload})
          } else if (receiverId) {
            //Legacy direct message
            const receiverWs = onlineUsers.get(receiverId);
            if (receiverWs?.readyState === WebSocket.OPEN) {
              receiverWs.send(JSON.stringify({ type: "message", payload }));
            }
          }
        }

        //Forward typing indicator
        if (msg.type === "typing") {
          const { receiverId, conversationId, isTyping } = msg;
          if (conversationId) {
            //Update typing status in conversation
            handleConversationEvent(userId, conversationId, {type: "typing", senderId: userId, isTyping})
          } else if (receiverId) {
            //Legacy direct message
            const receiverWs = onlineUsers.get(receiverId);
            if (receiverWs?.readyState === WebSocket.OPEN) {
              receiverWs.send(
                JSON.stringify({ type: "typing", senderId: userId, isTyping }),
              );
            }
          }
        }
      } catch (error: any) {
        console.error("Error processing message:", error);
      }
    });
    ws.on("close", async () => {
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date(),
      });

      //broadcast user becomes offline
      broadcastOnlineStatus(userId, false);
    });
  });

  return wss;
}

function broadcastOnlineStatus(userId: string, isOnline: boolean) {
  const payload = JSON.stringify({ type: "online_status", userId, isOnline });
  onlineUsers.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

export async function handleConversationEvent(
  senderId: string,
  conversationId: string,
  event: any,
) {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;

    const payload = JSON.stringify(event);

    conversation.participants.forEach((pId)=>{
        const participantId = String(pId);
        if(participantId === senderId) return; //Don't send back to sender

        const ws = onlineUsers.get(participantId);
        if (ws?.readyState === WebSocket.OPEN){
            ws.send(payload)
        }
    })
  } catch (error) {
    console.error("Conversation event error:", error);
  }
}

export function broadcastUserUpdate(user: any) {
  const payload = JSON.stringify({ type: "user_update", user});
  onlineUsers.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

export {onlineUsers}