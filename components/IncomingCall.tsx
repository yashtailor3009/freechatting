import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
    Image,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useApp } from "../context/AppContext";

export default function IncomingCallModal() {
  const router = useRouter();

  const { incomingCall, setIncomingCall, sendWsEvent } = useApp();

  if (!incomingCall) return null;

  const callerName =
    (incomingCall as any)?.name ??
    (incomingCall as any)?.senderName ??
    (incomingCall as any)?.displayName ??
    "Incoming Call";
  const avatarUri = (incomingCall as any)?.avatar;

  const isVideoCall = incomingCall.callType === "video";

  const handleAccept = () => {
    const call = incomingCall;

    // Hide incoming call popup
    setIncomingCall(null);

    // Open call screen
    router.push({
      pathname: "/call/[id]",
      params: {
        id: call.senderId,
        conversationId: call.conversationId,
        callType: call.callType,
        incoming: "true",
      },
    });
  };

  const handleReject = () => {
    sendWsEvent({
      type: "call_end",
      receiverId: incomingCall.senderId,
      conversationId: incomingCall.conversationId,
    });

    setIncomingCall(null);
  };

  return (
    <Modal
      visible={!!incomingCall}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>
            Incoming {isVideoCall ? "Video" : "Voice"} Call
          </Text>

          <View style={styles.avatarContainer}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={55} color="#fff" />
              </View>
            )}
          </View>

          <Text style={styles.callerName}>{callerName}</Text>

          <Text style={styles.callType}>
            {isVideoCall ? "Video calling..." : "Voice calling..."}
          </Text>

          <View style={styles.actions}>
            {/* Reject */}
            <TouchableOpacity
              style={[styles.button, styles.rejectButton]}
              onPress={handleReject}
            >
              <Ionicons name="call" size={28} color="#fff" />
            </TouchableOpacity>

            {/* Accept */}
            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              onPress={handleAccept}
            >
              <Ionicons
                name={isVideoCall ? "videocam" : "call"}
                size={28}
                color="#fff"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.labels}>
            <Text>Decline</Text>
            <Text>Accept</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },

  container: {
    width: "88%",
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingVertical: 35,
    paddingHorizontal: 20,
    alignItems: "center",
  },

  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 25,
  },

  avatarContainer: {
    marginBottom: 15,
  },

  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },

  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#6750A4",
    justifyContent: "center",
    alignItems: "center",
  },

  callerName: {
    fontSize: 24,
    fontWeight: "700",
  },

  callType: {
    fontSize: 15,
    marginTop: 8,
    color: "#777",
  },

  actions: {
    flexDirection: "row",
    gap: 70,
    marginTop: 40,
  },

  button: {
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: "center",
    alignItems: "center",
  },

  rejectButton: {
    backgroundColor: "#E53935",
    transform: [{ rotate: "135deg" }],
  },

  acceptButton: {
    backgroundColor: "#34A853",
  },

  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 195,
    marginTop: 10,
  },
});
