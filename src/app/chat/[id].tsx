import { styles } from "../../../assets/styles/ChatScreen.styles";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import Avatar from "../../../components/Avatar";
import Bubble from "../../../components/Bubble";
import { Colors } from "../../../constants/Colors";
import { useApp } from "../../../context/AppContext";
import { Message } from "../../../types";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    api,
    auth,
    messages,
    users,
    conversations,
    selectedConversation,
    setSelectedConversation,
    typingUsers,
    setConversations,
    setMessages,
    sendWsEvent,
  } = useApp();

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaMime, setMediaMime] = useState<string>("image/jpeg");
  const [mediaName, setMediaName] = useState<string>("media.jpg");

  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);

  const flatListRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * =========================================================
   * CURRENT CONVERSATION
   * =========================================================
   *
   * First use selectedConversation.
   * Otherwise find it from conversations list.
   */

  const currentConversation =
    selectedConversation && String(selectedConversation._id) === String(id)
      ? selectedConversation
      : conversations.find(
          (conversation) => String(conversation._id) === String(id),
        );

  const partner = currentConversation?.participant;

  /*
   * =========================================================
   * UNIQUE MESSAGES
   * =========================================================
   */

  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    const result: Message[] = [];

    for (const message of messages || []) {
      if (!message) continue;

      /*
       * Only show messages belonging to
       * the currently opened conversation.
       */
      if (
        message.conversationId &&
        String(message.conversationId) !== String(id)
      ) {
        continue;
      }

      const messageId = String(message._id || "");

      if (messageId) {
        if (seen.has(messageId)) {
          continue;
        }

        seen.add(messageId);
      }

      result.push(message);
    }

    return result;
  }, [messages, id]);

  /*
   * =========================================================
   * LOAD CONVERSATION MESSAGES
   * =========================================================
   *
   * IMPORTANT:
   *
   * We DO NOT call:
   *
   * /conversations/:id
   *
   * anymore.
   *
   * The conversation is already available from the
   * conversations list.
   *
   * We only need:
   *
   * /conversations/:id/messages
   *
   * Backend already validates the conversation and returns
   * the conversation information as well.
   */

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Invalid conversation ID");
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log("💬 Loading messages for conversation:", id);

        // `api` is the shared Axios instance from AppContext.
        // Its Clerk interceptor attaches the Authorization token.
        const response = await api.get<{
          success: boolean;
          messages?: Message[];
          conversation?: any;
          message?: string;
        }>(`/api/messages/conversations/${id}/messages`, {
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          timeout: 10000,
        });

        if (cancelled) return;

        if (!response.data?.success) {
          throw new Error(response.data?.message || "Failed to load messages");
        }

        const serverMessages = response.data.messages || [];
        const seen = new Set<string>();

        const cleanedMessages = serverMessages.filter((message: Message) => {
          if (!message) return false;

          // Never mix messages from another conversation.
          if (
            message.conversationId &&
            String(message.conversationId) !== String(id)
          ) {
            return false;
          }

          const messageId = String(message._id || "");
          if (!messageId) return true;
          if (seen.has(messageId)) return false;

          seen.add(messageId);
          return true;
        });

        // Replace the global message list only after the request succeeds.
        setMessages(cleanedMessages);

        // The messages endpoint currently returns only conversation metadata
        // (without participant). Keep the already-loaded participant intact.
        if (response.data.conversation?.participant) {
          setSelectedConversation(response.data.conversation);
        }

        console.log(`✅ Loaded ${cleanedMessages.length} messages`);
      } catch (error: any) {
        if (cancelled) return;

        console.error(
          "❌ Chat Messages Error:",
          error?.response?.data || error?.message || error,
        );

        let message = "Unable to load messages.";

        if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
          message = "Server took too long to respond.";
        } else if (error?.response?.status === 401) {
          message = "Authentication expired. Please sign in again.";
        } else if (error?.response?.status === 403) {
          message = "You are not allowed to access this conversation.";
        } else if (error?.response?.status === 404) {
          message = "Conversation not found.";
        } else if (error?.response?.data?.message) {
          message = error.response.data.message;
        } else if (error?.message === "Network Error") {
          message = "Cannot connect to the backend server.";
        }

        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadMessages();

    return () => {
      cancelled = true;
    };
    // IMPORTANT: only reload when the opened conversation ID changes.
    // Do not depend on context values/setters here; they can cause an
    // unnecessary request cycle while messages/conversation state updates.
  }, [id]);

  /*
   * =========================================================
   * CLEANUP TYPING TIMER
   * =========================================================
   */

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, []);

  /*
   * =========================================================
   * AUTO SCROLL
   * =========================================================
   */

  useEffect(() => {
    if (uniqueMessages.length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({
        animated: true,
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [uniqueMessages.length]);

  /*
   * =========================================================
   * BACK
   * =========================================================
   */

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  /*
   * =========================================================
   * RETRY
   * =========================================================
   */

  const retryLoadMessages = () => {
    setError(null);

    /*
     * Force effect by changing loading state first.
     * The actual effect will run normally on route mount.
     */
    setLoading(true);

    /*
     * Direct retry request.
     */
    if (!id) {
      setLoading(false);
      return;
    }

    let active = true;

    const retry = async () => {
      try {
        console.log("🔄 Retrying messages:", id);

        const response = await api.get<{
          success: boolean;
          messages?: Message[];
          conversation?: any;
          message?: string;
        }>(`/api/messages/conversations/${id}/messages`, {
          headers: {
            "Cache-Control": "no-cache",
          },
          timeout: 10000,
        });

        if (!active) {
          return;
        }

        if (!response.data?.success) {
          throw new Error(response.data?.message || "Failed to load messages");
        }

        const serverMessages = response.data.messages || [];

        const seen = new Set<string>();

        const cleanedMessages = serverMessages.filter((message: Message) => {
          if (!message) {
            return false;
          }

          if (
            message.conversationId &&
            String(message.conversationId) !== String(id)
          ) {
            return false;
          }

          const messageId = String(message._id || "");

          if (!messageId) {
            return true;
          }

          if (seen.has(messageId)) {
            return false;
          }

          seen.add(messageId);

          return true;
        });

        setMessages(cleanedMessages);
        setError(null);

        console.log(`✅ Retry successful: ${cleanedMessages.length} messages`);
      } catch (error: any) {
        if (!active) {
          return;
        }

        console.error(
          "❌ Retry Messages Error:",
          error?.response?.data || error?.message || error,
        );

        setError(error?.response?.data?.message || "Unable to load messages.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    retry();

    return () => {
      active = false;
    };
  };

  /*
   * =========================================================
   * VOICE CALL
   * =========================================================
   */

  const startVoiceCall = () => {
    if (!currentConversation || !partner) {
      return;
    }

    router.push({
      pathname: "/call/[id]",
      params: {
        id: currentConversation._id,
        type: "voice",
      },
    });
  };

  /*
   * =========================================================
   * VIDEO CALL
   * =========================================================
   */

  const startVideoCall = () => {
    if (!currentConversation || !partner) {
      return;
    }

    router.push({
      pathname: "/call/[id]",
      params: {
        id: currentConversation._id,
        type: "video",
      },
    });
  };

  /*
   * =========================================================
   * DELETE CHAT
   * =========================================================
   */

  const deleteChat = () => {
    if (!currentConversation) {
      return;
    }

    Alert.alert("Delete Chat", "Delete this chat? This cannot be undone.", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",

        onPress: async () => {
          try {
            const response = await api.delete(
              `/api/messages/conversations/${currentConversation._id}`,
            );

            if (response.data?.success) {
              setConversations((previous) =>
                previous.filter(
                  (conversation) =>
                    String(conversation._id) !==
                    String(currentConversation._id),
                ),
              );

              setSelectedConversation(null);
              setMessages([]);
              setSelectedMessages([]);

              goBack();
            }
          } catch (error: any) {
            console.error("Delete Chat Error:", error?.response?.data || error);

            Alert.alert(
              "Error",
              error?.response?.data?.message || "Failed to delete chat",
            );
          }
        },
      },
    ]);
  };

  /*
   * =========================================================
   * PICK MEDIA
   * =========================================================
   */

  const pickMedia = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Allow access to your photos to send images or videos.",
        );

        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];

      setMediaUri(asset.uri);

      setMediaMime(
        asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg"),
      );

      setMediaName(
        asset.fileName || (asset.type === "video" ? "video.mp4" : "photo.jpg"),
      );
    } catch (error) {
      console.error("Pick Media Error:", error);

      Alert.alert("Error", "Unable to select media.");
    }
  };

  /*
   * =========================================================
   * TYPING
   * =========================================================
   */

  const handleTyping = (value: string) => {
    setText(value);

    if (!partner?._id) {
      return;
    }

    const target = {
      receiverId: partner._id,
    };

    sendWsEvent({
      type: "typing",
      ...target,
      isTyping: true,
    });

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = setTimeout(() => {
      sendWsEvent({
        type: "typing",
        ...target,
        isTyping: false,
      });
    }, 1500);
  };

  /*
   * =========================================================
   * TYPING USERS
   * =========================================================
   */

  const typingEntries = Object.entries(typingUsers || {}).filter(
    ([userId, isTyping]) => {
      if (!isTyping) {
        return false;
      }

      if (userId === auth.user?._id) {
        return false;
      }

      return partner?._id === userId;
    },
  );

  /*
   * =========================================================
   * SEND MESSAGE
   * =========================================================
   */

  const send = async () => {
    const trimmedText = text.trim();

    if (
      (!trimmedText && !mediaUri) ||
      !currentConversation ||
      !partner ||
      sending
    ) {
      return;
    }

    setSending(true);

    try {
      const formData = new FormData();

      formData.append("receiverId", partner._id);

      formData.append("conversationId", currentConversation._id);

      if (trimmedText) {
        formData.append("text", trimmedText);
      }

      /*
       * Attach media.
       */
      if (mediaUri) {
        if (Platform.OS === "web") {
          const response = await fetch(mediaUri);

          const blob = await response.blob();

          const isVideo = mediaMime?.startsWith("video");

          const extension = isVideo ? "mp4" : "jpg";

          formData.append("file", blob, mediaName || `upload.${extension}`);
        } else {
          formData.append("file", {
            uri: mediaUri,
            type: mediaMime || "image/jpeg",
            name:
              mediaName ||
              (mediaMime?.startsWith("video") ? "video.mp4" : "image.jpg"),
          } as any);
        }
      }

      const response = await api.post<{
        success: boolean;
        message: Message;
      }>("/api/messages/send", formData);

      const newMessage = response.data?.message;

      if (response.data?.success && newMessage) {
        setMessages((previous) => {
          const newId = String(newMessage._id || "");

          if (
            newId &&
            previous.some((message) => String(message._id) === newId)
          ) {
            return previous;
          }

          return [...previous, newMessage];
        });

        setText("");
        setMediaUri(null);
        setMediaMime("image/jpeg");
        setMediaName("media.jpg");

        if (partner?._id) {
          sendWsEvent({
            type: "typing",
            receiverId: partner._id,
            isTyping: false,
          });
        }

        if (typingTimerRef.current) {
          clearTimeout(typingTimerRef.current);

          typingTimerRef.current = null;
        }
      } else {
        throw new Error("Message sending failed");
      }
    } catch (error: any) {
      console.error(
        "Send Message Error:",
        error?.response?.data || error?.message || error,
      );

      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to send message",
      );
    } finally {
      setSending(false);
    }
  };

  /*
   * =========================================================
   * DELETE SELECTED MESSAGES
   * =========================================================
   */

  const deleteSelectedMessages = async () => {
    if (selectedMessages.length === 0) {
      return;
    }

    try {
      for (const messageId of selectedMessages) {
        await api.delete(`/api/messages/messages/${messageId}`);
      }

      setMessages((previous) =>
        previous.filter(
          (message) => !selectedMessages.includes(String(message._id)),
        ),
      );

      setSelectedMessages([]);
    } catch (error: any) {
      console.error(
        "Delete Selected Messages Error:",
        error?.response?.data || error,
      );

      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to delete messages",
      );
    }
  };

  /*
   * =========================================================
   * MESSAGE SELECTION
   * =========================================================
   */

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessages((previous) => {
      if (previous.includes(messageId)) {
        return previous.filter((id) => id !== messageId);
      }

      return [...previous, messageId];
    });
  };

  /*
   * =========================================================
   * NO CONVERSATION
   * =========================================================
   */

  if (!currentConversation || !partner) {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.backBtn} onPress={goBack}>
          <Ionicons name="chevron-back" size={24} color={Colors.onSurface} />
        </TouchableOpacity>

        {loading ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ActivityIndicator size="large" color={Colors.primary} />

            <Text
              style={{
                marginTop: 12,
                color: Colors.onSurfaceVariant,
              }}
            >
              Loading conversation...
            </Text>
          </View>
        ) : (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 30,
            }}
          >
            <Text
              style={{
                color: Colors.onSurface,
                fontSize: 16,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              Conversation not found
            </Text>

            {error && (
              <Text
                style={{
                  color: Colors.onSurfaceVariant,
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            )}

            <TouchableOpacity
              onPress={goBack}
              style={{
                marginTop: 20,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: Colors.primary,
              }}
            >
              <Text
                style={{
                  color: Colors.onPrimary,
                  fontWeight: "600",
                }}
              >
                Go Back
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  /*
   * =========================================================
   * HEADER DATA
   * =========================================================
   */

  const headerName = partner.name || "User";

  const headerAvatar = partner.avatar || "";

  const headerSub = partner.isOnline
    ? "Online"
    : partner.lastSeen
      ? "Last seen recently"
      : "Offline";

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* HEADER */}

      <View style={styles.header}>
        {selectedMessages.length > 0 ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setSelectedMessages([])}
          >
            <Ionicons name="close" size={24} color={Colors.onSurface} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Ionicons name="chevron-back" size={24} color={Colors.onSurface} />
          </TouchableOpacity>
        )}

        <Avatar
          name={headerName}
          src={headerAvatar}
          size={38}
          online={partner.isOnline}
        />

        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>
            {selectedMessages.length > 0
              ? `${selectedMessages.length} Selected`
              : headerName}

            {selectedMessages.length === 0 && (
              <Text style={styles.headerHandle}>@{partner.handle || ""}</Text>
            )}
          </Text>

          <Text
            style={[
              styles.headerSub,
              partner.isOnline && {
                color: Colors.online,
              },
            ]}
          >
            {selectedMessages.length > 0 ? "" : headerSub}
          </Text>
        </View>

        {selectedMessages.length > 0 && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={deleteSelectedMessages}
          >
            <Ionicons name="trash" size={24} color={Colors.error} />
          </TouchableOpacity>
        )}

        {selectedMessages.length === 0 && (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.backBtn} onPress={startVoiceCall}>
              <Ionicons
                name="call-outline"
                size={20}
                color={Colors.onSurfaceVariant}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.backBtn} onPress={startVideoCall}>
              <Ionicons
                name="videocam-outline"
                size={20}
                color={Colors.onSurfaceVariant}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.backBtn} onPress={deleteChat}>
              <Ionicons
                name="trash-outline"
                size={20}
                color={Colors.onSurfaceVariant}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* CHAT */}

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {loading ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ActivityIndicator size="large" color={Colors.primary} />

            <Text
              style={{
                marginTop: 12,
                color: Colors.onSurfaceVariant,
              }}
            >
              Loading messages...
            </Text>
          </View>
        ) : error ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 30,
            }}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={42}
              color={Colors.onSurfaceVariant}
            />

            <Text
              style={{
                marginTop: 12,
                fontSize: 16,
                fontWeight: "600",
                color: Colors.onSurface,
                textAlign: "center",
              }}
            >
              Unable to load messages
            </Text>

            <Text
              style={{
                marginTop: 8,
                color: Colors.onSurfaceVariant,
                textAlign: "center",
              }}
            >
              {error}
            </Text>

            <TouchableOpacity
              onPress={retryLoadMessages}
              style={{
                marginTop: 18,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: Colors.primary,
              }}
            >
              <Text
                style={{
                  color: Colors.onPrimary,
                  fontWeight: "600",
                }}
              >
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={uniqueMessages}
            extraData={selectedMessages}
            contentContainerStyle={[
              styles.messageList,
              uniqueMessages.length === 0 && {
                flexGrow: 1,
                justifyContent: "center",
              },
            ]}
            keyExtractor={(message, index) => {
              const messageId = String(message?._id || "");

              if (messageId) {
                return `message-${messageId}`;
              }

              return `message-fallback-${index}`;
            }}
            renderItem={({ item: message, index }) => {
              const isMine = String(message.sender) === String(auth.user?._id);

              const previousMessage = uniqueMessages[index - 1];

              const showGap =
                !previousMessage ||
                String(previousMessage.sender) !== String(message.sender);

              const messageId = String(message._id);

              const isSelected = selectedMessages.includes(messageId);

              const isSelectionMode = selectedMessages.length > 0;

              return (
                <View
                  style={
                    showGap && index > 0
                      ? {
                          marginTop: 10,
                        }
                      : undefined
                  }
                >
                  <Bubble
                    msg={message}
                    isMine={isMine}
                    isSelected={isSelected}
                    isSelectionMode={isSelectionMode}
                    onSelect={toggleMessageSelection}
                  />
                </View>
              );
            }}
            onContentSizeChange={() => {
              setTimeout(() => {
                flatListRef.current?.scrollToEnd({
                  animated: false,
                });
              }, 50);
            }}
            ListEmptyComponent={
              <View
                style={{
                  alignItems: "center",
                  paddingHorizontal: 30,
                }}
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={38}
                  color={Colors.outlineVariant}
                />

                <Text
                  style={{
                    marginTop: 10,
                    color: Colors.onSurfaceVariant,
                    textAlign: "center",
                  }}
                >
                  No messages yet
                </Text>

                <Text
                  style={{
                    marginTop: 4,
                    color: Colors.outlineVariant,
                    textAlign: "center",
                  }}
                >
                  Send a message to start the conversation.
                </Text>
              </View>
            }
            removeClippedSubviews={Platform.OS !== "web"}
          />
        )}

        {/* TYPING INDICATOR */}

        {typingEntries.length > 0 && (
          <View style={styles.typingRow}>
            {typingEntries.map(([userId]) => {
              const typingUser =
                users.find((user) => user._id === userId) || partner;

              return (
                <Text key={`typing-${userId}`} style={styles.typingText}>
                  {typingUser?.name || "Someone"} is typing...
                </Text>
              );
            })}
          </View>
        )}

        {/* INPUT BAR */}

        <View style={styles.inputBar}>
          {mediaUri && (
            <View style={styles.mediaPreview}>
              <Image
                source={{
                  uri: mediaUri,
                }}
                style={styles.mediaThumb}
              />

              <TouchableOpacity
                style={styles.mediaRemove}
                onPress={() => {
                  setMediaUri(null);
                  setMediaMime("image/jpeg");
                  setMediaName("media.jpg");
                }}
              >
                <Ionicons name="close-circle" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachBtn} onPress={pickMedia}>
              <Ionicons
                name="image-outline"
                size={22}
                color={Colors.onSurfaceVariant}
              />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={handleTyping}
              placeholder="Message..."
              placeholderTextColor={Colors.outlineVariant}
              multiline
              maxLength={2000}
            />

            <TouchableOpacity
              disabled={(!text.trim() && !mediaUri) || sending}
              activeOpacity={0.85}
              onPress={send}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.primaryContainer]}
                style={[
                  styles.sendBtn,
                  !text.trim() && !mediaUri && styles.sendBtnDisabled,
                ]}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
