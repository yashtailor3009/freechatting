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

import { usePathname } from "expo-router";

import { API_BASE_URL, WS_URL } from "../constants/config";

import { AuthState, Conversation, Message, User, UserStory } from "../types";

const api = axios.create({

  baseURL: API_BASE_URL,

});

const tokenRef = {

  current: null as string | null,

};

type AuthAxiosRequestConfig = {
  __authRetry?: boolean;
  headers?: Record<string, any>;
  [key: string]: any;
};

export interface IncomingCall {

  senderId: string;

  conversationId?: string;

  offer: RTCSessionDescriptionInit;

  callType: "voice" | "video";

}

interface AppContextType {

  api: typeof api;

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

  unreadCounts: Record<string, number>;

  clearUnreadCount: (conversationId: string) => void;

  syncUnreadCounts: (items: Conversation[]) => void;

  fetchStories: () => Promise<void>;

  typingUsers: Record<string, boolean>;

  sendWsEvent: (data: object) => void;

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

  const [auth, setAuth]= useState<AuthState>({

    token: null,

    user: null,

    loading: true,

  });

  const [users, setUsers]= useState<User[]>([]);

  /*

   * IMPORTANT:

   * Keep the real state setter private.

   * The public setConversations below will always merge

   * the latest WebSocket presence into conversations.

   */

  const [conversations, setConversationState]= useState<Conversation[]>([]);

  const [selectedConversation, setSelectedConversation]=

    useState<Conversation | null>(null);

  const [messages, setMessages]= useState<Message[]>([]);

  const [unreadCounts, setUnreadCounts]= useState<Record<string, number>>({});

  const unreadCountsRef = useRef<Record<string, number>>({});

  const pathname = usePathname();

  const pathnameRef = useRef(pathname);

  useEffect(() => {

    pathnameRef.current = pathname;

  }, [pathname]);

  const [userStories, setUserStories]= useState<UserStory[]>([]);

  const [typingUsers, setTypingUsers]= useState<Record<string, boolean>>({});

  const [incomingCall, setIncomingCall]= useState<any>(null);

  const [lastCallAnswer, setLastCallAnswer]=

    useState<RTCSessionDescriptionInit | null>(null);

  const [lastIceCandidate, setLastIceCandidate]=

    useState<RTCIceCandidateInit | null>(null);

  const [callEnded, setCallEnded]= useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  /*

   * This is the single source of truth for LIVE

   * WebSocket presence on the client.

   *

   * Example:

   * Set {

   *   "user_abc",

   *   "user_xyz"

   * }

   *

   * means both users currently have an active

   * WebSocket connection.

   */

  const onlineUserIdsRef = useRef<Set<string>>(new Set());

  const { getToken, isLoaded: authLoaded, isSignedIn, signOut } = useAuth();

  const { user: clerkUser, isLoaded: userLoaded } = useUser();

  const getTokenRef = useRef(getToken);

  const signedInRef = useRef<boolean | undefined>(isSignedIn);

  const authLoadedRef = useRef(authLoaded);

  const userLoadedRef = useRef(userLoaded);

  useEffect(() => {

    getTokenRef.current = getToken;

  }, [getToken]);

  useEffect(() => {

    signedInRef.current = isSignedIn;

  }, [isSignedIn]);

  useEffect(() => {

    authLoadedRef.current = authLoaded;

  }, [authLoaded]);

  useEffect(() => {

    userLoadedRef.current = userLoaded;

  }, [userLoaded]);

  /*

   * =========================================================

   * AUTH TOKEN

   * =========================================================

   */

  const getAuthToken = useCallback(async (): Promise<string | null> => {

    if (!authLoadedRef.current || !userLoadedRef.current || !signedInRef.current) {
      return null;
    }

    try {
      // Always ask Clerk for the current token. Clerk handles refresh/rotation.
      const token = await getTokenRef.current();

      if (token) {
        tokenRef.current = token;
        return token;
      }

      return null;
    } catch (error) {
      console.error("Failed to get Clerk token:", error);
      tokenRef.current = null;
      return null;
    }
  }, []);

