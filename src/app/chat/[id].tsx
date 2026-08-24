import { styles } from "@/assets/styles/ChatScreen.styles";
import { useAuth } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { api, useApp } from "../../../context/AppContext";
import { Message } from "../../../types";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
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
  const [loading, setLoading] = useState(false);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaMime, setMediaMime] = useState<string>("image/jpeg");
  const [mediaName, setMediaName] = useState<string>("media.jpg");

  const { isLoaded, isSignedIn, getToken } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);

  const currentConversation =
    selectedConversation?._id === id
      ? selectedConversation
      : conversations.find((c) => c._id === id);

  const partner = currentConversation?.participant;

  useEffect(() => {
    if (!id || !isLoaded || !isSignedIn) return;
    
    let cancelled = false;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = await getToken();
        if (!token) return;

        const { data: convData } = await api.get(`/api/messages/conversations/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        const { data: msgData } = await api.get(`/api/messages/conversations/${id}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!cancelled) {
          if (convData.success) setSelectedConversation(convData.conversation);
          if (msgData.success) setMessages(msgData.messages);
        }
      } catch (err) {
        console.error("Fetch Data Error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    
    return () => { cancelled = true; };
  }, [id]);

  const startVoiceCall = () => {
    if (!selectedConversation || !partner) return;
    router.push({ pathname: "/call/[id]", params: { id: selectedConversation._id, type: "voice" } });
  };

  const startVideoCall = () => {
    if (!selectedConversation || !partner) return;
    router.push({ pathname: "/call/[id]", params: { id: selectedConversation._id, type: "video" } });
  };

  const deleteChat = () => {
    const msg = `Delete this chat? This cannot be undone.`;
    Alert.alert("Delete Chat", msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { data } = await api.delete(`/api/messages/conversations/${selectedConversation?._id}`);
            if (data.success) {
              setConversations((prev) => prev.filter((c) => c._id !== selectedConversation?._id));
              setSelectedConversation(null);
              
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)");
            }
          } catch (error) {
            Alert.alert("Error", "Failed to delete chat");
          }
        },
      },
    ]);
  };

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to your photos to change avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const assets = result.assets[0];
      setMediaUri(assets.uri);
      setMediaMime(assets.mimeType || "image/jpeg");
      setMediaName(assets.fileName || (assets.mimeType?.startsWith("video") ? "video.mp4" : " photo.jpg"));
    }
  };

  const handleTyping = (val: string) => {
    setText(val);
    const target = { receiverId: partner?._id };
    if (!target.receiverId) return;
    sendWsEvent({ type: "typing", ...target, isTyping: true });

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendWsEvent({ type: "typing", ...target, isTyping: false });
    }, 1500);
  };

  const typingEntries = Object.entries(typingUsers).filter(
    ([uid, isTyping]) => {
      if (!isTyping || uid === auth.user?._id) return false;
      return partner?._id === uid;
    },
  );

  const send = async () => {
    if ((!text.trim() && !mediaUri) || !selectedConversation || !partner) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("receiverId", partner._id);
      if (text.trim()) formData.append("text", text.trim());

      if (mediaUri) {
        if (Platform.OS === "web") {
          const response = await fetch(mediaUri);
          const blob = await response.blob();
          const extension = mediaMime?.startsWith("video") ? "mp4" : "jpg";
          formData.append("file", blob, `upload.${extension}`);
        } else {
          formData.append("file", {
            uri: mediaUri,
            type: mediaMime || "image/jpeg",
            name: mediaMime?.startsWith("video") ? "video.mp4" : "image.jpg",
          } as any);
        }
      }

      const { data } = await api.post<{ success: boolean; message: Message }>(
        "/api/messages/send",
        formData
      );

      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        const target = { receiverId: partner._id };
        sendWsEvent({ type: "message", ...target, payload: data.message });
        setText("");
        setMediaUri(null);
      }
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to send message");
    } finally {
      setSending(false); 
    }
  };

  if (!currentConversation || !partner) {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.onSurface} />
        </TouchableOpacity>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const headerName = partner.name;
  const headerAvatar = partner.avatar;
  const headerSub = partner.isOnline ? "Online" : partner.lastSeen ? "Last seen recently" : "Offline";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        {selectedMessages.length > 0 ? (
          <TouchableOpacity 
            style={styles.backBtn} 
            onPress={() => setSelectedMessages([])}
          >
            <Ionicons name="close" size={24} color={Colors.onSurface} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.backBtn} 
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.onSurface} />
          </TouchableOpacity>
        )}

        <Avatar name={headerName} src={headerAvatar} size={38} online={partner?.isOnline} />

        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>
            {selectedMessages.length > 0 ? `${selectedMessages.length} Selected` : headerName}
            <Text style={styles.headerHandle}>@{selectedMessages.length > 0 ? " " : partner?.handle}</Text>
          </Text>
          <Text style={[styles.headerSub, partner?.isOnline && { color: Colors.online }]}>
            {selectedMessages.length > 0 ? "" : headerSub}
          </Text>
        </View>

        {selectedMessages.length > 0 && (
          <TouchableOpacity 
            style={styles.backBtn} 
            onPress={async () => {
              try {
                for (const messageId of selectedMessages) {
                  await api.delete(`/api/messages/messages/${messageId}`);
                }
                setMessages((prev) => prev.filter((m) => !selectedMessages.includes(m._id)));
                setSelectedMessages([]);
              } catch (error) {
                Alert.alert("Error", "Failed to delete messages");
              }
            }}
          >
            <Ionicons name="trash" size={24} color={Colors.error} />
          </TouchableOpacity>
        )}

        {selectedMessages.length === 0 && (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.backBtn} onPress={startVoiceCall}>
              <Ionicons name="call-outline" size={20} color={Colors.onSurfaceVariant} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.backBtn} onPress={startVideoCall}>
              <Ionicons name="videocam-outline" size={20} color={Colors.onSurfaceVariant} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.backBtn} onPress={deleteChat}>
              <Ionicons name="trash-outline" size={20} color={Colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />
        ) : (
          <FlatList
            data={messages}
            ref={flatListRef}
            keyExtractor={(m) => m._id}
            extraData={selectedMessages}
            contentContainerStyle={styles.messageList}
            renderItem={({ item: msg, index }) => {
              const isMine = msg.sender === auth.user?._id;
              const prev = messages[index - 1];
              const showGap = !prev || prev.sender !== msg.sender;
              const isSelected = selectedMessages.includes(msg._id);
              const isSelectionMode = selectedMessages.length > 0;

              return (
                <View style={showGap && index > 0 ? { marginTop: 10 } : {}}>
                  <Bubble
                    msg={msg}
                    isMine={isMine}
                    isSelected={isSelected}
                    isSelectionMode={isSelectionMode}
                    onSelect={(messageId) => {
                      if (selectedMessages.includes(messageId)) {
                        setSelectedMessages((prev) => prev.filter((id) => id !== messageId));
                      } else {
                        setSelectedMessages((prev) => [...prev, messageId]);
                      }
                    }}
                  />
                </View>
              );
            }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {typingEntries.length > 0 && (
          <View style={styles.typingRow}>
            {typingEntries.map(([uid]) => {
              const u = users.find((x) => x._id === uid) || partner;
              return (
                <Text key={uid} style={styles.typingText}>
                  {u?.name || "Someone"} is typing...
                </Text>
              );
            })}
          </View>
        )}

        <View style={styles.inputBar}>
          {mediaUri && (
            <View style={styles.mediaPreview}>
              <Image source={{ uri: mediaUri }} style={styles.mediaThumb} />
              <TouchableOpacity style={styles.mediaRemove} onPress={() => setMediaUri(null)}>
                <Ionicons name="close-circle" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachBtn} onPress={pickMedia}>
              <Ionicons name="image-outline" size={22} color={Colors.onSurfaceVariant} />
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
                style={[styles.sendBtn, !text.trim() && !mediaUri && styles.sendBtnDisabled]}
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