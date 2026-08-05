import {
  dummyConversationData,
  dummyMessages,
  dummyUserProfile,
  dummyUsers,
} from "@/assets/assets";
import { styles } from "@/assets/styles/ChatScreen.styles";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import * as ImagePicker from "expo-image-picker"
import { LinearGradient } from "expo-linear-gradient";

export default function ChatScreen() {
  let { auth, messages, users, selectedConversation, typingUsers } = {
    auth: { user: dummyUserProfile },
    messages: dummyMessages,
    users: dummyUsers,
    selectedConversation: dummyConversationData[0],
    typingUsers: {
      [dummyUsers[0]._id]: true,
    },
  };
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mediaUri, setMediaUri] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);

  const partner = selectedConversation?.participant;

  // Scroll to Bottom when message update
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        100,
      );
    }
  }, [messages]);

  const deleteChat = () => {};

  const pickMedia = async() => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
        if (status !== 'granted'){
          Alert.alert("Permission needed", "Allow access to your photos to change avatar.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.8,
        })
        if(!result.canceled && result.assets[0]){
          const assets = result.assets[0];
          setMediaUri(assets.uri)
        }
  }

  const handleTyping = (val: string) =>{
    setText(val)
  }

  //Typing indicator helpers
  const typingEntries = Object.entries(typingUsers).filter(
    ([uid, isTyping]) => {
      if (!isTyping || uid === auth.user?._id) return false;
      return partner?._id === uid;
    })

    const send = async () =>{
      if(!text.trim() && !mediaUri || !selectedConversation) return;
      setSending (true)
      setTimeout(()=>{
        setSending(false)
        setText("")
        setMediaUri(null)
      },500)
    }

  if (!selectedConversation) {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.emptyState}>
          <Ionicons
            name="chatbubbles-outline"
            size={52}
            color={Colors.onSurface}
          />
          <Text style={styles.emptyText}>Conversation not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const headerName = partner!.name;
  const headerAvatar = partner!.avatar;
  const headerSub = partner!.isOnline
    ? "Online"
    : partner?.lastSeen
      ? `Last seen {formatTime(partner.lastSeen)}`
      : "Offline";
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.onSurface} />
        </TouchableOpacity>

        <Avatar
          name={headerName}
          src={headerAvatar}
          size={38}
          online={partner?.isOnline}
        />

        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>
            {headerName}
            <Text style={styles.headerHandle}>@{partner?.handle}</Text>
          </Text>
          <Text
            style={[
              styles.headerSub,
              partner?.isOnline && { color: Colors.online },
            ]}
          >
            {headerSub}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.backBtn}>
            <Ionicons
              name="call-outline"
              size={20}
              color={Colors.onSurfaceVariant}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn}>
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
      </View>

      {/* main */}

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Messages */}
        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />
        ) : (
          <FlatList
            data={messages}
            ref={flatListRef}
            keyExtractor={(m) => m._id}
            contentContainerStyle={styles.messageList}
            renderItem={({ item: msg, index }) => {
              const isMine = msg.sender === auth.user?._id;
              const prev = messages[index - 1];
              const showGap = !prev || prev.sender !== msg.sender;
              return (
                <View style={showGap && index > 0 ? { marginTop: 10 } : {}}>
                  <Bubble msg={msg} isMine={isMine} />
                </View>
              );
            }}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}

        {/* Typing indicator */}
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

        {/* Input bar */}
        <View style={styles.inputBar}>
          {/* Media preview */}
          {mediaUri && (
            <View style={styles.mediaPreview}>
              <Image source={{ uri: mediaUri }} style={styles.mediaThumb} />
              <TouchableOpacity
                style={styles.mediaRemove}
                onPress={() => setMediaUri(null)}
              >
                <Ionicons name="close-circle" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputRow}>
            <TouchableOpacity
                style={styles.attachBtn}
                onPress={pickMedia}>
                <Ionicons name="image-outline" size={22} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>

              <TextInput style={styles.textInput}
              value={text}
              onChangeText={handleTyping}
              placeholder="Message..."
              placeholderTextColor={Colors.outlineVariant} 
              multiline
              maxLength={2000}/>

              <TouchableOpacity disabled={!text.trim() && !mediaUri || sending} activeOpacity={0.85} onPress={send}>
                <LinearGradient colors={[Colors.primary, Colors.primaryContainer]}
                style={[styles.sendBtn, !text.trim() && !mediaUri && styles.sendBtnDisabled]}>
                  {sending ? (
                    <ActivityIndicator color="fff" size="small" />
                  ) : (
                    <Ionicons name="send" size={16} color="fff" />
                  )}
                </LinearGradient>
              </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
