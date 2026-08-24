import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Avatar from "../../../components/Avatar";
import { Colors } from "../../../constants/Colors";
import { useApp } from "../../../context/AppContext";

export default function CallScreen() {
  const {
    id,
    type,
    callType,
    incoming,
    conversationId,
  } = useLocalSearchParams<{
    id: string;
    type?: string;
    callType?: string;
    incoming?: string;
    conversationId?: string;
  }>();

  const {
    selectedConversation,
    sendWsEvent,
    incomingCall,
    lastCallAnswer,
    lastIceCandidate,
  } = useApp() as any;

  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);

  const [RTCViewComponent, setRTCViewComponent] =
    useState<any>(null);

  const pcRef = useRef<any>(null);
  const webRTCRef = useRef<any>(null);

  // Supports both:
  // type="video"
  // callType="video"
  const finalCallType = callType || type || "voice";

  const isVideoCall = finalCallType === "video";

  const isIncoming = incoming === "true";

  // For outgoing call use selectedConversation participant
  // For incoming call fallback to incomingCall data
  const partner =
    selectedConversation?.participant ||
    (incomingCall
      ? {
          _id: incomingCall.senderId,
          name:
            incomingCall.name ||
            incomingCall.senderName ||
            incomingCall.displayName ||
            "Unknown User",
          handle: incomingCall.handle || "",
          avatar: incomingCall.avatar,
          isOnline: true,
        }
      : null);

  const activeConversationId =
    conversationId ||
    selectedConversation?._id ||
    incomingCall?.conversationId;

  // =========================
  // WEBRTC SETUP
  // =========================

  useEffect(() => {
    let mounted = true;

    const setupCall = async () => {
      // react-native-webrtc does NOT work directly
      // in Expo Web / localhost browser
      if (Platform.OS === "web") {
        console.warn(
          "WebRTC native calling is not supported in Expo Web."
        );
        return;
      }

      try {
        /*
         IMPORTANT:
         Do not import react-native-webrtc at the top.

         We load it only on Android/iOS so the web version
         does not crash with requireNativeComponent error.
        */
        const WebRTC = require("react-native-webrtc");

        webRTCRef.current = WebRTC;

        const {
          mediaDevices,
          RTCPeerConnection,
        } = WebRTC;

        const servers = {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302",
            },
          ],
        };

        const pc: any = new RTCPeerConnection(servers);

        pcRef.current = pc;

        // =========================
        // RECEIVE ICE CANDIDATE
        // =========================

        pc.onicecandidate = (event: any) => {
          if (!event.candidate) return;

          sendWsEvent({
            type: "ice_candidate",
            receiverId: partner?._id || id,
            conversationId: activeConversationId,
            candidate: event.candidate,
          });
        };

        // =========================
        // RECEIVE REMOTE STREAM
        // =========================

        pc.onaddstream = (event: any) => {
          if (!mounted) return;

          if (event.stream) {
            setRemoteStream(event.stream);
          }
        };

        // =========================
        // GET MICROPHONE / CAMERA
        // =========================

        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: isVideoCall,
        });

        if (!mounted) {
          stream.getTracks().forEach((track: any) => {
            track.stop();
          });

          return;
        }

        setLocalStream(stream);

        pc.addStream(stream);

        // Load RTCView only after native WebRTC is available
        setRTCViewComponent(() => WebRTC.RTCView);

        // =========================
        // OUTGOING CALL
        // =========================

        if (!isIncoming) {
          const offer = await pc.createOffer();

          await pc.setLocalDescription(offer);

          sendWsEvent({
            type: "call_offer",
            receiverId: partner?._id || id,
            conversationId: activeConversationId,
            offer: pc.localDescription,
            callType: finalCallType,
          });
        }

        // =========================
        // INCOMING CALL
        // =========================

        if (
          isIncoming &&
          incomingCall?.offer
        ) {
          await pc.setRemoteDescription(
            incomingCall.offer
          );

          const answer = await pc.createAnswer();

          await pc.setLocalDescription(answer);

          sendWsEvent({
            type: "call_answer",
            receiverId:
              incomingCall.senderId ||
              partner?._id ||
              id,
            conversationId: activeConversationId,
            answer: pc.localDescription,
          });
        }
      } catch (error) {
        console.error(
          "Call setup error:",
          error
        );

        if (Platform.OS === "ios" || Platform.OS === "android") {
            Alert.alert(
                "Call Error","Failed to start the call.");
            }
        router.back();
      }
    };

    setupCall();

    return () => {
      mounted = false;

      try {
        pcRef.current?.close();
      } catch (error) {}

      try {
        localStream?.getTracks().forEach(
          (track: any) => track.stop()
        );
      } catch (error) {}
    };

    // Run only when screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =========================
  // RECEIVE CALL ANSWER
  // =========================

  useEffect(() => {
    if (
      !lastCallAnswer ||
      !pcRef.current
    ) {
      return;
    }

    pcRef.current
      .setRemoteDescription(lastCallAnswer)
      .catch((error: any) => {
        console.error(
          "setRemoteDescription error:",
          error
        );
      });
  }, [lastCallAnswer]);

  // =========================
  // RECEIVE ICE CANDIDATE
  // =========================

  useEffect(() => {
    if (
      !lastIceCandidate ||
      !pcRef.current
    ) {
      return;
    }

    pcRef.current
      .addIceCandidate(lastIceCandidate)
      .catch((error: any) => {
        console.error(
          "addIceCandidate error:",
          error
        );
      });
  }, [lastIceCandidate]);

  // =========================
  // MUTE
  // =========================

  const toggleMute = () => {
    if (!localStream) return;

    const audioTracks =
      localStream.getAudioTracks?.() || [];

    audioTracks.forEach((track: any) => {
      track.enabled = !track.enabled;
    });

    setMuted((previous) => !previous);
  };

  // =========================
  // CAMERA
  // =========================

  const toggleCamera = () => {
    if (!localStream) return;

    const videoTracks =
      localStream.getVideoTracks?.() || [];

    videoTracks.forEach((track: any) => {
      track.enabled = !track.enabled;
    });

    setCameraOn((previous) => !previous);
  };

  // =========================
  // SPEAKER UI
  // =========================

  const toggleSpeaker = () => {
    setSpeakerOn((previous) => !previous);
  };

  // =========================
  // END CALL
  // =========================

  const endCall = () => {
    try {
      sendWsEvent({
        type: "call_end",
        conversationId: activeConversationId,
        receiverId: partner?._id || id,
      });
    } catch (error) {
      console.error(
        "End call event error:",
        error
      );
    }

    try {
      pcRef.current?.close();
      pcRef.current = null;
    } catch (error) {}

    try {
      localStream?.getTracks().forEach(
        (track: any) => track.stop()
      );
    } catch (error) {}

    setLocalStream(null);
    setRemoteStream(null);

    router.back();
  };

  // =========================
  // WEB VERSION
  // =========================

  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.webContainer}>
          <Ionicons
            name={
              isVideoCall
                ? "videocam-outline"
                : "call-outline"
            }
            size={70}
            color={Colors.primary}
          />

          <Text style={styles.webTitle}>
            {isVideoCall
              ? "Video Call"
              : "Voice Call"}
          </Text>

          <Text style={styles.webText}>
            Native calling cannot run directly
            in Expo Web.
          </Text>

          <Text style={styles.webText}>
            Test this call on an Android or
            iOS development build.
          </Text>

          <TouchableOpacity
            style={styles.webEndButton}
            onPress={() => router.back()}
          >
            <Text style={styles.webEndText}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // =========================
  // LOADING
  // =========================

  if (!partner) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>
          Loading call...
        </Text>
      </SafeAreaView>
    );
  }

  // =========================
  // UI
  // =========================

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* TOP */}

        <View style={styles.topSection}>
          <Text style={styles.callStatus}>
            {isVideoCall
              ? "Video Call"
              : "Voice Call"}
          </Text>

          <Text style={styles.connectingText}>
            {remoteStream
              ? "Connected"
              : "Connecting..."}
          </Text>
        </View>

        {/* USER */}

        <View style={styles.userSection}>
          {isVideoCall ? (
            <View style={styles.videoContainer}>
              {remoteStream &&
              RTCViewComponent ? (
                <RTCViewComponent
                  streamURL={remoteStream.toURL()}
                  style={styles.remoteVideo}
                  objectFit="cover"
                />
              ) : (
                <Avatar
                  name={partner.name}
                  src={partner.avatar}
                  size={120}
                  online={partner.isOnline}
                />
              )}

              {localStream &&
                RTCViewComponent && (
                  <RTCViewComponent
                    streamURL={localStream.toURL()}
                    style={styles.localVideo}
                    objectFit="cover"
                  />
                )}
            </View>
          ) : (
            <Avatar
              name={partner.name}
              src={partner.avatar}
              size={120}
              online={partner.isOnline}
            />
          )}

          <Text style={styles.userName}>
            {partner.name}
          </Text>

          <Text style={styles.userHandle}>
            @{partner.handle || "user"}
          </Text>

          <Text style={styles.callType}>
            {remoteStream
              ? isVideoCall
                ? "Video call connected"
                : "Voice call connected"
              : isVideoCall
              ? "Video calling..."
              : "Voice calling..."}
          </Text>
        </View>

        {/* CONTROLS */}

        <View style={styles.controls}>
          {/* MUTE */}

          <TouchableOpacity
            style={styles.controlButton}
            onPress={toggleMute}
          >
            <Ionicons
              name={
                muted
                  ? "mic-off"
                  : "mic"
              }
              size={26}
              color={Colors.onSurface}
            />
          </TouchableOpacity>

          {/* SPEAKER */}

          {!isVideoCall && (
            <TouchableOpacity
              style={styles.controlButton}
              onPress={toggleSpeaker}
            >
              <Ionicons
                name={
                  speakerOn
                    ? "volume-high"
                    : "volume-mute"
                }
                size={26}
                color={Colors.onSurface}
              />
            </TouchableOpacity>
          )}

          {/* CAMERA */}

          {isVideoCall && (
            <TouchableOpacity
              style={styles.controlButton}
              onPress={toggleCamera}
            >
              <Ionicons
                name={
                  cameraOn
                    ? "videocam"
                    : "videocam-off"
                }
                size={26}
                color={Colors.onSurface}
              />
            </TouchableOpacity>
          )}

          {/* END CALL */}

          <TouchableOpacity
            style={styles.endButton}
            onPress={endCall}
          >
            <Ionicons
              name="call"
              size={28}
              color="#fff"
            />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },

  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 30,
  },

  topSection: {
    alignItems: "center",
  },

  callStatus: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.onSurface,
  },

  connectingText: {
    marginTop: 8,
    fontSize: 15,
    color: Colors.onSurfaceVariant,
  },

  userSection: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },

  videoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },

  remoteVideo: {
    width: 220,
    height: 320,
    borderRadius: 12,
  },

  localVideo: {
    width: 90,
    height: 130,
    borderRadius: 8,
    marginTop: 12,
  },

  userName: {
    marginTop: 20,
    fontSize: 26,
    fontWeight: "700",
    color: Colors.onSurface,
  },

  userHandle: {
    marginTop: 5,
    fontSize: 15,
    color: Colors.onSurfaceVariant,
  },

  callType: {
    marginTop: 20,
    fontSize: 16,
    color: Colors.onSurfaceVariant,
  },

  controls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    paddingBottom: 20,
  },

  controlButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.surfaceHigh,
    justifyContent: "center",
    alignItems: "center",
  },

  endButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E53935",
    justifyContent: "center",
    alignItems: "center",
    transform: [{ rotate: "135deg" }],
  },

  loadingText: {
    color: Colors.onSurface,
    textAlign: "center",
    marginTop: 50,
    fontSize: 16,
  },

  webContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },

  webTitle: {
    marginTop: 20,
    fontSize: 25,
    fontWeight: "700",
    color: Colors.onSurface,
  },

  webText: {
    marginTop: 10,
    fontSize: 16,
    textAlign: "center",
    color: Colors.onSurfaceVariant,
  },

  webEndButton: {
    marginTop: 30,
    backgroundColor: "#E53935",
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 30,
  },

  webEndText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});