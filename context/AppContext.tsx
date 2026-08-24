import { useAuth, useUser } from "@clerk/expo";
import axios from "axios";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { WS_URL } from "../constants/config";

import { AuthState, Conversation, Message, User, UserStory } from "../types";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000";

export const api = axios.create({
  baseURL: 'http://localhost:3000', 
  //timeout: 10000,
});

const _tokenRef = {
  current: null as string | null,
};

// CALL TYPES

export interface IncomingCall {
  senderId: string;
  conversationId?: string;
  offer: RTCSessionDescriptionInit;
  callType: "voice" | "video";
}

interface AppContextType {
  auth: AuthState;

  logout: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;

  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;

  userStories: UserStory[];
  setUserStories: React.Dispatch<React.SetStateAction<UserStory[]>>;

  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;

  selectedConversation: Conversation | null;
  setSelectedConversation: (c: Conversation | null) => void;

  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;

  fetchStories: () => Promise<void>;

  typingUsers: Record<string, boolean>;

  sendWsEvent: (data: object) => void;

  // CALL

  incomingCall: IncomingCall | null;
  setIncomingCall: React.Dispatch<React.SetStateAction<any>>;

  lastCallAnswer: RTCSessionDescriptionInit | null;
  setLastCallAnswer: React.Dispatch<
    React.SetStateAction<RTCSessionDescriptionInit | null>
  >;

  lastIceCandidate: RTCIceCandidateInit | null;
  setLastIceCandidate: React.Dispatch<
    React.SetStateAction<RTCIceCandidateInit | null>
  >;

  callEnded: boolean;
  setCallEnded: React.Dispatch<React.SetStateAction<boolean>>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    token: null,
    user: null,
    loading: true,
  });

  const [users, setUsers] = useState<User[]>([]);

  const { getToken, isLoaded: authLoaded, isSignedIn, signOut } = useAuth();
  const getTokenRef = useRef(getToken);

