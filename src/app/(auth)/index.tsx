import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ScrollView, TextInput } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { SvgXml } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import {
  useSignIn,
  useSignUp,
} from "@clerk/expo";

import { styles } from "../../../assets/styles/AuthScreen.styles";
import { Colors } from "../../../constants/Colors";

type Mode = "login" | "register";

type VerifyingMode =
  | "login"
  | "login_mfa"
  | "register";

export default function AuthScreen() {
  const router = useRouter();

  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  // ------------------------------------------
  // State
  // ------------------------------------------

  const [mode, setMode] = useState<Mode>("login");

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [verificationCode, setVerificationCode] =
    useState("");

  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [verifyingMode, setVerifyingMode] =
    useState<VerifyingMode>("register");

  // ------------------------------------------
  // Error helper
  // ------------------------------------------

  const getErrorMessage = (error: any) => {
    return (
      error?.errors?.[0]?.longMessage ||
      error?.errors?.[0]?.message ||
      error?.message ||
      "Something went wrong."
    );
  };

  const showError = (
    error: any,
    title = "Error"
  ) => {
    console.log("AUTH ERROR:", error);

    console.log(
      "AUTH ERROR JSON:",
      JSON.stringify(error, null, 2)
    );

    Alert.alert(
      title,
      getErrorMessage(error)
    );
  };

  // ------------------------------------------
  // Finalize sign-in
  // ------------------------------------------

  const finalizeSignIn = async () => {
    if (!signIn) {
      throw new Error(
        "Sign in is not available."
      );
    }

    console.log(
      "Finalizing Clerk sign-in..."
    );

    const result = await signIn.finalize({
      navigate: ({ session }) => {
        console.log(
          "Finalized session:",
          session
        );

        if (session?.currentTask) {
          console.log(
            "Session has a current task:",
            session.currentTask
          );

          return;
        }

        router.replace("/(tabs)");
      },
    });

    if (result?.error) {
      throw result.error;
    }

    console.log(
      "Clerk sign-in finalized successfully."
    );
  };

  // ------------------------------------------
  // Finalize sign-up
  // ------------------------------------------

  const finalizeSignUp = async () => {
    if (!signUp) {
      throw new Error(
        "Sign up is not available."
      );
    }

    console.log(
      "Finalizing Clerk sign-up..."
    );

    const result = await signUp.finalize({
      navigate: ({ session }) => {
        console.log(
          "Finalized sign-up session:",
          session
        );

        if (session?.currentTask) {
          console.log(
            "Sign-up session has a current task:",
            session.currentTask
          );

          return;
        }

        router.replace("/(tabs)");
      },
    });

    if (result?.error) {
      throw result.error;
    }

    console.log(
      "Clerk sign-up finalized successfully."
    );
  };

  // ------------------------------------------
  // LOGIN / REGISTER
  // ------------------------------------------

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert(
        "Validation",
        "Please fill all fields."
      );

      return;
    }

    if (
      mode === "register" &&
      (!name.trim() || !handle.trim())
    ) {
      Alert.alert(
        "Validation",
        "Please fill all fields."
      );

      return;
    }

    setLoading(true);

    try {
      // ==========================================
      // LOGIN
      // ==========================================

      if (mode === "login") {
        if (!signIn) {
          throw new Error(
            "Sign in is not available."
          );
        }

        console.log(
          "Starting password sign-in..."
        );

        // ----------------------------------------
        // STEP 1: PASSWORD SIGN-IN
        // ----------------------------------------

        const passwordResult =
          await signIn.password({
            emailAddress: trimmedEmail,
            password: trimmedPassword,
          });

        if (passwordResult.error) {
          throw passwordResult.error;
        }

        console.log(
          "Sign-in status:",
          signIn.status
        );

        console.log(
          "Supported second factors:",
          signIn.supportedSecondFactors
        );

        // ----------------------------------------
        // LOGIN COMPLETE
        // ----------------------------------------

        if (signIn.status === "complete") {
          console.log(
            "LOGIN COMPLETE"
          );

          await finalizeSignIn();

          return;
        }

        // ----------------------------------------
        // DEVICE TRUST
        // ----------------------------------------

        if (
          signIn.status ===
          "needs_client_trust"
        ) {
          console.log(
            "================================"
          );

          console.log(
            "DEVICE TRUST REQUIRED"
          );

          console.log(
            "Supported second factors:",
            signIn.supportedSecondFactors
          );

          console.log(
            "================================"
          );

          // Find email verification factor
          const emailCodeFactor =
            signIn.supportedSecondFactors?.find(
              (factor) =>
                factor.strategy ===
                "email_code"
            );

          if (emailCodeFactor) {
            console.log(
              "Email code factor found."
            );

            // Send Device Trust verification code
            const result =
              await signIn.mfa.sendEmailCode();

            if (result.error) {
              throw result.error;
            }

            console.log(
              "DEVICE TRUST EMAIL CODE SENT"
            );

            setVerificationCode("");

            setVerifyingMode(
              "login_mfa"
            );

            setVerifying(true);

            return;
          }

          // If email code is not available
          Alert.alert(
            "Verification Unavailable",
            "Clerk requires this device to be verified, but no email verification method is available."
          );

          return;
        }

        // ----------------------------------------
        // FIRST FACTOR EMAIL CODE
        // ----------------------------------------

        if (
          signIn.status ===
            "needs_first_factor" &&
          signIn.emailCode
        ) {
          console.log(
            "FIRST FACTOR EMAIL CODE REQUIRED"
          );

          const result =
            await signIn.emailCode.sendCode();

          if (result.error) {
            throw result.error;
          }

          setVerificationCode("");

          setVerifyingMode(
            "login"
          );

          setVerifying(true);

          return;
        }

        // ----------------------------------------
        // MFA
        // ----------------------------------------

        if (
          signIn.status ===
            "needs_second_factor" &&
          signIn.mfa
        ) {
          console.log(
            "MFA REQUIRED"
          );

          const result =
            await signIn.mfa.sendEmailCode();

          if (result.error) {
            throw result.error;
          }

          setVerificationCode("");

          setVerifyingMode(
            "login_mfa"
          );

          setVerifying(true);

          return;
        }

        // ----------------------------------------
        // UNKNOWN STATUS
        // ----------------------------------------

        console.log(
          "Unhandled login status:",
          signIn.status
        );

        Alert.alert(
          "Login Incomplete",
          `Authentication requires another step: ${signIn.status}`
        );

        return;
      }

      // ==========================================
      // REGISTER
      // ==========================================

      if (!signUp) {
        throw new Error(
          "Sign up is not available."
        );
      }

      const fullName = name.trim();

      const trimmedHandle = handle
        .trim()
        .toLowerCase()
        .replace(/\s/g, "");

      const spaceIndex =
        fullName.indexOf(" ");

      const firstName =
        spaceIndex !== -1
          ? fullName.substring(
              0,
              spaceIndex
            )
          : fullName;

      const lastName =
        spaceIndex !== -1
          ? fullName.substring(
              spaceIndex + 1
            )
          : "";

      // ----------------------------------------
      // PASSWORD SIGN-UP
      // ----------------------------------------

      const createResult =
        await signUp.password({
          emailAddress:
            trimmedEmail,

          password:
            trimmedPassword,

          firstName,

          lastName,

          username:
            trimmedHandle,
        });

      if (createResult.error) {
        throw createResult.error;
      }

      console.log(
        "Sign-up status:",
        signUp.status
      );

      // ----------------------------------------
      // SEND EMAIL VERIFICATION
      // ----------------------------------------

      const sendResult =
        await signUp.verifications.sendEmailCode();

      if (sendResult.error) {
        throw sendResult.error;
      }

      console.log(
        "SIGN-UP EMAIL CODE SENT"
      );

      setVerificationCode("");

      setVerifyingMode(
        "register"
      );

      setVerifying(true);

    } catch (error: any) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------
  // VERIFY CODE
  // ------------------------------------------

  const handleVerify = async () => {
    const code =
      verificationCode.trim();

    if (!code) {
      Alert.alert(
        "Validation",
        "Please enter the verification code."
      );

      return;
    }

    setLoading(true);

    try {
      // ========================================
      // REGISTER VERIFICATION
      // ========================================

      if (
        verifyingMode ===
        "register"
      ) {
        if (!signUp) {
          throw new Error(
            "Sign up is not available."
          );
        }

        console.log(
          "Verifying registration email..."
        );

        const result =
          await signUp.verifications.verifyEmailCode(
            {
              code,
            }
          );

        if (result.error) {
          throw result.error;
        }

        console.log(
          "Registration verification status:",
          signUp.status
        );

        if (
          signUp.status ===
          "complete"
        ) {
          await finalizeSignUp();

          return;
        }

        Alert.alert(
          "Verification Failed",
          `Sign-up is not complete. Current status: ${signUp.status}`
        );

        return;
      }

      // ========================================
      // LOGIN
      // ========================================

      if (!signIn) {
        throw new Error(
          "Sign in is not available."
        );
      }

      // ========================================
      // DEVICE TRUST / MFA EMAIL CODE
      // ========================================

      if (
        verifyingMode ===
        "login_mfa"
      ) {
        if (!signIn.mfa) {
          throw new Error(
            "MFA verification is not available."
          );
        }

        console.log(
          "Verifying Device Trust / MFA code..."
        );

        const result =
          await signIn.mfa.verifyEmailCode(
            {
              code,
            }
          );

        if (result.error) {
          throw result.error;
        }
      }

      // ========================================
      // FIRST FACTOR EMAIL CODE
      // ========================================

      else if (
        verifyingMode ===
        "login"
      ) {
        if (!signIn.emailCode) {
          throw new Error(
            "Email verification is not available."
          );
        }

        console.log(
          "Verifying first-factor email code..."
        );

        const result =
          await signIn.emailCode.verifyCode(
            {
              code,
            }
          );

        if (result.error) {
          throw result.error;
        }
      }

      // ========================================
      // CHECK FINAL STATUS
      // ========================================

      console.log(
        "Login verification status:",
        signIn.status
      );

      if (
        signIn.status ===
        "complete"
      ) {
        console.log(
          "VERIFICATION COMPLETE"
        );

        await finalizeSignIn();

        return;
      }

      // ========================================
      // DEVICE TRUST STILL NOT COMPLETE
      // ========================================

      if (
        signIn.status ===
        "needs_client_trust"
      ) {
        Alert.alert(
          "Verification Required",
          "This device still needs verification. Please enter the latest code sent to your email."
        );

        return;
      }

      Alert.alert(
        "Verification Failed",
        `Authentication is not complete. Current status: ${signIn.status}`
      );

    } catch (error: any) {
      console.log(
        "Verification Error:",
        error
      );

      Alert.alert(
        "Verification Failed",
        getErrorMessage(error)
      );

    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------
  // RESEND DEVICE TRUST / MFA CODE
  // ------------------------------------------

  const resendVerificationCode =
    async () => {
      try {
        setLoading(true);

        if (
          verifyingMode ===
          "login_mfa"
        ) {
          if (!signIn?.mfa) {
            throw new Error(
              "MFA verification is not available."
            );
          }

          const result =
            await signIn.mfa.sendEmailCode();

          if (result.error) {
            throw result.error;
          }

          Alert.alert(
            "Code Sent",
            "A new verification code has been sent to your email."
          );

          return;
        }

        if (
          verifyingMode ===
          "login"
        ) {
          if (!signIn?.emailCode) {
            throw new Error(
              "Email verification is not available."
            );
          }

          const result =
            await signIn.emailCode.sendCode();

          if (result.error) {
            throw result.error;
          }

          Alert.alert(
            "Code Sent",
            "A new verification code has been sent to your email."
          );

          return;
        }

        if (
          verifyingMode ===
          "register"
        ) {
          if (!signUp) {
            throw new Error(
              "Sign up is not available."
            );
          }

          const result =
            await signUp.verifications.sendEmailCode();

          if (result.error) {
            throw result.error;
          }

          Alert.alert(
            "Code Sent",
            "A new verification code has been sent to your email."
          );
        }

      } catch (error: any) {
        showError(
          error,
          "Could Not Send Code"
        );
      } finally {
        setLoading(false);
      }
    };

  // ------------------------------------------
  // LOGO
  // ------------------------------------------

  const svgMarkup = `
    <svg
      width="63"
      height="70"
      viewBox="0 0 63 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M33.817 52.382c0-15.988 12.96-28.948 28.948-28.948v17.585c0 15.987-12.96 28.948-28.948 28.948zm-4.869 0c0-15.988-12.96-28.948-28.948-28.948v17.585c0 15.987 12.96 28.948 28.948 28.948z"
        fill="#fff"
      />

      <g clip-path="url(#a)">
        <path
          d="M31.487 0c0 8.764 7.049 15.881 15.786 15.992l.207.001-.207.001c-8.737.11-15.786 7.228-15.786 15.992 0-8.833-7.16-15.993-15.993-15.993 8.833 0 15.993-7.16 15.993-15.993"
          fill="#fff"
        />
      </g>

      <defs>
        <clipPath id="a">
          <path
            fill="#fff"
            d="M15.494 0H47.48v31.986H15.494z"
          />
        </clipPath>
      </defs>
    </svg>
  `;

  // ------------------------------------------
  // VERIFICATION SCREEN
  // ------------------------------------------

  if (verifying) {
    const isDeviceTrust =
      verifyingMode ===
      "login_mfa";

    const verificationTitle =
      isDeviceTrust
        ? "Verify this device"
        : "Verify Email";

    const verificationSubtitle =
      isDeviceTrust
        ? `For security, Clerk needs to verify this device. Enter the code sent to ${email}.`
        : `We have sent a 6-digit verification code to ${email}.`;

    return (
      <SafeAreaView
        style={styles.safe}
      >
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
        >
          <ScrollView
            contentContainerStyle={
              styles.scroll
            }
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={styles.logoRow}
            >
              <LinearGradient
                colors={[
                  Colors.primary,
                  Colors.primaryContainer,
                ]}
                style={
                  styles.logoBox
                }
              >
                <SvgXml
                  xml={svgMarkup}
                  width="50%"
                  height="50%"
                />
              </LinearGradient>

              <Text
                style={styles.appName}
              >
                InstaChat
              </Text>
            </View>

            <Text
              style={styles.heading}
            >
              {verificationTitle}
            </Text>

            <Text
              style={styles.subheading}
            >
              {verificationSubtitle}
            </Text>

            <View
              style={styles.form}
            >
              <View
                style={styles.field}
              >
                <Text
                  style={
                    styles.fieldLabel
                  }
                >
                  Verification Code
                </Text>

                <TextInput
                  style={
                    styles.input
                  }
                  value={
                    verificationCode
                  }
                  onChangeText={
                    setVerificationCode
                  }
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={
                    Colors.outlineVariant
                  }
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  maxLength={6}
                />
              </View>

              <View
                style={styles.toggleRow}
              >
                <Text
                  style={
                    styles.toggleText
                  }
                >
                  Didn't receive a code?
                </Text>

                <TouchableOpacity
                  onPress={
                    resendVerificationCode
                  }
                  disabled={loading}
                >
                  <Text
                    style={
                      styles.toggleLink
                    }
                  >
                    Resend
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={styles.toggleRow}
              >
                <Text
                  style={
                    styles.toggleText
                  }
                >
                  Wrong account?
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    setVerifying(false);
                    setVerificationCode("");
                    setPassword("");
                  }}
                  disabled={loading}
                >
                  <Text
                    style={
                      styles.toggleLink
                    }
                  >
                    Go back
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={
                  handleVerify
                }
                disabled={loading}
                activeOpacity={0.88}
                style={
                  styles.btnWrapper
                }
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
                  style={styles.btn}
                >
                  {loading ? (
                    <ActivityIndicator
                      color={
                        Colors.onPrimary
                      }
                      size="small"
                    />
                  ) : (
                    <>
                      <Text
                        style={
                          styles.btnText
                        }
                      >
                        Verify Code
                      </Text>

                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color={
                          Colors.onPrimary
                        }
                      />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------
  // LOGIN / REGISTER SCREEN
  // ------------------------------------------

  return (
    <SafeAreaView
      style={styles.safe}
    >
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={
            styles.scroll
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}

          <View
            style={styles.logoRow}
          >
            <LinearGradient
              colors={[
                Colors.primary,
                Colors.primaryContainer,
              ]}
              style={
                styles.logoBox
              }
            >
              <SvgXml
                xml={svgMarkup}
                width="50%"
                height="50%"
              />
            </LinearGradient>

            <Text
              style={styles.appName}
            >
              InstaChat
            </Text>
          </View>

          {/* Heading */}

          <Text
            style={styles.heading}
          >
            {mode === "login"
              ? "Welcome back 👋"
              : "Create account"}
          </Text>

          <Text
            style={styles.subheading}
          >
            {mode === "login"
              ? "Sign in to continue chatting"
              : "Fill in your details to get started."}
          </Text>

          <View
            style={styles.form}
          >
            {/* Register Fields */}

            {mode === "register" && (
              <>
                <View
                  style={styles.field}
                >
                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    Full Name
                  </Text>

                  <TextInput
                    style={
                      styles.input
                    }
                    value={name}
                    onChangeText={
                      setName
                    }
                    placeholder="Your name"
                    placeholderTextColor={
                      Colors.outlineVariant
                    }
                    autoCapitalize="words"
                  />
                </View>

                <View
                  style={styles.field}
                >
                  <Text
                    style={
                      styles.fieldLabel
                    }
                  >
                    Username Handle
                  </Text>

                  <View
                    style={
                      styles.handleRow
                    }
                  >
                    <Text
                      style={
                        styles.atSign
                      }
                    >
                      @
                    </Text>

                    <TextInput
                      style={[
                        styles.input,
                        styles.handleInput,
                      ]}
                      value={handle}
                      onChangeText={(
                        value
                      ) =>
                        setHandle(
                          value
                            .toLowerCase()
                            .replace(
                              /\s/g,
                              ""
                            )
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
              </>
            )}

            {/* Email */}

            <View
              style={styles.field}
            >
              <Text
                style={
                  styles.fieldLabel
                }
              >
                Email
              </Text>

              <TextInput
                style={
                  styles.input
                }
                value={email}
                onChangeText={
                  setEmail
                }
                placeholder="you@example.com"
                placeholderTextColor={
                  Colors.outlineVariant
                }
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password */}

            <View
              style={styles.field}
            >
              <Text
                style={
                  styles.fieldLabel
                }
              >
                Password
              </Text>

              <TextInput
                style={
                  styles.input
                }
                value={password}
                onChangeText={
                  setPassword
                }
                placeholder="........"
                placeholderTextColor={
                  Colors.outlineVariant
                }
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Login/Register Toggle */}

            <View
              style={styles.toggleRow}
            >
              <Text
                style={
                  styles.toggleText
                }
              >
                {mode === "login"
                  ? "Don't have an account? "
                  : "Already have an account? "}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  setMode(
                    mode === "login"
                      ? "register"
                      : "login"
                  );

                  setPassword("");
                }}
              >
                <Text
                  style={
                    styles.toggleLink
                  }
                >
                  {mode === "login"
                    ? "Sign up"
                    : "Sign in"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Submit */}

            <TouchableOpacity
              onPress={
                handleSubmit
              }
              disabled={loading}
              activeOpacity={0.88}
              style={
                styles.btnWrapper
              }
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
                style={styles.btn}
              >
                {loading ? (
                  <ActivityIndicator
                    color={
                      Colors.onPrimary
                    }
                    size="small"
                  />
                ) : (
                  <>
                    <Text
                      style={
                        styles.btnText
                      }
                    >
                      {mode === "login"
                        ? "Sign in"
                        : "Create Account"}
                    </Text>

                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color={
                        Colors.onPrimary
                      }
                    />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}