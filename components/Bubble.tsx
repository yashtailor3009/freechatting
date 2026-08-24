import { styles } from "@/assets/styles/Bubble.styles";
import { LinearGradient } from "expo-linear-gradient";
import { Image, Linking, Text, TouchableOpacity, View } from "react-native";
import { Colors } from "../constants/Colors";
import { Message } from "../types";
import { useVideoPlayer, VideoView } from "expo-video";
import { formatTime } from "../utils/formatTime";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";

interface BubbleProps {
  msg: Message;
  isMine: boolean;
  isSelected: boolean;
  isSelectionMode: boolean; // ✅ ADDED
  onSelect: (messageId: string) => void;
}

export default function Bubble({ msg, isMine, isSelected, isSelectionMode, onSelect }: BubbleProps) {
  const content = <BubbleContent msg={msg} isMine={isMine} />;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        // ✅ AGAR SELECTION MODE ON HAI, TO SINGLE TAP SE SELECT HOGA
        if (isSelectionMode) {
          onSelect(msg._id);
        }
      }}
      onLongPress={() => {
        // ✅ PEHLI BAAR LONG PRESS SE SELECT HOGA
        if (!isSelectionMode) {
          onSelect(msg._id);
        }
      }}
      style={[
        styles.row,
        isMine ? styles.rowMe : styles.rowThem,
        isSelected && { backgroundColor: "rgba(0,0,0,0.1)", borderRadius: 15, padding: 2 },
      ]}
    >
      {isMine ? (
        <LinearGradient
          colors={[Colors.primary, Colors.primaryContainer]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bubble, styles.bubbleMe]}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, styles.bubbleThem]}>{content}</View>
      )}
    </TouchableOpacity>
  );
}

function BubbleContent({ msg, isMine }: { msg: Message; isMine: boolean }) {
  return (
    <View>
      {/* MEDIA */}
      {msg.mediaUrl && (
        <View style={styles.mediaWrapper}>
          {msg.mediaType === "image" ? (
            <TouchableOpacity onPress={() => Linking.openURL(msg.mediaUrl!)}>
              <Image
                source={{ uri: msg.mediaUrl }}
                style={styles.mediaImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ) : (
            <VideoPlayer uri={msg.mediaUrl} style={styles.mediaVideo} />
          )}
        </View>
      )}

      {/* TEXT */}
      {msg.text ? (
        <Text
          style={[styles.msgText, isMine ? styles.msgTextMe : styles.msgTextThem]}
        >
          {msg.text}
        </Text>
      ) : null}

      {/* FOOTER */}
      <View
        style={[styles.footer, isMine ? styles.footerRight : styles.footerLeft]}
      >
        <Text
          style={[styles.timeText, isMine ? styles.timeMe : styles.timeThem]}
        >
          {formatTime(msg.createdAt)}
        </Text>
        {isMine && (
          <Ionicons
            name={msg.read ? "checkmark-done" : "checkmark"}
            size={12}
            color={msg.read ? Colors.onPrimary : `${Colors.onPrimary}88`}
          />
        )}
      </View>
    </View>
  );
}

function VideoPlayer({ uri, style }: { uri: string; style: any }) {
  const [muted, setMuted] = useState(false);
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.muted = false;
  });

  const toggleMute = () => {
    const nextMuted = !muted;
    player.muted = nextMuted;
    setMuted(nextMuted);
  };

  return (
    <View style={style}>
      <VideoView player={player} style={style} nativeControls />
      
      {/* Mute/Unmute Button */}
      <TouchableOpacity
        onPress={toggleMute}
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          backgroundColor: "rgba(0,0,0,0.6)",
          borderRadius: 20,
          padding: 6,
        }}
      >
        <Ionicons
          name={muted ? "volume-mute" : "volume-high"}
          size={20}
          color="#fff"
        />
      </TouchableOpacity>
    </View>
  );
}