  const waitForAuthToken = useCallback(async (): Promise<string | null> => {
    const maxAttempts = 40;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (authLoadedRef.current && userLoadedRef.current && signedInRef.current) {
        const token = await getAuthToken();
        if (token) {
          return token;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
  }, [getAuthToken]);

  /*

   * =========================================================

   * AXIOS AUTH INTERCEPTOR

   * =========================================================

   */

  useEffect(() => {

    const requestInterceptor = api.interceptors.request.use(
      async (config) => {
        try {
          const token = await waitForAuthToken();

          if (!token) {
            console.log("Axios request blocked: Clerk authentication is not ready");
            return Promise.reject(new Error("Authentication token is not available"));
          }

          config.headers = config.headers ?? {};
          config.headers.Authorization = `Bearer ${token}`;

          console.log("Axios interceptor - token attached:", true);
          return config;
        } catch (error) {
          console.error("Axios authentication error:", error);
          return Promise.reject(error);
        }
      },
      (error) => Promise.reject(error),
    );

    const responseInterceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error?.config as AuthAxiosRequestConfig | undefined;

        if (
          error?.response?.status !== 401 ||
          !originalRequest ||
          originalRequest.__authRetry
        ) {
          return Promise.reject(error);
        }

        originalRequest.__authRetry = true;

        try {
          // Give Clerk a moment to finish session/token rotation, then retry once.
          await new Promise((resolve) => setTimeout(resolve, 250));
          const freshToken = await getAuthToken();

          if (!freshToken) {
            return Promise.reject(error);
          }

          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;

          console.log("Axios 401: refreshed Clerk token and retrying request");
          return api(originalRequest);
        } catch (refreshError) {
          console.error("Axios 401 token refresh failed:", refreshError);
          return Promise.reject(error);
        }
      },
    );

    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };

  }, [getAuthToken, waitForAuthToken]);

  /*

   * =========================================================

   * AUTH STATE

   * =========================================================

   */

  useEffect(() => {

    if (!authLoaded || !userLoaded) {

      setAuth((prev) => ({

        ...prev,

        loading: true,

      }));

      return;

    }

    if (isSignedIn && clerkUser) {

      void getAuthToken().then((token) => {
        if (token) {
          setAuth((prev) => ({ ...prev, token }));
        }
      });

      const mappedUser: User = {

        _id: clerkUser.id,

        name: clerkUser.fullName || "Anonymous",

        email: clerkUser.primaryEmailAddress?.emailAddress || "",

        handle:

          clerkUser.username ||

          clerkUser.primaryEmailAddress?.emailAddress.split("@")[0]||

          clerkUser.id,

        avatar: clerkUser.imageUrl || "",

        bio:

          (clerkUser.publicMetadata?.bio as string) ||

          "Hey there! I am using InstaChat.",

        isOnline: true,

        lastSeen: new Date().toISOString(),

      };

      setAuth({

        token: tokenRef.current,

        user: mappedUser,

        loading: false,

      });

    } else {

      tokenRef.current = null;

      setAuth({

        token: null,

        user: null,

        loading: false,

      });

    }

  }, [isSignedIn, authLoaded, userLoaded, clerkUser]);

  /*

   * =========================================================

   * LOGOUT

   * =========================================================

   */

  const logout = useCallback(async () => {

    try {

      tokenRef.current = null;

      onlineUserIdsRef.current.clear();

      wsRef.current?.close();

      wsRef.current = null;

      await signOut();

      setAuth({

        token: null,

        user: null,

        loading: false,

      });

      setUsers([]);

      setConversationState([]);

      setMessages([]);

      setSelectedConversation(null);

      setIncomingCall(null);

      setLastCallAnswer(null);

      setLastIceCandidate(null);

      setCallEnded(false);

      setTypingUsers({});

      setUnreadCounts({});

      unreadCountsRef.current = {};

    } catch (error) {

      console.error("Logout error:", error);

      throw error;

    }

  }, [signOut]);

  /*

   * =========================================================

   * UPDATE USER

   * =========================================================

   */

  const updateUser = useCallback(async (user: User) => {

    setAuth((prev) => ({

      ...prev,

      user,

    }));

  }, []);

  /*

   * =========================================================

   * PRESENCE HELPERS

   * =========================================================

   */

  const applyLivePresenceToConversations = useCallback(

    (list: Conversation[]): Conversation[]=> {

      return list.map((conversation) => {

        const participant = conversation.participant;

        if (!participant) {

          return conversation;

        }

        const participantId = String(participant._id);

        /*

         * IMPORTANT:

         *

         * Presence from the active WebSocket

         * wins over the old MongoDB value.

         */

        const isOnline = onlineUserIdsRef.current.has(participantId);

        return {

          ...conversation,

          participant: {

            ...participant,

            isOnline,

            /*

             * Keep lastSeen from the server

             * when available.

             */

            lastSeen: participant.lastSeen,

          },

        };

      });

    },

    [],

  );

  /*

   * =========================================================

   * UNREAD MESSAGE COUNTS

   * =========================================================

   */

  const syncUnreadCounts = useCallback((items: Conversation[]) => {

    setUnreadCounts((previous) => {

      const next = { ...previous };

      for (const item of items || []) {

        const conversationId = String(item._id);

        const serverUnread = (item as Conversation & { unreadCount?: number })

          .unreadCount;

        if (typeof serverUnread === "number") {

          next[conversationId]= serverUnread;

        }

      }

      unreadCountsRef.current = next;

      return next;

    });

  }, []);

  const clearUnreadCount = useCallback((conversationId: string) => {

    const id = String(conversationId);

    setUnreadCounts((previous) => {

      if (!(id in previous)) {

        return previous;

      }

      const next = { ...previous };

      delete next[id];

      unreadCountsRef.current = next;

      return next;

    });

  }, []);

  /*

   * PUBLIC CONVERSATION SETTER

   *

   * This is the key fix.

   *

   * Wherever the app calls:

   *

   * setConversations(data.conversations)

   *

   * or:

   *

   * setConversations(prev => ...)

   *

   * live WebSocket presence is reapplied before

   * the state is committed.

   */

  const setConversations = useCallback(

    (value: Conversation[]| ((prev: Conversation[]) => Conversation[])) => {

      setConversationState((previous) => {

        const next = typeof value === "function" ? value(previous) : value;

        return applyLivePresenceToConversations(next);

      });

    },

    [applyLivePresenceToConversations],

  );

  /*

   * =========================================================

   * STORIES

   * =========================================================

   */

  const fetchStories = useCallback(async () => {

    if (!authLoadedRef.current || !userLoadedRef.current) {

      return;

    }

    if (!signedInRef.current) {

      return;

    }

    try {

      const { data } = await api.get("/api/stories");

      if (data.success) {

        setUserStories(data.stories || []);

      }

    } catch (error: any) {

      if (

        error?.message === "Authentication token is not available" ||

        error?.response?.status === 401

      ) {

        console.log(

          "Stories request skipped because authentication is not ready",

        );

        return;

      }

      console.error("Failed to fetch stories:", error);

    }

  }, []);

  /*

   * =========================================================

   * SEND WEB SOCKET EVENT

   * =========================================================

   */

  const sendWsEvent = useCallback((data: object) => {

    if (wsRef.current?.readyState === WebSocket.OPEN) {

      wsRef.current.send(JSON.stringify(data));

    } else {

      console.log("WebSocket is not connected");

    }

  }, []);

  /*

   * =========================================================

   * WEB SOCKET CONNECTION

   * =========================================================

   */

  useEffect(() => {

    if (!authLoaded || !userLoaded || !isSignedIn) {

      wsRef.current?.close();

      wsRef.current = null;

      onlineUserIdsRef.current.clear();

      return;

    }

    let isMounted = true;

    let ws: WebSocket | null = null;

    const connectWs = async () => {

      try {

        const token = await getAuthToken();

        if (!token || !isMounted) {

          console.log("WebSocket waiting for authentication token");

          return;

        }

        /*

         * Create WebSocket using the current

         * authenticated Clerk token.

         */

        ws = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(token)}`);

        wsRef.current = ws;

        /*

         * ---------------------------------------------------

         * OPEN

         * ---------------------------------------------------

         */

        ws.onopen = () => {

          console.log("Client connected");

          /*

           * IMPORTANT:

           *

           * Do NOT call GET /api/users here.

           *

           * That API reads MongoDB's isOnline value,

           * which can be behind the real-time WebSocket

           * presence.

           *

           * The server sends:

           *

           * 1. online_status

           * 2. online_users

           *

           * and those events are now our live source.

           */

        };

        /*

         * ---------------------------------------------------

         * MESSAGE

         * ---------------------------------------------------

         */

        ws.onmessage = (e) => {

          try {

            const event: any = JSON.parse(e.data);

            console.log("WS EVENT RECEIVED:", event);

            /*

             * FULL ONLINE USER SNAPSHOT

             */

            if (event.type === "online_users") {

              const onlineIds = new Set<string>(

                (event.userIds || []).map((id: string) => String(id)),

              );

              /*

               * Store live presence.

               */

              onlineUserIdsRef.current = onlineIds;

              /*

               * Update global users list.

               */

              setUsers((prev) =>

                prev.map((user) => ({

                  ...user,

                  isOnline: onlineIds.has(String(user._id)),

                })),

              );

              /*

               * Update current conversations.

               *

               * The private state setter is used here

               * because we already know exactly what we

               * want to commit.

               */

              setConversationState((prev) =>

                applyLivePresenceToConversations(prev),

              );

              /*

               * Update currently opened conversation too.

               */

              setSelectedConversation((prev) => {

                if (!prev || !prev.participant) {

                  return prev;

                }

                const participantId = String(prev.participant._id);

                return {

                  ...prev,

                  participant: {

                    ...prev.participant,

                    isOnline: onlineIds.has(participantId),

                  },

                };

              });

              return;

            }

            /*

             * =================================================

             * CALL OFFER

             * =================================================

             */

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

            /*

             * =================================================

             * CALL ANSWER

             * =================================================

             */

            if (event.type === "call_answer") {

              console.log("Call answered:", event);

              setLastCallAnswer(event.answer);

            }

            /*

             * =================================================

             * ICE CANDIDATE

             * =================================================

             */

            if (event.type === "ice_candidate") {

              setLastIceCandidate(event.candidate);

            }

            /*

             * =================================================

             * CALL END

             * =================================================

             */

            if (event.type === "call_end") {

              console.log("Call ended by remote user");

              setCallEnded(true);

              setIncomingCall(null);

              setLastCallAnswer(null);

              setLastIceCandidate(null);

            }

            /*

             * =================================================

             * MESSAGE

             * =================================================

             */

            if (event.type === "message") {

              const incoming = event.payload as Message;

              /*

               * The server sends message events only to the

               * receiving user. Count the message as unread when

               * that conversation is not currently open.

               */

              if (incoming) {

                const conversationId = String(incoming.conversationId || "");

                const activeConversationId =

                  pathnameRef.current.match(/\/chat\/([^/]+)/)?.[1] || "";

                const isCurrentConversation =

                  !!conversationId && activeConversationId === conversationId;

                if (conversationId && !isCurrentConversation) {

                  setUnreadCounts((previous) => {

                    const next = {

                      ...previous,

                      [conversationId]: (previous[conversationId]|| 0) + 1,

                    };

                    unreadCountsRef.current = next;

                    return next;

                  });

                }

              }

              setMessages((prev) => {

                if (!incoming) {

                  return prev;

                }

                const isCurrentConversation =

                  prev.length > 0 &&

                  String(prev[0].conversationId) ===

                    String(incoming.conversationId);

                if (!isCurrentConversation) {

                  return prev;

                }

                const alreadyExists = prev.some(

                  (message) => message._id === incoming._id,

                );

                if (alreadyExists) {

                  return prev;

                }

                return [...prev, incoming];

              });

              setConversations((prev) => {

                const exists = prev.some(

                  (conversation) =>

                    conversation._id === incoming.conversationId,

                );

                if (!exists) {

                  api

                    .get("/api/messages/conversations")

                    .then(({ data }) => {

                      if (data.success) {

                        setConversations(data.conversations || []);

                      }

                    })

                    .catch((error) => {

                      console.error("Failed to refresh conversations:", error);

                    });

                  return prev;

                }

                return prev

                  .map((conversation) =>

                    conversation._id === incoming.conversationId

                      ? {

                          ...conversation,

                          lastMessage: incoming,

                          updatedAt: incoming.createdAt,

                        }

                      : conversation,

                  )

                  .sort(

                    (a, b) =>

                      new Date(b.updatedAt).getTime() -

                      new Date(a.updatedAt).getTime(),

                  );

              });

            }

            /*

             * =================================================

             * TYPING

             * =================================================

             */

            if (event.type === "typing") {

              const { senderId, isTyping } = event;

              if (senderId && isTyping !== undefined) {

                setTypingUsers((prev) => ({

                  ...prev,

                  [senderId]: isTyping,

                }));

              }

            }

            /*

             * =================================================

             * LIVE ONLINE / OFFLINE UPDATE

             * =================================================

             */

            if (event.type === "online_status") {

              const { userId, isOnline } = event;

              if (userId && isOnline !== undefined) {

                const userIdString = String(userId);

                /*

                 * Update our live presence set.

                 */

                if (isOnline) {

                  onlineUserIdsRef.current.add(userIdString);

                } else {

                  onlineUserIdsRef.current.delete(userIdString);

                }

                /*

                 * Update users.

                 */

                setUsers((prev) =>

                  prev.map((u) =>

                    String(u._id) === userIdString

                      ? {

                          ...u,

                          isOnline,

                        }

                      : u,

                  ),

                );

                /*

                 * Update conversations.

                 *

                 * We use the private state setter

                 * because this is a direct live update.

                 */

                setConversationState((prev) =>

                  prev.map((c) => {

                    if (

                      c.participant &&

                      String(c.participant._id) === userIdString

                    ) {

                      return {

                        ...c,

                        participant: {

                          ...c.participant,

                          isOnline,

                        },

                      };

                    }

                    return c;

                  }),

                );

                /*

                 * Update currently selected conversation.

                 */

                setSelectedConversation((prev) => {

                  if (!prev || !prev.participant) {

                    return prev;

                  }

                  if (String(prev.participant._id) !== userIdString) {

                    return prev;

                  }

                  return {

                    ...prev,

                    participant: {

                      ...prev.participant,

                      isOnline,

                    },

                  };

                });

              }

            }

            /*

             * =================================================

             * USER UPDATE

             * =================================================

             */

            if (event.type === "user_update") {

              const updated = event.user as User;

              if (!updated) {

                return;

              }

              /*

               * Preserve real-time presence.

               *

               * A profile update should not accidentally

               * change an online user back to offline.

               */

              const updatedUser: User = {

                ...updated,

                isOnline: onlineUserIdsRef.current.has(String(updated._id)),

              };

              setUsers((prev) =>

                prev.map((u) =>

                  String(u._id) === String(updatedUser._id) ? updatedUser : u,

                ),

              );

              setConversationState((prev) =>

                prev.map((c) =>

                  c.participant &&

                  String(c.participant._id) === String(updatedUser._id)

                    ? {

                        ...c,

                        participant: {

                          ...updatedUser,

                        },

                      }

                    : c,

                ),

              );

              setSelectedConversation((prev) => {

                if (

                  prev &&

                  prev.participant &&

                  String(prev.participant._id) === String(updatedUser._id)

                ) {

                  return {

                    ...prev,

                    participant: {

                      ...updatedUser,

                    },

                  };

                }

                return prev;

              });

              setUserStories((prev) =>

                prev.map((us) =>

                  String(us.user._id) === String(updatedUser._id)

                    ? {

                        ...us,

                        user: updatedUser,

                      }

                    : us,

                ),

              );

            }

            /*

             * =================================================

             * CHAT DELETED

             * =================================================

             */

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

          } catch (error) {

            console.error("WebSocket message error:", error);

          }

        };

        /*

         * ---------------------------------------------------

         * ERROR

         * ---------------------------------------------------

         */

        ws.onerror = () => {

          console.log("WebSocket error");

        };

        /*

         * ---------------------------------------------------

         * CLOSE

         * ---------------------------------------------------

         */

        ws.onclose = () => {

          console.log("WebSocket disconnected");

          if (wsRef.current === ws) {

            wsRef.current = null;

          }

        };

      } catch (error) {

        console.error("WS connect error:", error);

      }

    };

    connectWs();

    return () => {

      isMounted = false;

      /*

       * Do not clear live presence here immediately.

       *

       * The server will send online_status(false)

       * after the WebSocket actually closes.

       */

      ws?.close();

      if (wsRef.current === ws) {

        wsRef.current = null;

      }

    };

  }, [isSignedIn, authLoaded, userLoaded, getAuthToken]);

  /*

   * =========================================================

   * FETCH STORIES ON AUTH

   * =========================================================

   */

  useEffect(() => {

    if (!authLoaded || !userLoaded || !isSignedIn) {

      return;

    }

    const timer = setTimeout(() => {

      fetchStories();

    }, 300);

    return () => clearTimeout(timer);

  }, [authLoaded, userLoaded, isSignedIn, fetchStories]);

  /*

   * =========================================================

   * PROVIDER

   * =========================================================

   */

  return (

    <AppContext.Provider

      value={{

        api,

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

        unreadCounts,

        clearUnreadCount,

        syncUnreadCounts,

        userStories,

        setUserStories,

        fetchStories,

        typingUsers,

        sendWsEvent,

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
