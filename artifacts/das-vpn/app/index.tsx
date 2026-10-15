import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  createVpnPayment,
  createVpnSession,
  recoverVpnSession,
  useGetVpnActivity,
  useGetVpnPayment,
  useGetVpnPlans,
  useGetVpnStatus,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  getSessionValue,
  RECOVERY_KEY,
  RECOVERY_SEEN_KEY,
  setSessionValue,
  TOKEN_KEY,
} from "@/lib/sessionStorage";

const navigation = [
  { key: "home", label: "Home", icon: "home" },
  { key: "plans", label: "Plans", icon: "shield" },
  { key: "activity", label: "Activity", icon: "activity" },
  { key: "profile", label: "Profile", icon: "user" },
] as const;

type Tab = (typeof navigation)[number]["key"];
type PaymentFlow = "input" | "processing" | "success" | "issue";

function randomHex(byteCount: number): Promise<string> {
  return Crypto.getRandomBytesAsync(byteCount).then((bytes) =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-KE");
}

function statusCopy(status?: string | null): string {
  switch (status) {
    case "paid": return "Verified";
    case "active": return "Active";
    case "pending": return "Pending";
    case "cancelled": return "Cancelled";
    case "expired": return "Expired";
    case "failed": return "Not verified";
    case "upcoming": return "Upcoming";
    default: return "Update";
  }
}

function IconTile({
  icon,
  color,
  background,
  size = 18,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  background: string;
  size?: number;
}) {
  return (
    <View style={[styles.iconTile, { backgroundColor: background }]}>
      <Feather name={icon} size={size} color={color} />
    </View>
  );
}

function InlineError({
  message,
  onRetry,
  colors,
}: {
  message: string;
  onRetry?: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.errorPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <IconTile icon="alert-circle" color={colors.destructive} background={colors.errorSurface} />
      <View style={styles.flexOne}>
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>Couldn’t refresh</Text>
        <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>{message}</Text>
      </View>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry">
          <Feather name="refresh-cw" size={17} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState("");
  const [paymentFlow, setPaymentFlow] = useState<PaymentFlow | null>(null);
  const [paymentPhone, setPaymentPhone] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentAttempt, setPaymentAttempt] = useState<{
    key: string;
    planCode: string;
    phoneNumber: string;
  } | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const aura = useSharedValue(0.55);
  useEffect(() => {
    aura.value = withRepeat(withTiming(1, { duration: 2200 }), -1, true);
  }, [aura]);
  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.23 + aura.value * 0.28,
    transform: [{ scale: 0.94 + aura.value * 0.06 }],
  }));

  const startDeviceSession = useCallback(async () => {
    setSessionMessage("");
    setSessionReady(false);
    try {
      const storedToken = await getSessionValue(TOKEN_KEY);
      const storedRecovery = await getSessionValue(RECOVERY_KEY);
      const isNewSession = !storedToken || !storedRecovery;
      const token = storedToken ?? await randomHex(32);
      const recovery = storedRecovery ?? await randomHex(32);
      if (isNewSession) {
        await setSessionValue(TOKEN_KEY, token);
        await setSessionValue(RECOVERY_KEY, recovery);
      }
      setRecoveryKey(recovery);
      if (isNewSession && (await getSessionValue(RECOVERY_SEEN_KEY)) !== "yes") {
        setShowRecovery(true);
      }
      await createVpnSession({ deviceToken: token, recoveryKey: recovery });
      setSessionReady(true);
    } catch {
      setSessionMessage("The secure service is temporarily unavailable. Your access is unchanged.");
    }
  }, []);

  useEffect(() => {
    void startDeviceSession();
  }, [startDeviceSession]);

  const plansQuery = useGetVpnPlans({ query: { queryKey: ["vpn", "plans"] } });
  const plans = plansQuery.data?.plans ?? [];
  const statusQuery = useGetVpnStatus({
    query: {
      queryKey: ["vpn", "status"],
      enabled: sessionReady,
      refetchInterval: sessionReady ? 5000 : false,
    },
  });
  const activityQuery = useGetVpnActivity({
    query: {
      queryKey: ["vpn", "activity"],
      enabled: sessionReady,
      refetchInterval: activeTab === "activity" ? 15000 : false,
    },
  });
  const paymentLookupId = paymentId || statusQuery.data?.latestPayment?.id || "";
  const paymentQuery = useGetVpnPayment(paymentLookupId, {
    query: {
      queryKey: ["vpn", "payment", paymentLookupId],
      enabled: sessionReady && paymentLookupId.length > 0,
      refetchInterval: paymentFlow === "processing" && !timedOut ? 3000 : false,
    },
  });

  useEffect(() => {
    if (!selectedPlanCode && plans.length) {
      setSelectedPlanCode(plans.find((plan) => plan.code === "monthly")?.code ?? plans[0].code);
    }
  }, [plans, selectedPlanCode]);

  useEffect(() => {
    if (paymentQuery.data?.status === "paid" && paymentFlow === "processing") {
      setPaymentFlow("success");
      setTimedOut(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void statusQuery.refetch();
      void activityQuery.refetch();
    } else if (
      paymentQuery.data &&
      ["failed", "cancelled", "expired"].includes(paymentQuery.data.status) &&
      paymentFlow === "processing"
    ) {
      setPaymentFlow("issue");
    }
  }, [paymentQuery.data, paymentFlow, statusQuery, activityQuery]);

  useEffect(() => {
    if (paymentFlow !== "processing") return;
    setTimedOut(false);
    const timer = setTimeout(() => setTimedOut(true), 120000);
    return () => clearTimeout(timer);
  }, [paymentFlow, paymentId]);

  const currentPlan = plans.find((plan) => plan.code === selectedPlanCode);
  const subscription = statusQuery.data?.subscription ?? null;
  const hasActiveSubscription = Boolean(
    subscription?.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now(),
  );
  const latestPayment = paymentQuery.data ?? null;
  const selectedPlanLabel = currentPlan?.label ?? "Selected plan";
  const openPayment = () => {
    if (!currentPlan) return;
    setPaymentError("");
    setPaymentPhone("");
    setPaymentFlow("input");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const closePaymentFlow = () => {
    setPaymentFlow(null);
    setPaymentError("");
  };

  const finishRecoveryNotice = async () => {
    await setSessionValue(RECOVERY_SEEN_KEY, "yes");
    setShowRecovery(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const submitPayment = async () => {
    Keyboard.dismiss();
    setPaymentError("");
    const digits = paymentPhone.replace(/[^\d]/g, "");
    const nationalDigits = digits.startsWith("254")
      ? digits.slice(3)
      : digits.startsWith("0")
        ? digits.slice(1)
        : digits;
    if (nationalDigits.length !== 9 || !/^[17]/.test(nationalDigits)) {
      setPaymentError("Enter a valid 9-digit Kenyan M-Pesa phone number.");
      return;
    }
    if (!sessionReady || !currentPlan) {
      setPaymentError("Your secure session or plan details are still loading. Try again shortly.");
      return;
    }
    setSubmittingPayment(true);
    try {
      const phoneNumber = `+254${nationalDigits}`;
      const key = paymentAttempt?.planCode === currentPlan.code &&
        paymentAttempt.phoneNumber === phoneNumber
        ? paymentAttempt.key
        : await randomHex(16);
      setPaymentAttempt({ key, planCode: currentPlan.code, phoneNumber });
      const payment = await createVpnPayment(
        {
          planCode: currentPlan.code as Parameters<typeof createVpnPayment>[0]["planCode"],
          phoneNumber,
        },
        { headers: { "idempotency-key": key } },
      );
      setPaymentAttempt(null);
      setPaymentId(payment.id);
      setTimedOut(false);
      setPaymentFlow("processing");
      setActiveTab("activity");
      void statusQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = error && typeof error === "object" && "data" in error
        ? (error as { data?: { code?: unknown } }).data?.code
        : undefined;
      const reason = `${String(code ?? "")} ${message}`;
      if (reason.includes("PAYMENT_REQUEST_PENDING")) {
        setPaymentError("A previous M-Pesa request is still pending. Check Activity before trying again.");
      } else if (reason.includes("STK_PUSH_REJECTED")) {
        setPaymentAttempt(null);
        setPaymentError("Safaricom did not accept the request. No payment was taken.");
      } else if (reason.includes("SERVER_NOT_CONFIGURED")) {
        setPaymentError("M-Pesa payment is temporarily unavailable. No payment was requested.");
      } else {
        setPaymentError("We couldn’t start the payment. No access was activated. Please try again.");
      }
    } finally {
      setSubmittingPayment(false);
    }
  };

  const recoverDevice = async () => {
    setPaymentError("");
    const oldRecovery = recoveryInput.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(oldRecovery)) {
      setPaymentError("Enter the 64-character recovery key from your other device.");
      return;
    }
    setRecovering(true);
    try {
      const token = await randomHex(32);
      const nextRecovery = await randomHex(32);
      await recoverVpnSession({
        recoveryKey: oldRecovery,
        deviceToken: token,
        nextRecoveryKey: nextRecovery,
      });
      await setSessionValue(TOKEN_KEY, token);
      await setSessionValue(RECOVERY_KEY, nextRecovery);
      setRecoveryKey(nextRecovery);
      setRecoveryInput("");
      setSessionReady(true);
      setShowRecovery(true);
      await statusQuery.refetch();
    } catch {
      setPaymentError("That recovery key could not be verified. No subscription data was changed.");
    } finally {
      setRecovering(false);
    }
  };

  const showHeaderBack = paymentFlow !== null || activeTab !== "home";
  const onHeaderBack = () => {
    if (paymentFlow === "input") closePaymentFlow();
    else if (paymentFlow === "processing" || paymentFlow === "issue" || paymentFlow === "success") {
      closePaymentFlow();
      setActiveTab("activity");
    } else setActiveTab("home");
  };

  const contentTop = Platform.OS === "web" ? 67 : insets.top + 14;
  const contentBottom = Platform.OS === "web" ? 118 : 104 + insets.bottom;
  const paymentName = latestPayment?.planCode
    ? plans.find((plan) => plan.code === latestPayment.planCode)?.label ?? selectedPlanLabel
    : selectedPlanLabel;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.background, colors.backgroundGlow, colors.background]}
        locations={[0, 0.38, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.topHalo}>
        <LinearGradient
          colors={["rgba(37, 90, 255, 0.15)", "rgba(37, 90, 255, 0)"]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: contentTop, paddingBottom: contentBottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          {showHeaderBack ? (
            <Pressable
              onPress={onHeaderBack}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
              testID="screen-back"
            >
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </Pressable>
          ) : (
            <View style={styles.brand}>
              <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
                <Feather name="shield" size={18} color={colors.primaryForeground} />
              </View>
              <View>
                <Text style={[styles.brandName, { color: colors.foreground }]}>DAS VPN</Text>
                <Text style={[styles.brandCaption, { color: colors.mutedForeground }]}>PRIVATE BY DESIGN</Text>
              </View>
            </View>
          )}
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {paymentFlow ? "Payment" : activeTab === "plans" ? "Subscription Plans" : ""}
          </Text>
          <Pressable
            onPress={() => {
              setPaymentError("");
              setRecoveryInput("");
              setShowRecovery(true);
            }}
            style={[styles.keyButton, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Open device recovery"
            testID="recovery-open"
          >
            <Feather name="key" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {!paymentFlow && activeTab === "home" ? (
          <>
            <View style={styles.heroIntro}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>YOUR PRIVATE CONNECTION</Text>
              <Text style={[styles.heroTitle, { color: colors.foreground }]}>Private access,{"\n"}on your terms.</Text>
              <Text style={[styles.heroCopy, { color: colors.mutedForeground }]}>
                Anonymous by default. Pay once with M-Pesa, then access activates after verification.
              </Text>
            </View>
            <View style={[styles.connectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.connectionMeta}>
                <View style={styles.statusPill}>
                  <View style={[styles.statusDot, { backgroundColor: hasActiveSubscription ? colors.success : colors.mutedForeground }]} />
                  <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                    {hasActiveSubscription ? "CONNECTED" : sessionReady ? "NOT CONNECTED" : "SETTING UP"}
                  </Text>
                </View>
                <Text style={[styles.anonymousLabel, { color: colors.accent }]}>ANONYMOUS SESSION</Text>
              </View>
              <View style={styles.orbArea}>
                <Animated.View
                  style={[
                    styles.orbAura,
                    { backgroundColor: hasActiveSubscription ? colors.success : colors.primary },
                    auraStyle,
                  ]}
                />
                <View style={[styles.orbRingOuter, { borderColor: colors.orbEdge }]}>
                  <Pressable
                    onPress={() => setActiveTab(hasActiveSubscription ? "activity" : "plans")}
                    style={({ pressed }) => [styles.orb, pressed ? styles.pressed : null]}
                    accessibilityRole="button"
                    accessibilityLabel={hasActiveSubscription ? "View active subscription" : "Choose a VPN plan"}
                    testID="vpn-connect"
                  >
                    <LinearGradient
                      colors={hasActiveSubscription ? [colors.success, colors.primary] : ["#101c43", "#0b1431"]}
                      style={styles.orbInner}
                    >
                      <Feather
                        name={hasActiveSubscription ? "check" : "power"}
                        size={32}
                        color={hasActiveSubscription ? colors.primaryForeground : "#c8d8ff"}
                      />
                      <Text style={[styles.orbLabel, { color: colors.foreground }]}>
                        {hasActiveSubscription ? "CONNECTED" : "CONNECT"}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
              <Text style={[styles.connectionTitle, { color: colors.foreground }]}>
                {hasActiveSubscription ? "Your subscription is active" : "Stay private online"}
              </Text>
              <Text style={[styles.connectionSubcopy, { color: colors.mutedForeground }]}>
                {hasActiveSubscription && subscription?.expiresAt
                  ? `Active until ${formatDate(subscription.expiresAt)}`
                  : "Choose a plan to start your subscription"}
              </Text>
            </View>

            <View style={styles.sectionRow}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your subscription</Text>
                <Text style={[styles.sectionSubcopy, { color: colors.mutedForeground }]}>
                  {hasActiveSubscription ? "Verified access on this device" : "No active subscription"}
                </Text>
              </View>
              <Pressable
                onPress={() => setActiveTab("plans")}
                style={[styles.textAction, { backgroundColor: colors.secondary }]}
                accessibilityRole="button"
                testID="open-plans"
              >
                <Text style={[styles.actionLabel, { color: colors.primary }]}>
                  {hasActiveSubscription ? "View plans" : "View plans"}
                </Text>
                <Feather name="arrow-right" size={14} color={colors.primary} />
              </Pressable>
            </View>
            {hasActiveSubscription && subscription ? (
              <View style={[styles.subscriptionSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <IconTile icon="shield" color={colors.accent} background={colors.iconSurface} />
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                    {plans.find((plan) => plan.code === subscription.planCode)?.label ?? "Active subscription"}
                  </Text>
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                    Expires {formatDate(subscription.expiresAt)}
                  </Text>
                </View>
                <View style={[styles.verifiedBadge, { backgroundColor: colors.successSurface }]}>
                  <Text style={[styles.verifiedText, { color: colors.success }]}>VERIFIED</Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.sectionRow, styles.serverHeading]}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Available servers</Text>
                <Text style={[styles.sectionSubcopy, { color: colors.mutedForeground }]}>Demo previews · not live locations</Text>
              </View>
              <Feather name="globe" size={19} color={colors.accent} />
            </View>
            <View style={styles.demoGrid}>
              {[
                { country: "Germany", city: "Frankfurt", code: "DE", flag: ["#1a1a1a", "#d4474e", "#e4bc50"] },
                { country: "Netherlands", city: "Amsterdam", code: "NL", flag: ["#d4474e", "#e9edf7", "#4169a9"] },
              ].map((server) => (
                <View
                  key={server.code}
                  style={[styles.demoCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  testID={`server-preview-${server.code.toLowerCase()}`}
                >
                  <View style={styles.demoCardTop}>
                    <View style={styles.flag}>
                      {server.flag.map((stripe, index) => (
                        <View key={`${server.code}-${stripe}`} style={{ flex: 1, backgroundColor: stripe, width: "100%" }} />
                      ))}
                    </View>
                    <Text style={[styles.demoTag, { color: colors.accent }]}>DEMO</Text>
                  </View>
                  <Text style={[styles.demoCountry, { color: colors.foreground }]}>{server.country}</Text>
                  <Text style={[styles.demoCity, { color: colors.mutedForeground }]}>{server.city}</Text>
                </View>
              ))}
            </View>
            {sessionMessage || statusQuery.isError ? (
              <InlineError
                message={sessionMessage || "Subscription details could not be refreshed. Retry to check your status."}
                onRetry={() => void (sessionMessage ? startDeviceSession() : statusQuery.refetch())}
                colors={colors}
              />
            ) : null}
            <View style={styles.privacyFootnote}>
              <Feather name="lock" size={13} color={colors.mutedForeground} />
              <Text style={[styles.privacyCopy, { color: colors.mutedForeground }]}>
                Your M-Pesa PIN stays on your phone. DAS never asks for or stores it.
              </Text>
            </View>
          </>
        ) : null}

        {!paymentFlow && activeTab === "plans" ? (
          <>
            <View style={styles.screenIntro}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>SIMPLE, ONE-TIME PAYMENTS</Text>
              <Text style={[styles.pageTitle, { color: colors.foreground }]}>Choose your plan</Text>
              <Text style={[styles.heroCopy, { color: colors.mutedForeground }]}>
                Every package is paid once through M-Pesa. No auto-renewal.
              </Text>
            </View>
            {plansQuery.isLoading ? (
              <View style={styles.skeletonGroup}>
                {[0, 1, 2, 3].map((item) => (
                  <View key={item} style={[styles.planSkeleton, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.skeletonLine, { backgroundColor: colors.secondary, width: "45%" }]} />
                    <View style={[styles.skeletonLine, { backgroundColor: colors.secondary, width: "28%" }]} />
                  </View>
                ))}
              </View>
            ) : plansQuery.isError ? (
              <InlineError message="Your plan options could not be loaded." onRetry={() => void plansQuery.refetch()} colors={colors} />
            ) : plans.length === 0 ? (
              <View style={[styles.emptyPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <IconTile icon="tag" color={colors.accent} background={colors.iconSurface} />
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>Plans are unavailable</Text>
                <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>Please check back when the secure service responds.</Text>
                <Pressable onPress={() => void plansQuery.refetch()} style={styles.linkButton} accessibilityRole="button">
                  <Text style={[styles.actionLabel, { color: colors.primary }]}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.planList}>
                {plans.map((plan) => {
                  const selected = selectedPlanCode === plan.code;
                  const isCurrent = hasActiveSubscription && subscription?.planCode === plan.code;
                  return (
                    <Pressable
                      key={plan.code}
                      onPress={() => {
                        setSelectedPlanCode(plan.code);
                        void Haptics.selectionAsync();
                      }}
                      style={[
                        styles.planCard,
                        {
                          backgroundColor: selected ? colors.selectedCard : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${plan.label}, KES ${formatAmount(plan.amountKes)}, ${plan.durationDays} days`}
                      testID={`plan-${plan.code}`}
                    >
                      <View style={styles.planCopy}>
                        <View style={styles.planNameLine}>
                          <Text style={[styles.planName, { color: colors.foreground }]}>{plan.label}</Text>
                          {plan.badge ? (
                            <View style={[styles.planBadge, { backgroundColor: colors.badgeSurface }]}>
                              <Text style={[styles.planBadgeText, { color: colors.accent }]}>{plan.badge}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={[styles.planPrice, { color: colors.foreground }]}>
                          KES {formatAmount(plan.amountKes)}
                        </Text>
                        <Text style={[styles.planDuration, { color: colors.mutedForeground }]}>
                          {plan.durationDays} {plan.durationDays === 1 ? "day" : "days"} of VPN access
                          {isCurrent ? " · CURRENT" : ""}
                        </Text>
                      </View>
                      <View style={[styles.radioOuter, { borderColor: selected ? colors.primary : colors.radioBorder }]}>
                        {selected ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <View style={[styles.secureNote, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <IconTile icon="lock" color={colors.primary} background={colors.iconSurface} size={16} />
              <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                M-Pesa confirms your payment before access is activated.
              </Text>
            </View>
            <Pressable
              onPress={openPayment}
              disabled={!currentPlan || plansQuery.isLoading}
              style={({ pressed }) => [
                styles.primaryButton,
                { opacity: !currentPlan || plansQuery.isLoading ? 0.52 : 1 },
                pressed ? styles.pressed : null,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !currentPlan || plansQuery.isLoading }}
              testID="plans-continue"
            >
              <LinearGradient colors={[colors.primary, colors.accent]} style={styles.primaryButtonGradient}>
                <Text style={styles.primaryButtonText}>Continue</Text>
                <Feather name="arrow-right" size={17} color="#ffffff" />
              </LinearGradient>
            </Pressable>
          </>
        ) : null}

        {paymentFlow === "input" ? (
          <>
            <View style={[styles.paymentPlanCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <IconTile icon="calendar" color={colors.primary} background={colors.iconSurface} size={19} />
              <View style={styles.flexOne}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>{currentPlan?.label ?? selectedPlanLabel}</Text>
                <Text style={[styles.paymentPrice, { color: colors.foreground }]}>
                  KES {currentPlan ? formatAmount(currentPlan.amountKes) : "—"}
                </Text>
                <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                  {currentPlan?.durationDays ?? "—"} days of VPN access
                </Text>
              </View>
            </View>
            <View style={styles.paymentForm}>
              <Text style={[styles.inputTitle, { color: colors.foreground }]}>M-Pesa payment</Text>
              <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                Enter your M-Pesa phone number to receive the STK Push.
              </Text>
              <View style={[styles.phoneField, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.keBadge, { backgroundColor: colors.successSurface }]}>
                  <Text style={[styles.keText, { color: colors.success }]}>KE</Text>
                </View>
                <Text style={[styles.countryPrefix, { color: colors.mutedForeground }]}>+254</Text>
                <TextInput
                  value={paymentPhone}
                  onChangeText={setPaymentPhone}
                  placeholder="712 345 678"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={16}
                  style={[styles.phoneInput, { color: colors.foreground }]}
                  accessibilityLabel="M-Pesa phone number"
                  testID="payment-phone"
                />
              </View>
              {paymentError ? (
                <View style={[styles.formError, { backgroundColor: colors.errorSurface }]}>
                  <Feather name="alert-circle" size={15} color={colors.destructive} />
                  <Text style={[styles.formErrorText, { color: colors.destructive }]}>{paymentError}</Text>
                </View>
              ) : null}
              {!sessionReady ? (
                <View style={[styles.sessionNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {sessionMessage ? <Feather name="alert-circle" size={16} color={colors.destructive} /> : <ActivityIndicator size="small" color={colors.accent} />}
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground, flex: 1 }]}>
                    {sessionMessage || "Preparing your anonymous secure session."}
                  </Text>
                  {sessionMessage ? <Pressable onPress={() => void startDeviceSession()}><Text style={{ color: colors.primary }}>Retry</Text></Pressable> : null}
                </View>
              ) : null}
              <Pressable
                onPress={() => void submitPayment()}
                disabled={submittingPayment || !sessionReady}
                style={({ pressed }) => [
                  styles.mpesaButton,
                  { opacity: submittingPayment || !sessionReady ? 0.58 : 1 },
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: submittingPayment || !sessionReady }}
                testID="payment-submit"
              >
                {submittingPayment ? (
                  <ActivityIndicator color="#07151b" />
                ) : (
                  <>
                    <Feather name="smartphone" size={17} color="#07151b" />
                    <Text style={styles.mpesaButtonText}>Pay with M-Pesa</Text>
                  </>
                )}
              </Pressable>
              <View style={[styles.mpesaInfo, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.mpesaMark, { backgroundColor: colors.successSurface }]}>
                  <Text style={[styles.mpesaMarkText, { color: colors.success }]}>M</Text>
                </View>
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Secure payment</Text>
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                    Approve the prompt on your phone using your M-Pesa PIN. DAS never sees your PIN.
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {paymentFlow === "processing" ? (
          <View style={styles.processingScreen}>
            <View style={styles.phoneIllustration}>
              <View style={[styles.phoneOutline, { borderColor: colors.orbEdge }]}>
                <View style={[styles.phoneNotch, { backgroundColor: colors.border }]} />
                <Animated.View style={[styles.phoneSpinner, auraStyle, { borderColor: colors.primary }]} />
              </View>
              <View style={[styles.sparkle, styles.sparkleLeft, { backgroundColor: colors.accent }]} />
              <View style={[styles.sparkle, styles.sparkleRight, { backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.processingTitle, { color: colors.foreground }]}>Payment verification</Text>
            <Text style={[styles.processingSubtitle, { color: colors.mutedForeground }]}>
              {timedOut
                ? "This is taking longer than expected. We’ll keep your request safe."
                : "Approve the M-Pesa prompt. Access starts only after payment is verified."}
            </Text>
            <View style={[styles.stepsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { icon: "check", title: "STK Push sent", copy: "Waiting for your M-Pesa PIN", complete: true },
                { icon: "refresh-cw", title: "Payment verification", copy: "Checking securely with M-Pesa", active: !timedOut },
                { icon: "shield", title: "Subscription activation", copy: "After payment is confirmed" },
              ].map((step, index) => (
                <View key={step.title} style={styles.stepRow}>
                  <View style={[
                    styles.stepIcon,
                    { backgroundColor: step.complete ? colors.success : step.active ? colors.iconSurface : colors.secondary },
                    step.active ? { borderWidth: 1, borderColor: colors.primary } : null,
                  ]}>
                    {step.active ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name={step.icon as React.ComponentProps<typeof Feather>["name"]} size={14} color={step.complete ? "#061b16" : colors.mutedForeground} />}
                  </View>
                  <View style={styles.flexOne}>
                    <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
                    <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>{step.copy}</Text>
                  </View>
                  {index < 2 ? <View style={[styles.stepRule, { backgroundColor: colors.border }]} /> : null}
                </View>
              ))}
            </View>
            {timedOut ? (
              <View style={[styles.timeoutNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="clock" size={16} color={colors.accent} />
                <Text style={[styles.smallCopy, { color: colors.mutedForeground, flex: 1 }]}>
                  Still pending. Check your phone or refresh the payment status. No subscription is active yet.
                </Text>
                <Pressable onPress={() => { setTimedOut(false); void paymentQuery.refetch(); }} accessibilityRole="button" testID="payment-retry">
                  <Feather name="refresh-cw" size={17} color={colors.primary} />
                </Pressable>
              </View>
            ) : null}
            {paymentQuery.isError ? (
              <InlineError message="Payment status could not be checked. It is not marked as paid." onRetry={() => void paymentQuery.refetch()} colors={colors} />
            ) : null}
            <Pressable
              onPress={() => { setPaymentFlow(null); setActiveTab("activity"); }}
              style={styles.quietButton}
              accessibilityRole="button"
              testID="payment-view-activity"
            >
              <Text style={[styles.quietButtonText, { color: colors.mutedForeground }]}>View Activity</Text>
            </Pressable>
          </View>
        ) : null}

        {paymentFlow === "success" && latestPayment?.status === "paid" ? (
          <View style={styles.successScreen}>
            <View style={styles.successBurst}>
              <View style={[styles.successHalo, { backgroundColor: colors.successSurface }]} />
              <View style={[styles.successOrb, { backgroundColor: colors.successSurface, borderColor: colors.success }]}>
                <Feather name="check" size={34} color={colors.success} />
              </View>
              <View style={[styles.successSpark, styles.sparkOne, { backgroundColor: colors.accent }]} />
              <View style={[styles.successSpark, styles.sparkTwo, { backgroundColor: colors.success }]} />
              <View style={[styles.successSpark, styles.sparkThree, { backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Payment successful</Text>
            <Text style={[styles.successSubtitle, { color: colors.mutedForeground }]}>Your subscription is now active.</Text>
            <View style={[styles.paymentPlanCard, styles.successPlanCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.flexOne}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>{paymentName}</Text>
                <Text style={[styles.paymentPrice, { color: colors.foreground }]}>KES {formatAmount(latestPayment.amountKes)}</Text>
                <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                  {latestPayment.expiresAt ? `Access until ${formatDate(latestPayment.expiresAt)}` : "Verified by M-Pesa"}
                </Text>
              </View>
              <View style={[styles.verifiedBadge, { backgroundColor: colors.successSurface }]}>
                <Text style={[styles.verifiedText, { color: colors.success }]}>PAID</Text>
              </View>
            </View>
            <View style={[styles.successInfo, { backgroundColor: colors.successSurface, borderColor: colors.successBorder }]}>
              <Feather name="shield" size={17} color={colors.success} />
              <View style={styles.flexOne}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>Subscription verified</Text>
                <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>Payment status confirmed by the secure service.</Text>
              </View>
            </View>
            <Pressable
              onPress={() => { setPaymentFlow(null); setActiveTab("home"); }}
              style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}
              accessibilityRole="button"
              testID="payment-success-home"
            >
              <LinearGradient colors={[colors.primary, colors.accent]} style={styles.primaryButtonGradient}>
                <Text style={styles.primaryButtonText}>Done</Text>
                <Feather name="arrow-right" size={17} color="#ffffff" />
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => { setPaymentFlow(null); setActiveTab("activity"); }} style={styles.quietButton} accessibilityRole="button">
              <Text style={[styles.quietButtonText, { color: colors.mutedForeground }]}>View receipt activity</Text>
            </Pressable>
          </View>
        ) : null}

        {paymentFlow === "issue" ? (
          <View style={styles.issueScreen}>
            <View style={[styles.issueIcon, { backgroundColor: colors.errorSurface }]}>
              <Feather name="x" size={30} color={colors.destructive} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>
              {latestPayment?.status === "cancelled" ? "Payment cancelled" : latestPayment?.status === "expired" ? "Request expired" : "Payment not verified"}
            </Text>
            <Text style={[styles.processingSubtitle, { color: colors.mutedForeground }]}>
              No subscription was activated. You can check Activity or try again.
            </Text>
            <View style={styles.issueActions}>
              <Pressable onPress={() => { closePaymentFlow(); setActiveTab("plans"); }} style={styles.primaryButton} accessibilityRole="button" testID="payment-try-again">
                <LinearGradient colors={[colors.primary, colors.accent]} style={styles.primaryButtonGradient}>
                  <Text style={styles.primaryButtonText}>Choose a plan</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={() => { closePaymentFlow(); setActiveTab("activity"); }} style={styles.quietButton} accessibilityRole="button">
                <Text style={[styles.quietButtonText, { color: colors.mutedForeground }]}>View Activity</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!paymentFlow && activeTab === "activity" ? (
          <>
            <View style={styles.screenIntro}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>YOUR DEVICE HISTORY</Text>
              <Text style={[styles.pageTitle, { color: colors.foreground }]}>Your activity</Text>
              <Text style={[styles.heroCopy, { color: colors.mutedForeground }]}>Only verified service records are shown here.</Text>
            </View>
            {statusQuery.isLoading && sessionReady ? (
              <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.skeletonLine, { backgroundColor: colors.secondary, width: "44%" }]} />
                <View style={[styles.skeletonLine, { backgroundColor: colors.secondary, width: "72%" }]} />
              </View>
            ) : statusQuery.isError ? (
              <InlineError message="Subscription status is temporarily unavailable." onRetry={() => void statusQuery.refetch()} colors={colors} />
            ) : (
              <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.sectionRow}>
                  <View>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Current subscription</Text>
                    <Text style={[styles.sectionSubcopy, { color: colors.mutedForeground }]}>This device only</Text>
                  </View>
                  <Feather name={hasActiveSubscription ? "check-circle" : "shield"} size={18} color={hasActiveSubscription ? colors.success : colors.mutedForeground} />
                </View>
                {hasActiveSubscription && subscription ? (
                  <>
                    <Text style={[styles.activityTitle, { color: colors.foreground }]}>
                      {plans.find((plan) => plan.code === subscription.planCode)?.label ?? "Active subscription"}
                    </Text>
                    <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>Expires {formatDate(subscription.expiresAt)}</Text>
                  </>
                ) : paymentQuery.data?.status === "pending" ? (
                  <View style={[styles.pendingBanner, { backgroundColor: colors.pendingSurface }]}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[styles.smallCopy, { color: colors.foreground, flex: 1 }]}>
                      Payment pending. Access activates only after M-Pesa confirms payment.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.emptySubscription}>
                    <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>No active subscription on this device.</Text>
                    <Pressable onPress={() => setActiveTab("plans")} accessibilityRole="button">
                      <Text style={[styles.actionLabel, { color: colors.primary }]}>View plans</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
            <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.sectionRow}>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Payment & access history</Text>
                  <Text style={[styles.sectionSubcopy, { color: colors.mutedForeground }]}>From your secure session</Text>
                </View>
                <Pressable
                  onPress={() => void activityQuery.refetch()}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh activity"
                  testID="activity-refresh"
                >
                  {activityQuery.isFetching ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="refresh-cw" size={17} color={colors.primary} />}
                </Pressable>
              </View>
              {activityQuery.isLoading ? (
                <View style={styles.skeletonGroup}>
                  {[0, 1].map((item) => <View key={item} style={[styles.activitySkeleton, { backgroundColor: colors.secondary }]} />)}
                </View>
              ) : activityQuery.isError ? (
                <InlineError message="Activity could not be loaded." onRetry={() => void activityQuery.refetch()} colors={colors} />
              ) : activityQuery.data?.activities.length ? (
                <View style={styles.activityList}>
                  {activityQuery.data.activities.map((item) => (
                    <View key={item.id} style={[styles.activityItem, { borderTopColor: colors.border }]}>
                      <IconTile
                        icon={item.type === "activation" ? "shield" : item.type === "expiry" ? "clock" : "credit-card"}
                        color={item.status === "paid" || item.status === "active" ? colors.success : item.status === "pending" ? colors.accent : colors.mutedForeground}
                        background={item.status === "paid" || item.status === "active" ? colors.successSurface : colors.iconSurface}
                      />
                      <View style={styles.flexOne}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.planLabel}</Text>
                        <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                          {item.type === "payment" ? `KES ${formatAmount(item.amountKes)} · ` : ""}{formatDate(item.occurredAt)}
                        </Text>
                        {item.expiresAt ? <Text style={[styles.microCopy, { color: colors.mutedForeground }]}>Expires {formatDate(item.expiresAt)}</Text> : null}
                      </View>
                      <View style={[
                        styles.statusTag,
                        { backgroundColor: item.status === "paid" || item.status === "active" ? colors.successSurface : item.status === "pending" ? colors.pendingSurface : colors.secondary },
                      ]}>
                        <Text style={[
                          styles.statusTagText,
                          { color: item.status === "paid" || item.status === "active" ? colors.success : item.status === "pending" ? colors.accent : colors.mutedForeground },
                        ]}>{statusCopy(item.status)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyActivity}>
                  <View style={[styles.emptyActivityIcon, { backgroundColor: colors.iconSurface }]}>
                    <Feather name="clock" size={20} color={colors.accent} />
                  </View>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>No activity yet</Text>
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                    Payments and access events will appear here once recorded.
                  </Text>
                </View>
              )}
            </View>
            {paymentFlow === null && paymentId && paymentQuery.isError ? (
              <InlineError message="The latest payment status could not be checked." onRetry={() => void paymentQuery.refetch()} colors={colors} />
            ) : null}
          </>
        ) : null}

        {!paymentFlow && activeTab === "profile" ? (
          <>
            <View style={styles.screenIntro}>
              <Text style={[styles.eyebrow, { color: colors.accent }]}>PRIVATE BY DESIGN</Text>
              <Text style={[styles.pageTitle, { color: colors.foreground }]}>Your device</Text>
              <Text style={[styles.heroCopy, { color: colors.mutedForeground }]}>
                No registration, login, or password. Your subscription belongs to this anonymous session.
              </Text>
            </View>
            <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.profileIdentity}>
                <View style={[styles.profileAvatar, { backgroundColor: colors.iconSurface, borderColor: colors.border }]}>
                  <Feather name="shield" size={23} color={colors.accent} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Anonymous device session</Text>
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                    {sessionReady ? "Secure session ready" : sessionMessage || "Establishing secure session"}
                  </Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: sessionReady ? colors.success : colors.accent }]} />
              </View>
              <View style={[styles.profileDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.privacyCopy, { color: colors.mutedForeground }]}>
                Your device token stays on this device. Recovery keys are the only way to restore access elsewhere.
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setPaymentError("");
                setRecoveryInput("");
                setShowRecovery(true);
              }}
              style={[styles.profileAction, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
              testID="profile-recovery"
            >
              <IconTile icon="key" color={colors.accent} background={colors.iconSurface} />
              <View style={styles.flexOne}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>Device recovery key</Text>
                <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>Save or restore private access</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
            {hasActiveSubscription && subscription ? (
              <View style={[styles.subscriptionSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <IconTile icon="calendar" color={colors.primary} background={colors.iconSurface} />
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                    {plans.find((plan) => plan.code === subscription.planCode)?.label ?? "Subscription"}
                  </Text>
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>Expires {formatDate(subscription.expiresAt)}</Text>
                </View>
              </View>
            ) : null}
            {sessionMessage ? (
              <InlineError message={sessionMessage} onRetry={() => void startDeviceSession()} colors={colors} />
            ) : null}
            <View style={styles.privacyFootnote}>
              <Feather name="lock" size={13} color={colors.mutedForeground} />
              <Text style={[styles.privacyCopy, { color: colors.mutedForeground }]}>No account. No password. Your identity remains yours.</Text>
            </View>
          </>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.bottomNav,
          {
            backgroundColor: colors.navSurface,
            borderColor: colors.border,
            paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 9),
          },
        ]}
      >
        {navigation.map((item) => {
          const selected = activeTab === item.key && paymentFlow === null;
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                if (paymentFlow) closePaymentFlow();
                setActiveTab(item.key);
                if (item.key === "activity") void activityQuery.refetch();
              }}
              style={styles.navButton}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              testID={`tab-${item.key}`}
            >
              <View style={selected ? [styles.navIconActive, { backgroundColor: colors.iconSurface }] : null}>
                <Feather name={item.icon} size={18} color={selected ? colors.primary : colors.mutedForeground} />
              </View>
              <Text style={[styles.navLabel, { color: selected ? colors.primary : colors.mutedForeground }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Modal visible={showRecovery} transparent animationType="fade" onRequestClose={() => setShowRecovery(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.recoverySheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.recoveryIcon, { backgroundColor: colors.iconSurface }]}>
              <Feather name="key" size={21} color={colors.accent} />
            </View>
            {recoveryKey ? (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Save your recovery key</Text>
                <Text style={[styles.recoveryDescription, { color: colors.mutedForeground }]}>
                  This key restores your subscription if you change or reinstall your device. Keep it private. It rotates after recovery.
                </Text>
                <Text selectable style={[styles.recoveryCode, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} testID="recovery-key">
                  {recoveryKey.match(/.{1,8}/g)?.join(" ") ?? recoveryKey}
                </Text>
                <Pressable onPress={() => void finishRecoveryNotice()} style={styles.primaryButton} accessibilityRole="button" testID="recovery-saved">
                  <LinearGradient colors={[colors.primary, colors.accent]} style={styles.primaryButtonGradient}>
                    <Text style={styles.primaryButtonText}>I saved this key</Text>
                  </LinearGradient>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Restore access</Text>
                <Text style={[styles.recoveryDescription, { color: colors.mutedForeground }]}>
                  Enter the recovery key saved on your previous device. No account or phone lookup is used.
                </Text>
                <TextInput
                  value={recoveryInput}
                  onChangeText={setRecoveryInput}
                  placeholder="64-character recovery key"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.recoveryInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  accessibilityLabel="Recovery key"
                  testID="recovery-input"
                />
                {paymentError ? <Text style={[styles.formErrorText, { color: colors.destructive }]}>{paymentError}</Text> : null}
                <Pressable
                  onPress={() => void recoverDevice()}
                  disabled={recovering}
                  style={[styles.primaryButton, { opacity: recovering ? 0.65 : 1 }]}
                  accessibilityRole="button"
                  testID="recovery-submit"
                >
                  <LinearGradient colors={[colors.primary, colors.accent]} style={styles.primaryButtonGradient}>
                    {recovering ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Restore this device</Text>}
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={() => setShowRecovery(false)} style={styles.dismissRecovery} accessibilityRole="button" testID="recovery-dismiss">
                  <Text style={[styles.quietButtonText, { color: colors.mutedForeground }]}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: "100%" },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: 22, maxWidth: 620, width: "100%", alignSelf: "center" },
  topHalo: { position: "absolute", top: 0, left: 0, right: 0, height: 340 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 42, marginBottom: 24 },
  brand: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { height: 35, width: 35, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  brandCaption: { fontSize: 8, letterSpacing: 1.5, marginTop: 3, fontWeight: "600" },
  backButton: { width: 34, height: 38, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "700", textAlign: "left", marginLeft: 4 },
  keyButton: { height: 37, width: 39, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroIntro: { marginTop: 2, marginBottom: 20 },
  eyebrow: { fontSize: 9, letterSpacing: 1.7, fontWeight: "700" },
  heroTitle: { fontSize: 31, lineHeight: 36, fontWeight: "700", letterSpacing: -0.9, marginTop: 9 },
  heroCopy: { fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 350 },
  screenIntro: { marginBottom: 20 },
  pageTitle: { fontSize: 25, lineHeight: 32, fontWeight: "700", letterSpacing: -0.55, marginTop: 7 },
  connectionCard: { borderWidth: 1, borderRadius: 23, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 16, overflow: "hidden" },
  connectionMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 8, letterSpacing: 1.2, fontWeight: "700" },
  anonymousLabel: { fontSize: 7, letterSpacing: 0.9, fontWeight: "700" },
  orbArea: { height: 190, alignItems: "center", justifyContent: "center", marginTop: 0 },
  orbAura: { position: "absolute", height: 151, width: 151, borderRadius: 80 },
  orbRingOuter: { width: 149, height: 149, borderRadius: 76, borderWidth: 2, alignItems: "center", justifyContent: "center", shadowColor: "#245bff", shadowOpacity: 0.38, shadowRadius: 22, elevation: 8 },
  orb: { height: 138, width: 138, borderRadius: 70, overflow: "hidden" },
  orbInner: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9 },
  orbLabel: { fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  connectionTitle: { textAlign: "center", fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  connectionSubcopy: { textAlign: "center", fontSize: 10, marginTop: 5, lineHeight: 15 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
  sectionSubcopy: { fontSize: 9, lineHeight: 14, marginTop: 4 },
  textAction: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  actionLabel: { fontSize: 10, fontWeight: "700" },
  subscriptionSummary: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginTop: 10 },
  iconTile: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  flexOne: { flex: 1 },
  rowTitle: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  smallCopy: { fontSize: 10, lineHeight: 15 },
  microCopy: { fontSize: 8, lineHeight: 12, marginTop: 2 },
  verifiedBadge: { borderRadius: 7, paddingVertical: 5, paddingHorizontal: 7 },
  verifiedText: { fontSize: 7, fontWeight: "700", letterSpacing: 0.6 },
  serverHeading: { marginTop: 25, marginBottom: 11 },
  demoGrid: { flexDirection: "row", gap: 10 },
  demoCard: { flex: 1, minHeight: 87, borderWidth: 1, borderRadius: 15, padding: 11 },
  demoCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  flag: { height: 17, width: 23, borderRadius: 4, overflow: "hidden" },
  demoTag: { fontSize: 7, fontWeight: "700", letterSpacing: 0.7 },
  demoCountry: { fontSize: 11, fontWeight: "600" },
  demoCity: { fontSize: 9, marginTop: 2 },
  privacyFootnote: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 20, paddingHorizontal: 3 },
  privacyCopy: { flex: 1, fontSize: 9, lineHeight: 14 },
  planList: { gap: 9 },
  planCard: { minHeight: 76, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  planCopy: { flex: 1 },
  planNameLine: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  planName: { fontSize: 12, fontWeight: "600" },
  planBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  planBadgeText: { fontSize: 7, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  planPrice: { fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 3 },
  planDuration: { fontSize: 9, lineHeight: 14, marginTop: 1 },
  radioOuter: { width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 8, height: 8, borderRadius: 5 },
  secureNote: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 15 },
  primaryButton: { borderRadius: 14, overflow: "hidden", minHeight: 48 },
  primaryButtonGradient: { minHeight: 48, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "700", letterSpacing: 0.1 },
  skeletonGroup: { gap: 9 },
  planSkeleton: { height: 75, borderWidth: 1, borderRadius: 14, padding: 13, justifyContent: "center", gap: 8 },
  skeletonLine: { height: 8, borderRadius: 6 },
  emptyPanel: { minHeight: 190, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 22, gap: 9 },
  linkButton: { padding: 9 },
  paymentPlanCard: { flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderRadius: 16, padding: 14 },
  paymentPrice: { fontSize: 13, fontWeight: "700", marginTop: 3, marginBottom: 2 },
  paymentForm: { marginTop: 23 },
  inputTitle: { fontSize: 15, fontWeight: "700", marginBottom: 5 },
  phoneField: { height: 51, borderRadius: 13, borderWidth: 1, marginTop: 16, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  keBadge: { width: 26, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  keText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.4 },
  countryPrefix: { fontSize: 12, fontWeight: "600" },
  phoneInput: { flex: 1, fontSize: 13, height: "100%", letterSpacing: 0.3 },
  formError: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, marginTop: 10 },
  formErrorText: { fontSize: 10, lineHeight: 15, flex: 1 },
  sessionNotice: { borderWidth: 1, borderRadius: 12, padding: 11, marginTop: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  mpesaButton: { minHeight: 49, backgroundColor: "#00c77a", borderRadius: 13, marginTop: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  mpesaButtonText: { fontSize: 12, color: "#061b16", fontWeight: "700" },
  mpesaInfo: { marginTop: 23, borderWidth: 1, borderRadius: 15, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  mpesaMark: { width: 44, height: 37, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  mpesaMarkText: { fontWeight: "800", fontSize: 19, letterSpacing: -1 },
  processingScreen: { alignItems: "center", paddingTop: 12 },
  phoneIllustration: { height: 110, width: 150, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  phoneOutline: { height: 92, width: 55, borderWidth: 2, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#0c1632" },
  phoneNotch: { position: "absolute", top: 4, width: 22, height: 4, borderRadius: 2 },
  phoneSpinner: { width: 24, height: 24, borderWidth: 2, borderRadius: 12, borderTopColor: "transparent" },
  sparkle: { position: "absolute", width: 5, height: 5, borderRadius: 3 },
  sparkleLeft: { left: 19, top: 46 },
  sparkleRight: { right: 20, top: 52 },
  processingTitle: { fontSize: 17, fontWeight: "700", marginTop: 5 },
  processingSubtitle: { fontSize: 11, lineHeight: 17, textAlign: "center", maxWidth: 310, marginTop: 6, marginBottom: 19 },
  stepsCard: { width: "100%", borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 8 },
  stepRow: { minHeight: 57, flexDirection: "row", alignItems: "center", gap: 11, position: "relative" },
  stepIcon: { width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", zIndex: 1 },
  stepRule: { position: "absolute", left: 12, top: 41, width: 1, height: 23 },
  stepTitle: { fontSize: 11, fontWeight: "600", marginBottom: 2 },
  timeoutNotice: { borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 12, flexDirection: "row", gap: 9, alignItems: "center" },
  quietButton: { minHeight: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  quietButtonText: { fontSize: 11, fontWeight: "600" },
  successScreen: { alignItems: "center", paddingTop: 2 },
  successBurst: { height: 115, width: 180, alignItems: "center", justifyContent: "center", marginBottom: 2, position: "relative" },
  successHalo: { position: "absolute", height: 88, width: 88, borderRadius: 50, opacity: 0.45 },
  successOrb: { width: 67, height: 67, borderRadius: 36, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  successSpark: { position: "absolute", width: 5, height: 5, borderRadius: 3 },
  sparkOne: { top: 23, left: 36 },
  sparkTwo: { right: 34, top: 31 },
  sparkThree: { left: 48, bottom: 18 },
  successTitle: { fontSize: 21, fontWeight: "700", letterSpacing: -0.5, textAlign: "center" },
  successSubtitle: { fontSize: 11, marginTop: 5, marginBottom: 17, textAlign: "center" },
  successPlanCard: { width: "100%", marginBottom: 11 },
  successInfo: { width: "100%", borderRadius: 14, borderWidth: 1, padding: 13, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 15 },
  issueScreen: { alignItems: "center", paddingTop: 38 },
  issueIcon: { height: 66, width: 66, borderRadius: 34, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  issueActions: { width: "100%", marginTop: 15 },
  activityCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 12 },
  activityTitle: { fontSize: 13, fontWeight: "700", marginTop: 14, marginBottom: 4 },
  pendingBanner: { flexDirection: "row", gap: 10, alignItems: "center", borderRadius: 11, padding: 11, marginTop: 13 },
  emptySubscription: { marginTop: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  activityList: { marginTop: 9 },
  activityItem: { borderTopWidth: 1, paddingTop: 12, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  statusTag: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 },
  statusTagText: { fontSize: 8, fontWeight: "700" },
  activitySkeleton: { height: 58, borderRadius: 12, marginTop: 8 },
  emptyActivity: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 23 },
  emptyActivityIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", marginBottom: 11 },
  errorPanel: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  errorTitle: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  profileCard: { borderWidth: 1, borderRadius: 17, padding: 15, marginBottom: 11 },
  profileIdentity: { flexDirection: "row", alignItems: "center", gap: 11 },
  profileAvatar: { height: 48, width: 48, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  profileDivider: { height: 1, marginVertical: 14 },
  profileAction: { borderWidth: 1, borderRadius: 15, padding: 12, minHeight: 63, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 11 },
  bottomNav: { minHeight: 69, borderTopWidth: 1, paddingTop: 8, flexDirection: "row", justifyContent: "space-around", alignItems: "flex-start" },
  navButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 45 },
  navIconActive: { width: 34, height: 24, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  navLabel: { fontSize: 8, fontWeight: "600" },
  modalScrim: { flex: 1, backgroundColor: "rgba(2, 6, 18, 0.82)", justifyContent: "center", padding: 21 },
  recoverySheet: { borderWidth: 1, borderRadius: 22, padding: 20, width: "100%", maxWidth: 440, alignSelf: "center" },
  recoveryIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  sheetTitle: { fontSize: 19, fontWeight: "700", marginBottom: 8 },
  recoveryDescription: { fontSize: 11, lineHeight: 17, marginBottom: 15 },
  recoveryCode: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 10, lineHeight: 20, letterSpacing: 0.5, marginBottom: 14, fontWeight: "600" },
  recoveryInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, minHeight: 48, fontSize: 12, marginBottom: 11 },
  dismissRecovery: { alignItems: "center", padding: 12 },
});