useEffect(() => {
  getTokenRef.current = getToken;
}, [getToken]);

  const { user: clerkUser, isLoaded: userLoaded } = useUser();

  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);

  const [userStories, setUserStories] = useState<UserStory[]>([]);

  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});

  // CALL STATES

  const [incomingCall, setIncomingCall] = useState<any>(null);

  const [lastCallAnswer, setLastCallAnswer] =
    useState<RTCSessionDescriptionInit | null>(null);

  const [lastIceCandidate, setLastIceCandidate] =
    useState<RTCIceCandidateInit | null>(null);

  const [callEnded, setCallEnded] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // AXIOS TOKEN

  useEffect(() => {
  const interceptor = api.interceptors.request.use(
    async (config) => {
      try {
        if (isSignedIn) {
          const token = await getTokenRef.current();

          if (token) {
            config.headers = config.headers ?? {};

            config.headers.Authorization =
              `Bearer ${token}`;

            _tokenRef.current = token;

            console.log(
              "Axios interceptor - token attached:",
              true
            );
          } else {
            console.log(
              "Axios: Clerk token not available"
            );
          }
        }
      } catch (error) {
        console.error(
          "Axios interceptor error:",
          error
        );
      }

      return config;
    }
  );

  return () => {
    api.interceptors.request.eject(interceptor);
  };
}, [isSignedIn]);

  // AUTH SYNC

  useEffect(() => {
    if (!authLoaded || !userLoaded) return;

    if (isSignedIn && clerkUser) {
      const mappedUser: User = {
        _id: clerkUser.id,

        name: clerkUser.fullName || "Anonymous",

        email: clerkUser.primaryEmailAddress?.emailAddress || "",

        handle:
          clerkUser.username ||
          clerkUser.primaryEmailAddress?.emailAddress.split("@")[0] ||
          clerkUser.id,

        avatar: clerkUser.imageUrl || "",

        bio:
          (clerkUser.publicMetadata?.bio as string) ||
          "Hey there! I am using InstaChat.",

        isOnline: true,

        lastSeen: new Date().toISOString(),
      };

      setAuth({
        token: _tokenRef.current,
        user: mappedUser,
        loading: false,
      });
    } else {
      setAuth({
        token: null,
        user: null,
        loading: false,
      });
    }
  }, [isSignedIn, authLoaded, userLoaded, clerkUser]);

  // LOGOUT

  const logout = useCallback(async () => {
    _tokenRef.current = null;

    wsRef.current?.close();

    await signOut();

    setAuth({
      token: null,
      user: null,
      loading: false,
    });

    setConversations([]);

    setMessages([]);

    setSelectedConversation(null);

    setIncomingCall(null);

    setLastCallAnswer(null);

    setLastIceCandidate(null);

    setCallEnded(false);
  }, [signOut]);

  // UPDATE USER

  const updateUser = useCallback(async (user: User) => {
    setAuth((prev) => ({
      ...prev,
      user,
    }));
  }, []);


    const fetchStories = useCallback(async () => {
    try {
      const { data } = await api.get("/api/stories");
      if (data.success) {
        setUserStories(data.stories || []);
      }
    } catch (error) {
      console.error("Failed to fetch stories:", error);
    }
  }, []);

  // SEND WEBSOCKET EVENT

  const sendWsEvent = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.log("WebSocket is not connected");
    }
  }, []);

  // WEBSOCKET

  useEffect(() => {
    if (!isSignedIn || !authLoaded || !userLoaded) {
      wsRef.current?.close();
      return;
    }

    let isMounted = true;

    let ws: WebSocket | null = null;

    const connectWs = async () => {
      try {
        const token = await getTokenRef.current();

        if (!token || !isMounted) return;

        ws = new WebSocket(`${WS_URL}/ws?token=${token}`);

        wsRef.current = ws;

        ws.onmessage = (e) => {
          const event: any = JSON.parse(e.data);

          // INCOMING CALL

          if (event.type === "call_offer") {
            console.log("Incoming call:", event);

            setCallEnded(false);

            setIncomingCall({
              senderId: event.senderId,
              conversationId: event.conversationId,
              offer: event.offer,
              callType: event.callType,
            });
          }

          // CALL ANSWER

          if (event.type === "call_answer") {
            console.log("Call answered:", event);
            setLastCallAnswer(event.answer);
          }

          // ICE CANDIDATE

          if (event.type === "ice_candidate") {
            setLastIceCandidate(event.candidate);
          }

          // CALL ENDED

          if (event.type === "call_end") {
            console.log("Call ended by remote user");

            setCallEnded(true);

            setIncomingCall(null);

            setLastCallAnswer(null);

            setLastIceCandidate(null);
          }

          // MESSAGE

          if (event.type === "message") {
            const incoming = event.payload as Message;

            setMessages((prev) => {
              if (
                prev.length > 0 &&
                prev[0].conversationId === incoming.conversationId
              ) {
                return [...prev, incoming];
              }

              return prev;
            });

            setConversations((prev) => {
              const exists = prev.some(
                (c) => c._id === incoming.conversationId,
              );

              if (!exists) {
                api
                  .get("/api/messages/conversations")
                  .then(({ data }) => {
                    if (data.success) {
                      setConversations(data.conversations);
                    }
                  })
                  .catch(console.error);

                return prev;
              }

              return prev
                .map((c) =>
                  c._id === incoming.conversationId
                    ? {
                        ...c,
                        lastMessage: incoming,
                        updatedAt: incoming.createdAt,
                      }
                    : c,
                )
                .sort(
                  (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
                );
            });
          }

          // TYPING

          if (event.type === "typing") {
            const { senderId, isTyping } = event;

            if (senderId && isTyping !== undefined) {
              setTypingUsers((prev) => ({
                ...prev,
                [senderId]: isTyping,
              }));
            }
          }

          // ONLINE STATUS

          if (event.type === "online_status") {
            const { userId, isOnline } = event;

            if (userId && isOnline !== undefined) {
              setUsers((prev) =>
                prev.map((u) =>
                  u._id === userId
                    ? {
                        ...u,
                        isOnline,
                      }
                    : u,
                ),
              );

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.participant?._id === userId) {
                    return {
                      ...c,

                      // Ensure participant satisfies the expected User type
                      participant: {
                        ...(c.participant as unknown as User),
                        isOnline,
                      },
                    } as Conversation;
                  }

                  return c;
                }),
              );
            }
          }

          // USER UPDATE

          if (event.type === "user_update") {
            const updated = event.user as User;

            setUsers((prev) =>
              prev.map((u) => (u._id === updated._id ? updated : u)),
            );

            setConversations((prev) =>
              prev.map((c) =>
                c.participant?._id === updated._id
                  ? {
                      ...c,
                      participant: updated,
                    }
                  : c,
              ),
            );

            setSelectedConversation((prev) => {
              if (prev && prev.participant?._id === updated._id) {
                return {
                  ...prev,
                  participant: updated,
                };
              }

              return prev;
            });

            setUserStories((prev) =>
              prev.map((us) =>
                us.user._id === updated._id
                  ? {
                      ...us,
                      user: updated,
                    }
                  : us,
              ),
            );
          }

          // CHAT DELETED

          if (event.type === "chat_deleted") {
            const { conversationId } = event;

            if (conversationId) {
              setConversations((prev) =>
                prev.filter((c) => c._id !== conversationId),
              );

              setSelectedConversation((prev) =>
                prev?._id === conversationId ? null : prev,
              );
            }
          }
        };

        ws.onerror = () => {
          console.log("WebSocket error");

          ws?.close();
        };
      } catch (err) {
        console.error("WS connect error:", err);
      }
    };

    connectWs();

    return () => {
      isMounted = false;

      ws?.close();
    };
  }, [isSignedIn, authLoaded, userLoaded]);

  return (
    <AppContext.Provider
      value={{
        auth,

        logout,

        updateUser,

        users,

        setUsers,

        conversations,

        setConversations,

        selectedConversation,

        setSelectedConversation,

        messages,

        setMessages,

        userStories,

        setUserStories,

        fetchStories,

        typingUsers,

        sendWsEvent,

        // CALL
        incomingCall,

        setIncomingCall,

        lastCallAnswer,

        setLastCallAnswer,

        lastIceCandidate,

        setLastIceCandidate,

        callEnded,

        setCallEnded,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);

  if (!ctx) {
    throw new Error("useApp must be used inside AppProvider");
  }

  return ctx;
}