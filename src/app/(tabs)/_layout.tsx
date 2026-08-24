import React from "react";
import { Tabs } from "expo-router";
import { Platform, useWindowDimensions } from "react-native";
import { Colors } from "../../../constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import IncomingCall from "../../../components/IncomingCall";

export default function TabLayout() {
  const { width } = useWindowDimensions();

  // Web/Desktop screen
  const isWeb = Platform.OS === "web" && width >= 768;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,

          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.onSurfaceVariant,

          // WEB: Left Sidebar
          // MOBILE: Bottom Tab Bar
          tabBarPosition: isWeb ? "left" : "bottom",

          tabBarStyle: {
            backgroundColor: Colors.surfaceLowest,
            borderColor: Colors.surfaceHighest,

            ...(isWeb
              ? {
                  width: 250,
                  paddingTop: 30,
                  paddingHorizontal: 12,
                }
              : {
                  borderTopWidth: 1,
                  height: 80,
                  paddingBottom: 12,
                  paddingTop: 8,
                }),
          },

          tabBarLabelStyle: {
            fontSize: 14,
            fontWeight: "600",
          },

          tabBarItemStyle: isWeb
            ? {
                height: 55,
                borderRadius: 10,
                marginVertical: 4,
              }
            : undefined,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Messages",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={
                  focused
                    ? "chatbubbles"
                    : "chatbubbles-outline"
                }
                size={22}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={
                  focused
                    ? "search"
                    : "search-outline"
                }
                size={22}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={
                  focused
                    ? "person"
                    : "person-outline"
                }
                size={22}
                color={color}
              />
            ),
          }}
        />
      </Tabs>

      <IncomingCall />
    </>
  );
}