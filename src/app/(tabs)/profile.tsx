import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { TextInput } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { styles } from "../../../assets/styles/ProfileScreen.styles";
import Avatar from "../../../components/Avatar";
import { Colors } from "../../../constants/Colors";
import { useApp } from "../../../context/AppContext";

export default function Profile() {
  const router = useRouter();

  const { api, auth, logout, updateUser } = useApp();

  const user = auth.user;

  const [editMode, setEditMode] = useState(false);

  const [profileName, setProfileName] = useState(
    auth.user?.name || "",
  );

  const [profileHandle, setProfileHandle] = useState(
    auth.user?.handle || "",
  );

  const [profileBio, setProfileBio] = useState(
    auth.user?.bio || "",
  );

  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  /*
   * =========================================================
   * SAVED AVATAR
   * =========================================================
   *
   * This is the avatar coming from MongoDB / Cloudinary.
   */
  const [savedAvatar, setSavedAvatar] = useState<string | null>(
    user?.avatar || null,
  );

  /*
   * =========================================================
   * AVATAR CACHE VERSION
   * =========================================================
   *
   * Used to prevent the browser / React Native Image cache
   * from showing an older Cloudinary image.
   */
  const [avatarVersion, setAvatarVersion] = useState<number>(
    Date.now(),
  );

  /*
   * =========================================================
   * SAVE IN PROGRESS
   * =========================================================
   */
  const saveInProgressRef = useRef(false);

  /*
   * =========================================================
   * CREATE DISPLAY AVATAR URL
   * =========================================================
   *
   * Adding ?v=... forces the image URL to be treated as a
   * fresh resource when the avatar changes.
   */
  const getAvatarUrl = (
    uri: string | null,
    version: number,
  ) => {
    if (!uri) {
      return null;
    }

    const separator = uri.includes("?") ? "&" : "?";

    return `${uri}${separator}v=${version}`;
  };

  /*
   * Local selected image should be shown immediately.
   * Otherwise show the MongoDB / Cloudinary avatar.
   */
  const displayAvatar =
    avatarUri ||
    getAvatarUrl(savedAvatar, avatarVersion) ||
    null;

  /*
   * =========================================================
   * LOAD PROFILE FROM DATABASE
   * =========================================================
   */
  useEffect(() => {
    if (!auth.user) {
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      /*
       * Load text fields immediately.
       */
      setProfileName(auth.user?.name || "");
      setProfileHandle(auth.user?.handle || "");
      setProfileBio(auth.user?.bio || "");

      try {
        const { data } = await api.get(
          "/api/users/profile",
        );

        if (cancelled) {
          return;
        }

        /*
         * Do not allow an older GET request to overwrite
         * the result while a save is running.
         */
        if (saveInProgressRef.current) {
          return;
        }

        const dbUser = data?.user;

        if (!dbUser) {
          return;
        }

        /*
         * MongoDB values are the source of truth.
         */
        setProfileName(
          dbUser.name || auth.user?.name || "",
        );

        setProfileHandle(
          dbUser.handle || auth.user?.handle || "",
        );

        setProfileBio(
          dbUser.bio || auth.user?.bio || "",
        );

        /*
         * MongoDB / Cloudinary avatar.
         */
        if (dbUser.avatar) {
          setSavedAvatar(dbUser.avatar);

          /*
           * Generate a new cache-busting value.
           */
          setAvatarVersion(Date.now());
        }
      } catch (error: any) {
        console.error(
          "Failed to load profile:",
          error?.response?.data ||
            error?.message ||
            error,
        );
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [auth.user?._id, api]);

  /* PICK AVATAR */
  const pickAvatar = async () => {
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Allow access to your photos to change avatar.",
      );

      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  /*
   * =========================================================
   * SAVE PROFILE
   * =========================================================
   */
  const saveProfile = async () => {
    if (!auth.user) {
      Alert.alert(
        "Error",
        "User information is not available.",
      );

      return;
    }

    setLoading(true);
    saveInProgressRef.current = true;

    try {
      const formData = new FormData();

      formData.append(
        "name",
        profileName.trim(),
      );

      formData.append(
        "handle",
        profileHandle.trim().toLowerCase(),
      );

      formData.append(
        "bio",
        profileBio.trim(),
      );

      /*
       * Add the newly selected image.
       */
      if (avatarUri) {
        if (Platform.OS === "web") {
          const response = await fetch(avatarUri);

          if (!response.ok) {
            throw new Error("Failed to read selected image.");
          }

          const blob = await response.blob();

          const mimeType = blob.type || "image/jpeg";
          const extension =
            mimeType.split("/")[1] || "jpg";

          formData.append(
            "avatar",
            blob,
            `avatar.${extension}`,
          );
        } else {
          formData.append(
            "avatar",
            {
              uri: avatarUri,
              type: "image/jpeg",
              name: "avatar.jpg",
            } as any,
          );
        }
      }

      /*
       * Save profile to Render backend.
       */
      /*
       * IMPORTANT:
       * Do not set Content-Type manually for FormData.
       * Axios must generate the multipart boundary.
       */
      console.log(
        "PROFILE SAVE - avatar selected:",
        Boolean(avatarUri),
      );

      const { data } = await api.put(
        "/api/users/profile",
        formData,
      );

      if (!data?.success) {
        throw new Error(
          data?.message ||
            "Failed to update profile",
        );
      }

      /*
       * Update authenticated user.
       */
      await updateUser(data.user);

      /*
       * IMPORTANT:
       * Take avatar directly from the successful backend
       * response and immediately update the profile image.
       */
      if (data.user?.avatar) {
        console.log(
          "PROFILE SAVE - backend avatar:",
          data.user.avatar,
        );

        setSavedAvatar(data.user.avatar);

        /*
         * Generate a completely new cache-busting value.
         */
        setAvatarVersion(Date.now());
      }

      /*
       * Remove temporary local preview.
       */
      setAvatarUri(null);

      setEditMode(false);

      Alert.alert(
        "Success",
        "Profile updated successfully!",
      );
    } catch (error: any) {
      console.error(
        "Profile update error:",
        error?.response?.data ||
          error?.message ||
          error,
      );

      Alert.alert(
        "Error",
        error?.response?.data?.message ||
          error?.message ||
          "Failed to update profile",
      );
    } finally {
      saveInProgressRef.current = false;
      setLoading(false);
    }
  };

  /*
   * =========================================================
   * LOGOUT
   * =========================================================
   */
  const handleLogout = async () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Are you sure you want to sign out?",
      );

      if (!confirmed) {
        return;
      }
    } else {
      Alert.alert(
        "Sign Out",
        "Are you sure you want to sign out?",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Sign Out",
            style: "destructive",
            onPress: async () => {
              try {
                await logout();
                router.replace("/(auth)");
              } catch (error) {
                console.error(
                  "Logout error:",
                  error,
                );
              }
            },
          },
        ],
      );

      return;
    }

    try {
      await logout();
      router.replace("/(auth)");
    } catch (error) {
      console.error(
        "Logout error:",
        error,
      );
    }
  };

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            Profile
          </Text>

          {!editMode && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() =>
                setEditMode(true)
              }
            >
              <Ionicons
                name="pencil"
                size={16}
                color={Colors.primary}
              />

              <Text style={styles.editBtnText}>
                Edit
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            onPress={
              editMode
                ? pickAvatar
                : undefined
            }
            activeOpacity={
              editMode ? 0.7 : 1
            }
          >
            <View
              style={styles.avatarWrapper}
            >
              <Avatar
                name={user?.name || "?"}
                src={
                  displayAvatar ||
                  undefined
                }
                size={100}
              />

              {editMode && (
                <View
                  style={
                    styles.cameraOverlay
                  }
                >
                  <Ionicons
                    name="camera"
                    size={22}
                    color="#fff"
                  />
                </View>
              )}
            </View>
          </TouchableOpacity>

          {!editMode && (
            <View style={styles.userInfo}>
              <Text
                style={styles.userName}
              >
                {profileName}
              </Text>

              <Text
                style={styles.userHandle}
              >
                @{profileHandle}
              </Text>

              <Text
                style={styles.userEmail}
              >
                {user?.email}
              </Text>

              {user?.bio && (
                <Text
                  style={styles.userBio}
                >
                  {profileBio}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Edit Form */}
        {editMode && (
          <View style={styles.form}>
            {/* Name */}
            <View style={styles.field}>
              <Text
                style={styles.fieldLabel}
              >
                NAME
              </Text>

              <TextInput
                style={styles.input}
                value={profileName}
                onChangeText={
                  setProfileName
                }
                placeholder="Your name"
                placeholderTextColor={
                  Colors.outlineVariant
                }
                autoCapitalize="words"
              />
            </View>

            {/* Handle */}
            <View style={styles.field}>
              <Text
                style={styles.fieldLabel}
              >
                HANDLE
              </Text>

              <View
                style={styles.handleRow}
              >
                <Text
                  style={styles.atSign}
                >
                  @
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    styles.handleInput,
                  ]}
                  value={profileHandle}
                  onChangeText={(value) =>
                    setProfileHandle(
                      value
                        .toLowerCase()
                        .replace(
                          /\s/g,
                          "",
                        ),
                    )
                  }
                  placeholder="username"
                  placeholderTextColor={
                    Colors.outlineVariant
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Bio */}
            <View style={styles.field}>
              <Text
                style={styles.fieldLabel}
              >
                BIO
              </Text>

              <TextInput
                style={[
                  styles.input,
                  styles.bioInput,
                ]}
                value={profileBio}
                onChangeText={
                  setProfileBio
                }
                placeholder="Tell us about yourself..."
                placeholderTextColor={
                  Colors.outlineVariant
                }
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Save */}
            <TouchableOpacity
              onPress={saveProfile}
              disabled={loading}
              style={
                styles.saveWrapper
              }
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={[
                  Colors.primary,
                  Colors.primaryContainer,
                ]}
                start={{
                  x: 0,
                  y: 0,
                }}
                end={{
                  x: 1,
                  y: 1,
                }}
                style={styles.saveBtn}
              >
                {loading ? (
                  <ActivityIndicator
                    color={
                      Colors.onPrimary
                    }
                  />
                ) : (
                  <Text
                    style={
                      styles.saveBtnText
                    }
                  >
                    Save Changes
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              style={
                styles.cancelBtn
              }
              onPress={() => {
                setEditMode(false);
                setAvatarUri(null);

                setProfileName(
                  auth.user?.name ||
                    "",
                );

                setProfileHandle(
                  auth.user?.handle ||
                    "",
                );

                setProfileBio(
                  auth.user?.bio ||
                    "",
                );
              }}
            >
              <Text
                style={
                  styles.cancelBtnText
                }
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Profile Options */}
        {!editMode && (
          <View
            style={
              styles.optionsSection
            }
          >
            <TouchableOpacity
              style={styles.optionRow}
            >
              <View
                style={
                  styles.optionIcon
                }
              >
                <Ionicons
                  name="settings-outline"
                  size={20}
                  color={
                    Colors.onSurfaceVariant
                  }
                />
              </View>

              <Text
                style={
                  styles.optionText
                }
              >
                Setting
              </Text>

              <Ionicons
                name="chevron-forward"
                size={16}
                color={
                  Colors.outlineVariant
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionRow}
            >
              <View
                style={
                  styles.optionIcon
                }
              >
                <Ionicons
                  name="notifications-outline"
                  size={20}
                  color={
                    Colors.onSurfaceVariant
                  }
                />
              </View>

              <Text
                style={
                  styles.optionText
                }
              >
                Notifications
              </Text>

              <Ionicons
                name="chevron-forward"
                size={16}
                color={
                  Colors.outlineVariant
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionRow}
            >
              <View
                style={
                  styles.optionIcon
                }
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={
                    Colors.onSurfaceVariant
                  }
                />
              </View>

              <Text
                style={
                  styles.optionText
                }
              >
                Privacy & Security
              </Text>

              <Ionicons
                name="chevron-forward"
                size={16}
                color={
                  Colors.outlineVariant
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionRow}
            >
              <View
                style={
                  styles.optionIcon
                }
              >
                <Ionicons
                  name="help-circle-outline"
                  size={20}
                  color={
                    Colors.onSurfaceVariant
                  }
                />
              </View>

              <Text
                style={
                  styles.optionText
                }
              >
                Help & Support
              </Text>

              <Ionicons
                name="chevron-forward"
                size={16}
                color={
                  Colors.outlineVariant
                }
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Sign Out */}
        <View
          style={
            styles.signOutSection
          }
        >
          <TouchableOpacity
            style={
              styles.signOutBtn
            }
            onPress={
              handleLogout
            }
          >
            <Ionicons
              name="log-out-outline"
              size={18}
              color={Colors.error}
            />

            <Text
              style={
                styles.signOutText
              }
            >
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}