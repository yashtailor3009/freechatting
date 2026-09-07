import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import { styles } from "../../../assets/styles/SearchScreen.styles";
import Avatar from "../../../components/Avatar";
import { Colors } from "../../../constants/Colors";
import { useApp } from "../../../context/AppContext";
import type { Conversation, User as IUser } from "../../../types";

export default function Search() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<IUser[]>([]);
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const {
    api,
    setConversations,
    setSelectedConversation,
  } = useApp();

  const fetchUsers = async () => {
    setLoading(true);

    try {
      const trimmedSearch = search.trim();

      const endpoint = trimmedSearch
        ? `/api/users/search?q=${encodeURIComponent(trimmedSearch)}`
        : "/api/users";

      console.log("Fetching users:", endpoint);

      const { data } = await api.get<{
        success: boolean;
        users: IUser[];
      }>(endpoint);

      if (data.success) {
        setUsers(data.users);
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.log("Fetch Users Error:", error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const startChat = async (user: IUser) => {
    try {
      const { data } = await api.get<{
        success: boolean;
        conversation: Conversation;
      }>(`/api/messages/conversations/with/${user._id}`);

      if (data.success) {
        setSelectedConversation(data.conversation);

        setConversations((prev) => {
          const exists = prev.some(
            (c) => c._id === data.conversation._id
          );

          if (exists) {
            return prev;
          }

          return [data.conversation, ...prev];
        });

        router.push(`/chat/${data.conversation._id}`);
      }
    } catch (error) {
      console.log("Start Chat Error:", error);

      Alert.alert(
        "Error",
        "Failed to open conversation"
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons
          name="search"
          size={16}
          color={Colors.outlineVariant}
        />

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, email or handle..."
          placeholderTextColor={Colors.outlineVariant}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch("")}
          >
            <Ionicons
              name="close-circle"
              size={16}
              color={Colors.outlineVariant}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Results */}
      {loading ? (
        <ActivityIndicator
          style={{ marginTop: 40 }}
          color={Colors.primary}
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u._id}
          contentContainerStyle={styles.list}
          renderItem={({ item: u }) => (
            <TouchableOpacity
              style={styles.userRow}
              onPress={() => startChat(u)}
              activeOpacity={0.7}
            >
              <Avatar
                name={u.name}
                src={u.avatar}
                size={44}
                online={u.isOnline}
              />

              <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.userName}>
                    {u.name}
                  </Text>

                  <Text style={styles.userHandle}>
                    {u.handle}
                  </Text>
                </View>

                <Text
                  style={styles.userEmail}
                  numberOfLines={1}
                >
                  {u.email}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim()
                ? "No users found"
                : "Search for people to chat with"}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}