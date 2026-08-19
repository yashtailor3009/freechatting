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
import {
    AuthState,
    Conversation,
    Message,
    User,
    UserStory,
    WsEvent,
} from "../types";
// Fallback for API base URL. If you have a config file, replace this import accordingly.
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

export const api = axios.create({ baseURL: API_BASE_URL });

const _tokenRef = { current: null as string | null };

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

  const { user: clerkUser, isLoaded: userLoaded } = useUser();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  //attach Clerk token on every request
  useEffect(() => {
    const interceptor = api.interceptors.request.use(async (config) => {
      try {
        if (isSignedIn) {
          const token = await getTokenRef.current();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            _tokenRef.current = token;
          }
        }
      } catch (err) {
        console.error("Axios interceptor error:", err);
      }
      return config;
    });
    return () => {
      api.interceptors.request.eject(interceptor);
    };
  }, [isSignedIn]);

  //keep loacl AuthState in sync with Clerk profile state
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
      setAuth({ token: _tokenRef.current, user: mappedUser, loading: false });
    } else {
      setAuth({ token: null, user: null, loading: false });
    }
  }, [isSignedIn, authLoaded, userLoaded, clerkUser]);

  const logout = useCallback(async () => {
    _tokenRef.current = null;
    wsRef.current?.close();
    await signOut();
    setAuth({ token: null, user: null, loading: false });
    setConversations([]);
    setMessages([]);
    setSelectedConversation(null);
  }, [signOut]);

  const updateUser = useCallback(async (user: User) => {
    setAuth((prev) => ({ ...prev, user }));
  }, []);

  const fetchStories = useCallback(async () => {
    try {
      const { data } = await api.get("/api/stories");
      if (data.success) setUserStories(data.stories);
    } catch (error) {
      setTimeout(() => fetchStories(), 1000);
    }
  }, []);

  const sendWsEvent = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  //WebSocket lifecycle secured with dynamic Clerk token
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
          const event: WsEvent = JSON.parse(e.data);

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

          if (event.type === "typing") {
            const { senderId, isTyping } = event;
            if (senderId && isTyping !== undefined) {
              setTypingUsers((prev) => ({ ...prev, [senderId]: isTyping }));
            }
          }

          if (event.type === "online_status") {
            const { userId, isOnline } = event;
            if (userId && isOnline !== undefined) {
              setUsers((prev) =>
                prev.map((u) => (u._id === userId ? { ...u, isOnline } : u)),
              );
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.participant?._id === userId) {
                    return {
                      ...c,
                      participant: { ...c.participant, isOnline },
                    };
                  }
                  return c;
                }),
              );
            }
          }

          if (event.type === "user_update") {
            const updated = event.user as User;
            setUsers((prev) =>
              prev.map((u) => (u._id === updated._id ? updated : u)),
            );
            setConversations((prev) =>
              prev.map((c) =>
                c.participant?._id === updated._id
                  ? { ...c, participant: updated }
                  : c,
              ),
            );
            setSelectedConversation((prev) => {
              if (prev && prev.participant?._id === updated._id) {
                return { ...prev, participant: updated };
              }
              return prev;
            });
            setUserStories((prev) =>
              prev.map((us) =>
                us.user._id === updated._id ? { ...us, user: updated } : us,
              ),
            );
          }

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
        ws.onerror = () => ws?.close();
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
      }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
