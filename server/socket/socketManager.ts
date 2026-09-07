import { verifyToken } from "@clerk/express";
import { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";

// userId -> all active WebSocket connections for that user
const onlineUsers = new Map<string, Set<WebSocket>>();

function addOnlineSocket(userId: string, ws: WebSocket): number {
  let sockets = onlineUsers.get(userId);

  if (!sockets) {
    sockets = new Set<WebSocket>();
    onlineUsers.set(userId, sockets);
  }

  sockets.add(ws);
  return sockets.size;
}

function removeOnlineSocket(userId: string, ws: WebSocket): number {
  const sockets = onlineUsers.get(userId);

  if (!sockets) {
    return 0;
  }

  sockets.delete(ws);

  if (sockets.size === 0) {
    onlineUsers.delete(userId);
    return 0;
  }

  return sockets.size;
}

function cleanupClosedSockets(): void {
  for (const [userId, sockets] of onlineUsers.entries()) {
    for (const ws of sockets) {
      if (
        ws.readyState === WebSocket.CLOSED ||
        ws.readyState === WebSocket.CLOSING
      ) {
        sockets.delete(ws);
      }
    }

    if (sockets.size === 0) {
      onlineUsers.delete(userId);
    }
  }
}

function getOnlineUserIds(): string[] {
  cleanupClosedSockets();

  const ids: string[] = [];

  for (const [userId, sockets] of onlineUsers.entries()) {
    const hasOpenSocket = Array.from(sockets).some(
      (ws) => ws.readyState === WebSocket.OPEN,
    );

    if (hasOpenSocket) {
      ids.push(userId);
    } else {
      onlineUsers.delete(userId);
    }
  }

  return ids;
}

function sendToUser(userId: string, payload: string): void {
  const sockets = onlineUsers.get(userId);

  if (!sockets) {
    return;
  }

  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function initSocketServer(server: any) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
  });

  // Server-side heartbeat for all connected clients.
  const cleanupInterval = setInterval(async () => {
    let presenceChanged = false;

    for (const [userId, sockets] of onlineUsers.entries()) {
      for (const ws of Array.from(sockets)) {
        if (ws.readyState !== WebSocket.OPEN) {
          sockets.delete(ws);
          presenceChanged = true;
          continue;
        }

        const socketState = ws as WebSocket & {
          isAlive?: boolean;
        };

        if (socketState.isAlive === false) {
          console.log("💀 Dead WebSocket:", userId);
          ws.terminate();
          sockets.delete(ws);
          presenceChanged = true;
          continue;
        }

        socketState.isAlive = false;
        ws.ping();
      }

      if (sockets.size === 0) {
        onlineUsers.delete(userId);

        try {
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
          });
        } catch (error) {
          console.error(
            "Presence cleanup DB error:",
            userId,
            error,
          );
        }
      }
    }

    if (presenceChanged) {
      broadcastOnlineUsers();
    }
  }, 15000);

  wss.on(
    "connection",
    async (ws: WebSocket, req: IncomingMessage) => {
      console.log("=================================");
      console.log("🔌 WebSocket client connected");

      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );

      const token = url.searchParams.get("token");

      if (!token) {
        console.log("❌ WS rejected: No token");
        ws.close(1008, "No token");
        return;
      }

      let userId = "";

      try {
        const decoded = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });

        userId = decoded.sub ?? "";

        if (!userId) {
          throw new Error("Missing user id");
        }
      } catch (error) {
        console.error("❌ WS verification error:", error);
        ws.close(1008, "Invalid token");
        return;
      }

      console.log("✅ WS authenticated user:", userId);

      // Track this socket.
      const connectionCount = addOnlineSocket(userId, ws);

      const socketState = ws as WebSocket & {
        isAlive?: boolean;
      };

      socketState.isAlive = true;

      ws.on("pong", () => {
        socketState.isAlive = true;
      });

      await User.findByIdAndUpdate(
        userId,
        {
          isOnline: true,
          lastSeen: new Date(),
        },
        { new: false },
      );

      console.log(
        "🟢 User ONLINE:",
        userId,
        "connections:",
        connectionCount,
      );

      // Send the same authoritative presence snapshot to every
      // connected client. This prevents desktop/mobile clients
      // from keeping different online-state snapshots.
      broadcastOnlineUsers();

      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());

          // =============================================
          // CALL OFFER
          // =============================================

          if (msg.type === "call_offer") {
            const {
              receiverId,
              conversationId,
              offer,
              callType,
            } = msg;

            if (conversationId) {
              void handleConversationEvent(
                userId,
                conversationId,
                {
                  type: "call_offer",
                  senderId: userId,
                  offer,
                  callType,
                },
              );
            } else if (receiverId) {
              sendToUser(
                receiverId,
                JSON.stringify({
                  type: "call_offer",
                  senderId: userId,
                  offer,
                  callType,
                }),
              );
            }
          }

          // =============================================
          // CALL ANSWER
          // =============================================

          if (msg.type === "call_answer") {
            const {
              receiverId,
              conversationId,
              answer,
            } = msg;

            if (conversationId) {
              void handleConversationEvent(
                userId,
                conversationId,
                {
                  type: "call_answer",
                  senderId: userId,
                  answer,
                },
              );
            } else if (receiverId) {
              sendToUser(
                receiverId,
                JSON.stringify({
                  type: "call_answer",
                  senderId: userId,
                  answer,
                }),
              );
            }
          }

          // =============================================
          // ICE CANDIDATE
          // =============================================

          if (msg.type === "ice_candidate") {
            const {
              receiverId,
              conversationId,
              candidate,
            } = msg;

            if (conversationId) {
              void handleConversationEvent(
                userId,
                conversationId,
                {
                  type: "ice_candidate",
                  senderId: userId,
                  candidate,
                },
              );
            } else if (receiverId) {
              sendToUser(
                receiverId,
                JSON.stringify({
                  type: "ice_candidate",
                  senderId: userId,
                  candidate,
                }),
              );
            }
          }

          // =============================================
          // CALL END
          // =============================================

          if (msg.type === "call_end") {
            const {
              receiverId,
              conversationId,
            } = msg;

            if (conversationId) {
              void handleConversationEvent(
                userId,
                conversationId,
                {
                  type: "call_end",
                  senderId: userId,
                },
              );
            } else if (receiverId) {
              sendToUser(
                receiverId,
                JSON.stringify({
                  type: "call_end",
                  senderId: userId,
                }),
              );
            }
          }

          // =============================================
          // MESSAGE
          // =============================================

          if (msg.type === "message") {
            const {
              receiverId,
              conversationId,
              payload,
            } = msg;

            if (conversationId) {
              void handleConversationEvent(
                userId,
                conversationId,
                {
                  type: "message",
                  senderId: userId,
                  payload,
                },
              );
            } else if (receiverId) {
              sendToUser(
                receiverId,
                JSON.stringify({
                  type: "message",
                  payload,
                }),
              );
            }
          }

          // =============================================
          // TYPING
          // =============================================

          if (msg.type === "typing") {
            const {
              receiverId,
              conversationId,
              isTyping,
            } = msg;

            if (conversationId) {
              void handleConversationEvent(
                userId,
                conversationId,
                {
                  type: "typing",
                  senderId: userId,
                  isTyping,
                },
              );
            } else if (receiverId) {
              sendToUser(
                receiverId,
                JSON.stringify({
                  type: "typing",
                  senderId: userId,
                  isTyping,
                }),
              );
            }
          }
        } catch (error) {
          console.error(
            "❌ Error processing WS message:",
            error,
          );
        }
      });

      // ---------------------------------------------------
      // CLOSE
      // ---------------------------------------------------

      ws.on("close", async () => {
        const remainingConnections =
          removeOnlineSocket(userId, ws);

        console.log(
          "🔌 WebSocket closed:",
          userId,
          "remaining connections:",
          remainingConnections,
        );

        // Mark offline only when the user's last socket closes.
        if (remainingConnections === 0) {
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
          });

          console.log(
            "🔴 User OFFLINE:",
            userId,
          );

          broadcastOnlineUsers();
        }
      });

      ws.on("error", (error) => {
        console.error(
          "❌ WebSocket error:",
          userId,
          error,
        );
      });
    },
  );

  wss.on("close", () => {
    clearInterval(cleanupInterval);
  });

  return wss;
}

