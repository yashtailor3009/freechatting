import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {ActivityIndicator,FlatList,Text,TouchableOpacity,View,} from "react-native";
import { TextInput } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { styles } from "@/assets/styles/MessagesScreen.styles";
import ConvoItem from "../../../components/ConvoItem";
import StoriesBar from "../../../components/StoriesBar";
import StoryViewer from "../../../components/StoryViewer";
import { Colors } from "../../../constants/Colors";
import { api, useApp } from "../../../context/AppContext";
import { Conversation, UserStory } from "../../../types";

export default function MessagesScreen() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedStory, setSelectedStory] = useState<UserStory | null>(null)
  const {setSelectedConversation, conversations, setConversations, selectedConversation} = useApp()

  const fetchConversations = async () => {
    try {
      setLoading(true);

      const { data } = await api.get<{
        success: boolean;
        conversations: Conversation[];
      }>("/api/messages/conversations");

      if (data.success) {
        setConversations(data.conversations);
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
    setSelectedConversation(c)
    router.push(`/chat/${c._id}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Conversations</Text>

        <View style={styles.headerRight}>
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
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ConvoItem
              convo={item}
              selected={false}
              onPress={() => openConvo(item)}
            />
          )}
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
