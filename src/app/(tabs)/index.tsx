import { styles } from "../../../assets/styles/MessagesScreen.styles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { TextInput } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import ConvoItem from "../../../components/ConvoItem";
import StoriesBar from "../../../components/StoriesBar";
import StoryViewer from "../../../components/StoryViewer";
import { Colors } from "../../../constants/Colors";
import { useApp } from "../../../context/AppContext";
import { Conversation, UserStory } from "../../../types";

export default function MessagesScreen() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedStory, setSelectedStory] = useState<UserStory | null>(null);

  const {
    api,
    setSelectedConversation,
    conversations,
    setConversations,
    selectedConversation,
    unreadCounts,
    syncUnreadCounts,
  } = useApp();

  const fetchConversations = async () => {
    try {
      setLoading(true);

      const { data } = await api.get<{
        success: boolean;
        conversations: Conversation[];
      }>("/api/messages/conversations");

      if (data.success) {
        const nextConversations = data.conversations || [];

        setConversations(nextConversations);
        syncUnreadCounts(nextConversations);
      }
    } catch (err) {
      console.log("Conversation Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  const lowerSearch = search.toLowerCase();

  const filtered = search
    ? conversations.filter(
        (c) =>
          c.participant?.name?.toLowerCase().includes(lowerSearch) ||
          c.participant?.handle?.toLowerCase().includes(lowerSearch),
      )
    : conversations;

  const openConvo = (c: Conversation) => {
    setSelectedConversation(c);
    router.push(`/chat/${c._id}`);
  };

  const getUnreadCount = (item: Conversation) => {
    const realtimeCount = unreadCounts[String(item._id)];

    if (typeof realtimeCount === "number") {
      return realtimeCount;
    }

    const serverCount = Number(
      (item as Conversation & { unreadCount?: number }).unreadCount,
    );

    return Number.isFinite(serverCount) ? serverCount : 0;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Conversations</Text>

        <View style={styles.headerRight}>
          {/* This is the total conversation count, not unread count. */}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{conversations.length}</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={Colors.outlineVariant} />

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search Conversations..."
          placeholderTextColor={Colors.outlineVariant}
        />

        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons
              name="close-circle"
              size={16}
              color={Colors.outlineVariant}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Stories */}
      <StoriesBar onViewStory={(story) => setSelectedStory(story)} />

      {selectedStory && (
        <StoryViewer
          userStory={selectedStory}
          onClose={() => setSelectedStory(null)}
        />
      )}

      <View style={styles.divider} />

      {/* Conversation List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item._id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const unreadCount = getUnreadCount(item);

            return (
              <View
                style={{
                  position: "relative",
                  width: "100%",
                  overflow: "visible",
                }}
              >
                <ConvoItem
                  convo={item}
                  selected={selectedConversation?._id === item._id}
                  onPress={() => openConvo(item)}
                />

                {unreadCount > 0 && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      right: 12,
                      top: 22,
                      minWidth: unreadCount > 99 ? 34 : 24,
                      height: 24,
                      borderRadius: 12,
                      paddingHorizontal: 7,
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: "#25D366",
                      zIndex: 9999,
                      elevation: 9999,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.2,
                      shadowRadius: 2,
                    }}
                  >
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: 12,
                        fontWeight: "700",
                        lineHeight: 16,
                        textAlign: "center",
                      }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name="chatbubble-outline"
                size={44}
                color={Colors.outlineVariant}
              />
              <Text style={styles.emptyTitle}>No conversations yet.</Text>
              <Text style={styles.emptySubtitle}>
                Go to Search to start chatting.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