// =========================================================
// BROADCAST ONLINE STATUS
// =========================================================

function broadcastOnlineUsers(): void {
  const onlineUserIds = getOnlineUserIds();

  const payload = JSON.stringify({
    type: "online_users",
    userIds: onlineUserIds,
  });

  console.log(
    "📡 Broadcasting online users:",
    onlineUserIds,
  );

  onlineUsers.forEach((sockets) => {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  });
}

// =========================================================
// CONVERSATION EVENTS
// =========================================================

export async function handleConversationEvent(
  senderId: string,
  conversationId: string,
  event: any,
): Promise<void> {
  try {
    const conversation =
      await Conversation.findById(conversationId);

    if (!conversation) {
      return;
    }

    const payload = JSON.stringify(event);

    conversation.participants.forEach(
      (participantIdValue) => {
        const participantId =
          String(participantIdValue);

        if (participantId === senderId) {
          return;
        }

        sendToUser(
          participantId,
          payload,
        );
      },
    );
  } catch (error) {
    console.error(
      "Conversation event error:",
      error,
    );
  }
}

// =========================================================
// BROADCAST USER UPDATE
// =========================================================

export function broadcastUserUpdate(user: any): void {
  cleanupClosedSockets();

  const payload = JSON.stringify({
    type: "user_update",
    user,
  });

  onlineUsers.forEach((sockets) => {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  });
}

export { onlineUsers };
