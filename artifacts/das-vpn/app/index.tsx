import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
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
import Svg, { Line, Rect } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  createVpnPayment,
  createVpnSession,
  recoverVpnSession,
  useGetVpnPayment,
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

const plans = [
  { code: "three_days", name: "3 Days", days: 3, price: 80 },
  { code: "weekly", name: "Weekly", days: 7, price: 120 },
  { code: "monthly", name: "Monthly", days: 30, price: 350, popular: true },
  { code: "three_months", name: "3 Months", days: 90, price: 999 },
  { code: "yearly", name: "Yearly", days: 365, price: 2300, bestValue: true },
] as const;

const designServers = [
  { countryCode: "DE", country: "Germany", city: "Frankfurt" },
  { countryCode: "NL", country: "Netherlands", city: "Amsterdam" },
] as const;

const tabs = [
  { key: "home", label: "Home", icon: "home" },
  { key: "plans", label: "Plans", icon: "tag" },
  { key: "subscriptions", label: "Activity", icon: "clock" },
  { key: "profile", label: "Profile", icon: "user" },
] as const;

type PlanCode = (typeof plans)[number]["code"];
type Tab = "home" | "plans" | "subscriptions" | "profile";

function randomHex(byteCount: number): Promise<string> {
  return Crypto.getRandomBytesAsync(byteCount).then((bytes) =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
}

function getPlanName(code: string): string {
  return plans.find((plan) => plan.code === code)?.name ?? "Subscription";
}

function CountryFlag({ countryCode, muted }: { countryCode: string; muted: string }) {
  const width = 34;
  const height = 24;
  const code = countryCode.toUpperCase();

  if (code === "KE") {
    return (
      <Svg width={width} height={height} viewBox="0 0 34 24">
        <Rect width="34" height="8" fill="#111827" />
        <Rect y="8" width="34" height="2" fill="#f4f6fb" />
        <Rect y="10" width="34" height="5" fill="#c83243" />
        <Rect y="15" width="34" height="2" fill="#f4f6fb" />
        <Rect y="17" width="34" height="7" fill="#17844a" />
        <Line x1="17" y1="5" x2="17" y2="19" stroke="#f4f6fb" strokeWidth="4" />
        <Line x1="17" y1="6" x2="17" y2="18" stroke="#171923" strokeWidth="2" />
      </Svg>
    );
  }
  if (code === "US") {
    return (
      <Svg width={width} height={height} viewBox="0 0 34 24">
        <Rect width="34" height="24" fill="#fff" />
        {[0, 4, 8, 12, 16, 20].map((y) => (
          <Rect key={y} y={y} width="34" height="2" fill="#bd3342" />
        ))}
        <Rect width="15" height="13" fill="#24477b" />
      </Svg>
    );
  }
  if (code === "GB") {
    return (
      <Svg width={width} height={height} viewBox="0 0 34 24">
        <Rect width="34" height="24" fill="#24477b" />
        <Line x1="2" y1="1" x2="32" y2="23" stroke="#fff" strokeWidth="5" />
        <Line x1="32" y1="1" x2="2" y2="23" stroke="#fff" strokeWidth="5" />
        <Line x1="2" y1="1" x2="32" y2="23" stroke="#bd3342" strokeWidth="2" />
        <Line x1="32" y1="1" x2="2" y2="23" stroke="#bd3342" strokeWidth="2" />
        <Rect x="13" width="8" height="24" fill="#fff" />
        <Rect y="8" width="34" height="8" fill="#fff" />
        <Rect x="15" width="4" height="24" fill="#bd3342" />
        <Rect y="10" width="34" height="4" fill="#bd3342" />
      </Svg>
    );
  }
  if (code === "DE" || code === "NL" || code === "FR") {
    const colors = code === "DE"
      ? ["#191919", "#c64143", "#e2b747"]
      : code === "NL"
      ? ["#c64143", "#fff", "#335b9a"]
      : ["#32569a", "#fff", "#c64143"];
    return (
      <Svg width={width} height={height} viewBox="0 0 34 24">
        {colors.map((color, index) => (
          <Rect key={color} y={index * 8} width="34" height="8" fill={color} />
        ))}
      </Svg>
    );
  }

  return (
    <View style={[styles.flagFallback, { borderColor: muted }]}>
      <Text style={[styles.flagFallbackText, { color: muted }]}>{code.slice(0, 2)}</Text>
    </View>
  );
}

function formatExpiry(value: string): string {
  return new Date(value).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function HomeScreen() {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>("monthly");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentPhone, setPaymentPhone] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState("");
  const [paymentAttempt, setPaymentAttempt] = useState<{
    key: string;
    planCode: PlanCode;
    phoneNumber: string;
  } | null>(null);

  const aura = useSharedValue(0.62);
  useEffect(() => {
    aura.value = withRepeat(withTiming(1, { duration: 2300 }), -1, true);
  }, [aura]);
  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.48 + aura.value * 0.32,
    transform: [{ scale: 0.94 + aura.value * 0.06 }],
  }));

  const startDeviceSession = useCallback(async () => {
    setSessionMessage("");
    setSessionReady(false);
    try {
      const storedToken = await getSessionValue(TOKEN_KEY);
      const storedRecovery = await getSessionValue(RECOVERY_KEY);
      const isNewSession = !storedToken || !storedRecovery;
      let token: string;
      let recovery: string;
      if (storedToken && storedRecovery) {
        token = storedToken;
        recovery = storedRecovery;
      } else {
        token = await randomHex(32);
        recovery = await randomHex(32);
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
      setSessionMessage("We couldn’t reach the secure service. Your payment and access are unchanged. Try again.");
    }
  }, []);

  useEffect(() => {
    void startDeviceSession();
  }, [startDeviceSession]);

  const statusQuery = useGetVpnStatus({
    query: {
      queryKey: ["vpn", "status"],
      enabled: sessionReady,
      refetchInterval: sessionReady ? 5000 : false,
    },
  });
  const paymentLookupId = paymentId || statusQuery.data?.latestPayment?.id || "";
  const paymentQuery = useGetVpnPayment(paymentLookupId, {
    query: {
      queryKey: ["vpn", "payment", paymentLookupId],
      enabled: sessionReady && paymentLookupId.length > 0,
      refetchInterval: paymentLookupId.length > 0 ? 3000 : false,
    },
  });

  const paymentSubscription =
    paymentQuery.data?.status === "paid" && paymentQuery.data.expiresAt
      ? { planCode: paymentQuery.data.planCode, expiresAt: paymentQuery.data.expiresAt }
      : null;
  const statusSubscription = statusQuery.data?.subscription;
  const subscription =
    paymentSubscription &&
    (!statusSubscription ||
      new Date(paymentSubscription.expiresAt).getTime() >
        new Date(statusSubscription.expiresAt).getTime())
      ? paymentSubscription
      : statusSubscription ?? null;
  const subscriptionPlan = subscription
    ? plans.find((plan) => plan.code === subscription.planCode)
    : undefined;
  const hasActiveSubscription = Boolean(
    subscription?.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now(),
  );
  const currentPlan = plans.find((plan) => plan.code === selectedPlan) ?? plans[2];
  const latestPayment = paymentQuery.data ?? statusQuery.data?.latestPayment;

  const openPlan = (planCode: PlanCode) => {
    setSelectedPlan(planCode);
    setPaymentError("");
    setPaymentNotice("");
    setPaymentOpen(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    if (digits.length < 9 || digits.length > 13) {
      setPaymentError("Enter a valid Kenyan M-Pesa phone number.");
      return;
    }
    if (!sessionReady) {
      setPaymentError("The secure service is unavailable. Please retry before paying.");
      return;
    }

    setSubmittingPayment(true);
    try {
      const phoneNumber = paymentPhone.trim();
      const idempotencyKey =
        paymentAttempt?.planCode === currentPlan.code &&
          paymentAttempt.phoneNumber === phoneNumber
          ? paymentAttempt.key
          : await randomHex(16);
      setPaymentAttempt({
        key: idempotencyKey,
        planCode: currentPlan.code,
        phoneNumber,
      });
      const payment = await createVpnPayment(
        { planCode: currentPlan.code, phoneNumber },
        { headers: { "idempotency-key": idempotencyKey } },
      );
      setPaymentAttempt(null);
      setPaymentId(payment.id);
      setPaymentNotice(payment.message ?? "Check your phone for the M-Pesa prompt.");
      setPaymentOpen(false);
      setPaymentPhone("");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void statusQuery.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const apiCode =
        error && typeof error === "object" && "data" in error
          ? (error as { data?: { code?: unknown } }).data?.code
          : undefined;
      const reason = `${String(apiCode ?? "")} ${message}`;
      if (reason.includes("PAYMENT_REQUEST_PENDING")) {
        setPaymentError("A previous request is still processing. Wait for its status before trying again.");
      } else if (reason.includes("STK_PUSH_REJECTED")) {
        setPaymentAttempt(null);
        setPaymentError("Safaricom did not accept this request. No payment was taken. You can try again.");
      } else if (reason.includes("SERVER_NOT_CONFIGURED")) {
        setPaymentError("The secure payment backend isn’t configured yet. No payment was requested.");
      } else {
        setPaymentError("Safaricom did not accept this request. No access was activated.");
      }
    } finally {
      setSubmittingPayment(false);
    }
  };

  const recoverDevice = async () => {
    setPaymentError("");
    const oldRecovery = recoveryInput.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(oldRecovery)) {
      setPaymentError("Enter the 64-character recovery key saved from your other device.");
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
      setPaymentNotice("Access restored. Save your new recovery key before removing your old device.");
      await statusQuery.refetch();
    } catch {
      setPaymentError("That recovery key could not be verified. No subscription data was changed.");
    } finally {
      setRecovering(false);
    }
  };

  const statusLabel = hasActiveSubscription
    ? "Connected"
    : sessionReady
    ? "Anonymous session"
    : "Setting up session";

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.background, colors.backgroundGlow, colors.background]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, activeTab === "plans" ? styles.plansContent : null]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, activeTab === "plans" ? styles.plansHeader : null]}>
          {activeTab === "plans" ? (
            <>
              <Pressable
                onPress={() => setActiveTab("home")}
                style={styles.plansBackButton}
                accessibilityRole="button"
                accessibilityLabel="Back to home"
                testID="plans-back"
              >
                <Feather name="arrow-left" size={19} color={colors.foreground} />
              </Pressable>
              <View style={styles.plansHeaderCopy}>
                <Text style={[styles.plansHeaderTitle, { color: colors.foreground }]}>Subscription Plans</Text>
                <Text style={[styles.plansHeaderSubtitle, { color: colors.mutedForeground }]}>Choose the best plan for your needs</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.brand}>
                <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
                  <Feather name="shield" size={17} color={colors.primaryForeground} />
                </View>
                <View>
                  <Text style={[styles.brandName, { color: colors.foreground }]}>DAS VPN</Text>
                  <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>PRIVATE BY DESIGN</Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  setPaymentError("");
                  setShowRecovery(false);
                  setRecoveryInput("");
                  setRecovering(false);
                  setShowRecovery(true);
                }}
                style={[styles.recoveryButton, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="View recovery key"
                testID="recovery-open"
              >
                <Feather name="key" size={16} color={colors.mutedForeground} />
              </Pressable>
            </>
          )}
        </View>

        {activeTab === "home" ? (
        <>
        <View style={styles.greeting}>
          <Text style={[styles.kicker, { color: colors.primary }]}>YOUR SUBSCRIPTION</Text>
          <Text style={[styles.headline, { color: colors.foreground }]}>
            Private access,{ "\n" }on your terms.
          </Text>
          <Text style={[styles.subheadline, { color: colors.mutedForeground }]}>
            Choose a plan and pay with M-Pesa. Access activates after payment verification.
          </Text>
        </View>

        <View style={[styles.connectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardTopline}>
            <View style={styles.liveLabel}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: hasActiveSubscription ? colors.primary : colors.mutedForeground },
                ]}
              />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                {statusLabel.toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.noAccountTag, { color: colors.accent }]}>NO ACCOUNT REQUIRED</Text>
          </View>

          <View style={styles.orbWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.orbGlow,
                { backgroundColor: hasActiveSubscription ? colors.primary : colors.accent },
                auraStyle,
              ]}
            />
            <Pressable
              disabled={hasActiveSubscription || !sessionReady}
              onPress={() => setActiveTab("plans")}
              style={({ pressed }) => [
                styles.connectOrb,
                { borderColor: colors.border, opacity: hasActiveSubscription || sessionReady ? 1 : 0.76 },
                pressed && !hasActiveSubscription && sessionReady ? styles.pressed : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={hasActiveSubscription ? "Subscription connected" : "Select a plan"}
              accessibilityState={{ disabled: hasActiveSubscription || !sessionReady }}
              testID="vpn-connect"
            >
              <LinearGradient
                colors={hasActiveSubscription ? [colors.primary, colors.accent] : [colors.card, colors.secondary]}
                style={styles.connectOrbGradient}
              >
                <Feather
                  name={hasActiveSubscription ? "check" : "credit-card"}
                  size={31}
                  color={hasActiveSubscription ? colors.primaryForeground : colors.mutedForeground}
                />
                <Text style={[styles.orbLabel, { color: hasActiveSubscription ? colors.primaryForeground : colors.mutedForeground }]}>
                  {hasActiveSubscription ? "CONNECTED" : sessionReady ? "SELECT PLAN" : "PLEASE WAIT"}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>

          <Text style={[styles.connectionTitle, { color: colors.foreground }]}>
            {hasActiveSubscription ? "Subscription active" : "Start your subscription"}
          </Text>
          <Text style={[styles.connectionDescription, { color: colors.mutedForeground }]}>
            {hasActiveSubscription && subscription?.expiresAt
              ? `Active through ${formatExpiry(subscription.expiresAt)}`
              : "Choose a plan to unlock access"}
          </Text>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Server locations</Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
              Design previews only · not connected to live servers
            </Text>
          </View>
          <Feather name="globe" size={18} color={colors.accent} />
        </View>
        <View style={styles.serverList}>
          {designServers.map((server) => (
            <View
              key={server.countryCode}
              style={[styles.serverRow, { borderColor: colors.border, backgroundColor: colors.card }]}
              testID={`server-preview-${server.countryCode.toLowerCase()}`}
            >
              <CountryFlag countryCode={server.countryCode} muted={colors.mutedForeground} />
              <View style={styles.serverText}>
                <Text style={[styles.serverName, { color: colors.foreground }]}>{server.country}</Text>
                <Text style={[styles.serverCountry, { color: colors.mutedForeground }]}>
                  {server.city} · Design preview only
                </Text>
              </View>
              <View style={[styles.serverPreviewTag, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.serverPreviewText, { color: colors.accent }]}>PREVIEW</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.subscriptionShortcut}>
          <View style={styles.serverText}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {hasActiveSubscription ? "Your subscription" : "Choose your plan"}
            </Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
              {hasActiveSubscription && subscription?.expiresAt
                ? `${getPlanName(subscription.planCode)} · expires ${formatExpiry(subscription.expiresAt)}`
                : "One-time payments · no recurring deductions"}
            </Text>
          </View>
          <Pressable
            onPress={() => setActiveTab("plans")}
            style={[styles.smallAction, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            accessibilityRole="button"
            testID="open-plans"
          >
            <Text style={[styles.smallActionText, { color: colors.primary }]}>
              {hasActiveSubscription ? "Manage" : "View plans"}
            </Text>
            <Feather name="arrow-right" size={14} color={colors.primary} />
          </Pressable>
        </View>
        {hasActiveSubscription && subscription?.expiresAt ? (
          <View style={[styles.expiryCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="calendar" size={17} color={colors.primary} />
            <View style={styles.serverText}>
              <Text style={[styles.expiryTitle, { color: colors.foreground }]}>
                {getPlanName(subscription.planCode)} access
              </Text>
              <Text style={[styles.expiryText, { color: colors.mutedForeground }]}>
                Expires {formatExpiry(subscription.expiresAt)}
              </Text>
            </View>
            <Feather name="check" size={17} color={colors.primary} />
          </View>
        ) : null}
        </>
        ) : null}

        {activeTab === "plans" ? (
        <>
        {!sessionReady ? (
          <View style={[styles.planSessionNotice, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {sessionMessage ? (
              <Feather name="alert-circle" size={16} color={colors.destructive} />
            ) : (
              <ActivityIndicator size="small" color={colors.accent} />
            )}
            <View style={styles.planSessionCopy}>
              <Text style={[styles.planSessionTitle, { color: colors.foreground }]}>
                {sessionMessage ? "Secure session needs attention" : "Setting up your secure session"}
              </Text>
              <Text style={[styles.planSessionText, { color: colors.mutedForeground }]}>
                {sessionMessage || "You can choose a plan now. Payment will be ready when setup completes."}
              </Text>
            </View>
            {sessionMessage ? (
              <Pressable
                onPress={() => void startDeviceSession()}
                style={styles.planSessionRetry}
                accessibilityRole="button"
                testID="retry-session-plans"
              >
                <Text style={[styles.planSessionRetryText, { color: colors.primary }]}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.planList}>
          {plans.map((plan) => {
            const active = subscription?.planCode === plan.code;
            const popular = "popular" in plan && plan.popular;
            const bestValue = "bestValue" in plan && plan.bestValue;
            const featured = Boolean(popular || bestValue);
            const badge = popular ? "MOST POPULAR" : bestValue ? "BEST VALUE" : null;
            const accentColor = popular ? colors.accent : colors.primary;
            const validity = plan.days === 3 ? "72 hours" : plan.days + " days";
            const price = (
              <Text style={[styles.planPrice, { color: colors.foreground }]}>
                <Text style={[styles.planCurrency, { color: colors.mutedForeground }]}>KES </Text>
                <Text style={styles.planPriceValue}>{plan.price.toLocaleString("en-KE")}</Text>
              </Text>
            );
            const subscribeButton = (
              <Pressable
                onPress={() => openPlan(plan.code)}
                style={({ pressed }) => [
                  featured ? styles.featuredSubscribeButton : styles.compactSubscribeButton,
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={"Subscribe to " + plan.name + " for " + plan.price + " Kenyan shillings"}
                testID={"plan-" + plan.code}
              >
                {featured ? (
                  <LinearGradient colors={[colors.primary, colors.accent]} style={styles.featuredSubscribeContent}>
                    <Text style={[styles.featuredSubscribeText, { color: colors.primaryForeground }]}>Subscribe</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.compactSubscribeContent, { borderColor: accentColor, backgroundColor: colors.secondary }]}>
                    <Text style={[styles.compactSubscribeText, { color: colors.primary }]}>Subscribe</Text>
                  </View>
                )}
              </Pressable>
            );

            return (
              <View
                key={plan.code}
                style={[
                  styles.planCard,
                  { backgroundColor: colors.card, borderColor: active ? colors.primary : popular ? colors.accent : bestValue ? colors.primary : colors.border },
                  featured ? styles.featuredPlanCard : null,
                ]}
              >
                {badge ? (
                  <View style={[styles.popularTag, { backgroundColor: accentColor }]}>
                    <Text style={[styles.popularTagText, { color: colors.primaryForeground }]}>{badge}</Text>
                  </View>
                ) : null}
                {featured ? (
                  <>
                    <View style={styles.featuredPlanDetails}>
                      <View style={styles.planInfo}>
                        <Text style={[styles.planName, { color: colors.foreground }]}>{plan.name}</Text>
                        <Text style={[styles.planDays, { color: colors.mutedForeground }]}>Validity: {validity}</Text>
                        {active ? <Text style={[styles.activePlanTag, { color: colors.primary }]}>CURRENT PLAN</Text> : null}
                      </View>
                      {price}
                    </View>
                    {subscribeButton}
                  </>
                ) : (
                  <View style={styles.compactPlanDetails}>
                    <View style={styles.planInfo}>
                      <Text style={[styles.planName, { color: colors.foreground }]}>{plan.name}</Text>
                      <Text style={[styles.planDays, { color: colors.mutedForeground }]}>Validity: {validity}</Text>
                      {active ? <Text style={[styles.activePlanTag, { color: colors.primary }]}>CURRENT PLAN</Text> : null}
                    </View>
                    <View style={styles.compactPlanActions}>
                      {price}
                      {subscribeButton}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        </>
        ) : null}


        {activeTab === "plans" && hasActiveSubscription && subscription?.expiresAt ? (
          <View style={[styles.expiryCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="calendar" size={17} color={colors.primary} />
            <View style={styles.serverText}>
              <Text style={[styles.expiryTitle, { color: colors.foreground }]}>
                {getPlanName(subscription.planCode)} access
              </Text>
              <Text style={[styles.expiryText, { color: colors.mutedForeground }]}>
                Expires {formatExpiry(subscription.expiresAt)}
              </Text>
            </View>
            <Feather name="check" size={17} color={colors.primary} />
          </View>
        ) : null}

        {activeTab === "subscriptions" ? (
          <>
            <View style={styles.greeting}>
              <Text style={[styles.kicker, { color: colors.primary }]}>YOUR SUBSCRIPTIONS</Text>
              <Text style={[styles.headline, { color: colors.foreground }]}>Your activity.</Text>
              <Text style={[styles.subheadline, { color: colors.mutedForeground }]}>
                Review M-Pesa payments and your active subscription.
              </Text>
            </View>
            <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.activityHeading}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Current subscription</Text>
                <Feather
                  name={hasActiveSubscription ? "check-circle" : "calendar"}
                  size={17}
                  color={hasActiveSubscription ? colors.primary : colors.mutedForeground}
                />
              </View>
              {!sessionReady || statusQuery.isLoading ? (
                <Text style={[styles.activityText, { color: colors.mutedForeground }]}>
                  Checking your subscription…
                </Text>
              ) : statusQuery.isError ? (
                <Text style={[styles.activityText, { color: colors.mutedForeground }]}>
                  Subscription details are unavailable until the secure service responds.
                </Text>
              ) : hasActiveSubscription && subscription?.expiresAt ? (
                <>
                  <Text style={[styles.activityTitle, { color: colors.foreground }]}>
                    {getPlanName(subscription.planCode)} · Active
                  </Text>
                  <Text style={[styles.activityText, { color: colors.mutedForeground }]}>
                    {subscriptionPlan ? `KES ${subscriptionPlan.price.toLocaleString("en-KE")} · ` : ""}
                    Expires {formatExpiry(subscription.expiresAt)}
                  </Text>
                </>
              ) : latestPayment?.status === "pending" ? (
                <Text style={[styles.activityText, { color: colors.mutedForeground }]}>
                  Waiting for M-Pesa verification. Your subscription activates after the payment is confirmed.
                </Text>
              ) : (
                <Text style={[styles.activityText, { color: colors.mutedForeground }]}>
                  No active subscription. Choose a plan to view the available options.
                </Text>
              )}
              <Pressable
                onPress={() => setActiveTab("plans")}
                style={[styles.profileAction, { backgroundColor: colors.secondary, borderColor: colors.border, marginTop: 14 }]}
                accessibilityRole="button"
                accessibilityLabel="View subscription plans"
                testID="subscriptions-view-plans"
              >
                <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
                  <Feather name="tag" size={17} color={colors.primary} />
                </View>
                <View style={styles.serverText}>
                  <Text style={[styles.serverName, { color: colors.foreground }]}>View plans</Text>
                  <Text style={[styles.serverCountry, { color: colors.mutedForeground }]}>
                    One-time M-Pesa payment · no auto-renewal
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.activityHeading}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Latest payment</Text>
                {paymentQuery.isLoading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
              </View>
              {!sessionReady || statusQuery.isLoading ? (
                <Text style={[styles.activityText, { color: colors.mutedForeground }]}>
                  Checking secure payment records…
                </Text>
              ) : statusQuery.isError ? (
                <Text style={[styles.activityText, { color: colors.mutedForeground }]}>
                  Payment status could not be refreshed.
                </Text>
              ) : latestPayment ? (
                <>
                  <Text style={[styles.activityTitle, { color: colors.foreground }]}>
                    {getPlanName(latestPayment.planCode)}
                    {paymentQuery.data
                      ? ` · KES ${paymentQuery.data.amountKes.toLocaleString("en-KE")}`
                      : ""}
                  </Text>
                  <Text style={[styles.activityText, { color: colors.mutedForeground }]}>
                    {latestPayment.status === "paid"
                      ? "Verified by M-Pesa"
                      : latestPayment.status === "pending"
                      ? "Waiting for M-Pesa verification"
                      : latestPayment.status === "cancelled"
                      ? "Cancelled · no subscription activated"
                      : "Not verified · no subscription activated"}
                  </Text>
                </>
              ) : (
                <Text style={[styles.activityText, { color: colors.mutedForeground }]}>
                  No subscription payments are recorded for this device yet.
                </Text>
              )}
            </View>
            {sessionMessage || statusQuery.isError ? (
              <View style={[styles.errorCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="wifi-off" size={17} color={colors.destructive} />
                <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                  {sessionMessage || "Subscription details could not be refreshed."}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        {activeTab === "profile" ? (
          <>
            <View style={styles.greeting}>
              <Text style={[styles.kicker, { color: colors.primary }]}>PRIVATE BY DESIGN</Text>
              <Text style={[styles.headline, { color: colors.foreground }]}>Your device.</Text>
              <Text style={[styles.subheadline, { color: colors.mutedForeground }]}>
                No registration, login, or password. Your session is anonymous and tied to this device.
              </Text>
            </View>
            <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.activityHeading}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Anonymous device session</Text>
                <Feather
                  name={sessionReady ? "check-circle" : "shield"}
                  size={18}
                  color={sessionReady ? colors.primary : colors.mutedForeground}
                />
              </View>
              <Text style={[styles.activityText, { color: colors.mutedForeground }]}>
                {sessionReady
                  ? "A secure session is established for this device."
                  : sessionMessage || "The secure device session is being established."}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setPaymentError("");
                setShowRecovery(false);
                setRecoveryInput("");
                setRecovering(false);
                setShowRecovery(true);
              }}
              style={[styles.profileAction, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
              testID="profile-recovery"
            >
              <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="key" size={17} color={colors.accent} />
              </View>
              <View style={styles.serverText}>
                <Text style={[styles.serverName, { color: colors.foreground }]}>Device recovery key</Text>
                <Text style={[styles.serverCountry, { color: colors.mutedForeground }]}>
                  {recoveryKey ? "Stored securely on this device" : "Restore access or save your recovery key"}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
            {hasActiveSubscription && subscription?.expiresAt ? (
              <View style={[styles.expiryCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="calendar" size={17} color={colors.primary} />
                <View style={styles.serverText}>
                  <Text style={[styles.expiryTitle, { color: colors.foreground }]}>
                    {getPlanName(subscription.planCode)} access
                  </Text>
                  <Text style={[styles.expiryText, { color: colors.mutedForeground }]}>
                    Expires {formatExpiry(subscription.expiresAt)}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.footer}>
              <Feather name="repeat" size={14} color={colors.mutedForeground} />
              <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
                Renewals preserve remaining paid time. There are no free trials or recurring deductions.
              </Text>
            </View>
          </>
        ) : null}

        {activeTab === "home" && latestPayment ? (
          <View style={[styles.noticeCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather
              name={latestPayment.status === "paid" ? "check-circle" : latestPayment.status === "pending" ? "clock" : "alert-circle"}
              size={17}
              color={latestPayment.status === "paid" ? colors.primary : colors.accent}
            />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
              {latestPayment.status === "pending"
                ? "Waiting for M-Pesa to verify your payment. Your subscription activates after confirmation."
                : latestPayment.status === "paid"
                ? `${getPlanName(latestPayment.planCode)} payment verified. Your subscription is active.`
                : latestPayment.status === "cancelled"
                ? "The payment was cancelled. No subscription was activated."
                : latestPayment.status === "failed"
                ? "Payment was not verified. No subscription was activated."
                : paymentNotice}
            </Text>
          </View>
        ) : activeTab === "home" && paymentNotice ? (
          <View style={[styles.noticeCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="info" size={17} color={colors.accent} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>{paymentNotice}</Text>
          </View>
        ) : null}

        {(activeTab === "home" || activeTab === "profile") &&
        (sessionMessage || statusQuery.isError) ? (
          <View style={[styles.errorCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="wifi-off" size={17} color={colors.destructive} />
            <View style={styles.serverText}>
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>Secure service unavailable</Text>
              <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                {sessionMessage || "Subscription details could not be refreshed. You can still choose a plan and pay."}
              </Text>
            </View>
            <Pressable onPress={() => void startDeviceSession()} accessibilityRole="button" testID="retry-session">
              <Feather name="refresh-cw" size={17} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}

        {activeTab === "home" ? (
        <>
        <View style={styles.footer}>
          <Feather name="lock" size={14} color={colors.mutedForeground} />
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Your M-Pesa PIN is entered on your phone. DAS never asks for or stores it.
          </Text>
        </View>
        <View style={styles.footer}>
          <Feather name="repeat" size={14} color={colors.mutedForeground} />
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Renew any time. Remaining paid access is preserved. No recurring deductions.
          </Text>
        </View>
        </>
        ) : null}
      </ScrollView>

      <View style={[styles.bottomNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={styles.navButton}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              testID={`tab-${tab.key}`}
            >
              <Feather name={tab.icon} size={19} color={selected ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.navLabel, { color: selected ? colors.primary : colors.mutedForeground }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={paymentOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPaymentOpen(false)}
      >
        <View style={styles.modalScrim}>
          <View style={[styles.paymentSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Pay with M-Pesa</Text>
                <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                    A secure M-Pesa prompt will be sent to your phone.
                </Text>
              </View>
              <Pressable
                onPress={() => setPaymentOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close payment"
                testID="payment-close"
              >
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={[styles.orderSummary, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View>
                <Text style={[styles.orderPlan, { color: colors.foreground }]}>{currentPlan.name}</Text>
                <Text style={[styles.orderDuration, { color: colors.mutedForeground }]}>
                  {currentPlan.days} days · one-time payment
                </Text>
              </View>
              <Text style={[styles.orderPrice, { color: colors.foreground }]}>
                KES {currentPlan.price.toLocaleString("en-KE")}
              </Text>
            </View>

            <Text style={[styles.inputLabel, { color: colors.foreground }]}>M-Pesa phone number</Text>
            <View style={[styles.phoneField, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Feather name="smartphone" size={17} color={colors.mutedForeground} />
              <TextInput
                value={paymentPhone}
                onChangeText={setPaymentPhone}
                placeholder="07XX XXX XXX"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={16}
                style={[styles.phoneInput, { color: colors.foreground }]}
                accessibilityLabel="M-Pesa phone number"
                testID="payment-phone"
              />
              <Text style={[styles.countryCode, { color: colors.mutedForeground }]}>KE</Text>
            </View>

            {!sessionReady ? (
              <View style={[styles.paymentSessionNotice, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                {sessionMessage ? (
                  <Feather name="alert-circle" size={15} color={colors.destructive} />
                ) : (
                  <ActivityIndicator size="small" color={colors.accent} />
                )}
                <View style={styles.planSessionCopy}>
                  <Text style={[styles.planSessionTitle, { color: colors.foreground }]}>
                    {sessionMessage ? "Secure session needs attention" : "Preparing secure session"}
                  </Text>
                  <Text style={[styles.planSessionText, { color: colors.mutedForeground }]}>
                    {sessionMessage || "No payment will be requested until your session is ready."}
                  </Text>
                </View>
                {sessionMessage ? (
                  <Pressable
                    onPress={() => void startDeviceSession()}
                    style={styles.planSessionRetry}
                    accessibilityRole="button"
                    testID="retry-session-payment"
                  >
                    <Text style={[styles.planSessionRetryText, { color: colors.primary }]}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {paymentError ? (
              <View style={styles.formError}>
                <Feather name="alert-circle" size={15} color={colors.destructive} />
                <Text style={[styles.formErrorText, { color: colors.destructive }]}>{paymentError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void submitPayment()}
              disabled={submittingPayment || !sessionReady}
              style={({ pressed }) => [
                styles.payButton,
                { backgroundColor: colors.primary, opacity: submittingPayment || !sessionReady ? 0.62 : 1 },
                pressed ? styles.pressed : null,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: submittingPayment || !sessionReady }}
              testID="payment-submit"
            >
              {submittingPayment ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="lock" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.payButtonText, { color: colors.primaryForeground }]}>
                    Pay with M-Pesa
                  </Text>
                  <Feather name="arrow-up-right" size={16} color={colors.primaryForeground} />
                </>
              )}
            </Pressable>
            <Text style={[styles.securePaymentNote, { color: colors.mutedForeground }]}>
              No charge is made until you approve it with your M-Pesa PIN.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRecovery}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRecovery(false)}
      >
        <View style={styles.modalScrim}>
          <View style={[styles.recoverySheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.recoveryIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="key" size={20} color={colors.accent} />
            </View>
            {recoveryKey ? (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Save your recovery key</Text>
                <Text style={[styles.recoveryDescription, { color: colors.mutedForeground }]}>
                  This key is the only way to restore this subscription after reinstalling or changing phones.
                  Keep it somewhere private. It will rotate after each recovery.
                </Text>
                <Text
                  selectable
                  style={[styles.recoveryCode, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  testID="recovery-key"
                >
                  {recoveryKey.match(/.{1,8}/g)?.join(" ") ?? recoveryKey}
                </Text>
                <Pressable
                  onPress={() => void finishRecoveryNotice()}
                  style={[styles.payButton, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  testID="recovery-saved"
                >
                  <Text style={[styles.payButtonText, { color: colors.primaryForeground }]}>I saved this key</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Restore access</Text>
                <Text style={[styles.recoveryDescription, { color: colors.mutedForeground }]}>
                  Enter the private recovery key you saved on your previous device. No account or phone-number lookup is used.
                </Text>
                <TextInput
                  value={recoveryInput}
                  onChangeText={setRecoveryInput}
                  placeholder="64-character recovery key"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.recoveryInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  accessibilityLabel="Recovery key"
                  testID="recovery-input"
                />
                {paymentError ? (
                  <Text style={[styles.formErrorText, { color: colors.destructive }]}>{paymentError}</Text>
                ) : null}
                <Pressable
                  onPress={() => void recoverDevice()}
                  disabled={recovering}
                  style={[styles.payButton, { backgroundColor: colors.primary, opacity: recovering ? 0.6 : 1 }]}
                  accessibilityRole="button"
                  testID="recovery-submit"
                >
                  {recovering ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <Text style={[styles.payButtonText, { color: colors.primaryForeground }]}>Restore this device</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setShowRecovery(false)}
                  style={styles.dismissRecovery}
                  accessibilityRole="button"
                  testID="recovery-dismiss"
                >
                  <Text style={[styles.dismissText, { color: colors.mutedForeground }]}>Close</Text>
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
  screen: { flex: 1 },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 67, paddingBottom: 28, maxWidth: 620, width: "100%", alignSelf: "center" },
  plansContent: { paddingTop: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 34 },
  plansHeader: { justifyContent: "flex-start", gap: 11, marginBottom: 27 },
  plansBackButton: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  plansHeaderCopy: { flex: 1, gap: 3 },
  plansHeaderTitle: { fontSize: 16, lineHeight: 21, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  plansHeaderSubtitle: { fontSize: 9, lineHeight: 13, fontFamily: "Inter_400Regular" },
  brand: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 0.7 },
  eyebrow: { marginTop: 2, fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 1.7 },
  recoveryButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  greeting: { marginBottom: 24 },
  kicker: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  headline: { fontSize: 34, lineHeight: 40, fontFamily: "Inter_700Bold", letterSpacing: -1.15, marginTop: 11 },
  subheadline: { fontSize: 13, lineHeight: 20, fontFamily: "Inter_400Regular", marginTop: 10, maxWidth: 330 },
  connectionCard: { borderRadius: 25, borderWidth: 1, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 15, overflow: "hidden" },
  cardTopline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  liveLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.4 },
  noAccountTag: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  orbWrap: { height: 182, alignItems: "center", justifyContent: "center", marginTop: 3 },
  orbGlow: { position: "absolute", width: 164, height: 164, borderRadius: 82, opacity: 0.5 },
  connectOrb: { width: 150, height: 150, borderRadius: 76, borderWidth: 1, overflow: "hidden", elevation: 8 },
  connectOrbGradient: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  orbLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.4 },
  connectionTitle: { textAlign: "center", fontSize: 21, fontFamily: "Inter_700Bold", letterSpacing: -0.35 },
  connectionDescription: { textAlign: "center", fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 6 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  sectionCaption: { marginTop: 4, fontSize: 10, fontFamily: "Inter_400Regular" },
  subscriptionShortcut: { marginTop: 22, padding: 14, borderRadius: 18, backgroundColor: "rgba(16, 26, 44, 0.74)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  smallAction: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6 },
  smallActionText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  emptyServer: { minHeight: 72, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  emptyIcon: { height: 38, width: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  serverList: { gap: 8 },
  serverRow: { minHeight: 66, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  serverPreviewTag: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  serverPreviewText: { fontSize: 7, fontFamily: "Inter_700Bold", letterSpacing: 0.7 },
  serverText: { flex: 1, gap: 3 },
  serverName: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  serverCountry: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular" },
  flagFallback: { width: 34, height: 24, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  flagFallbackText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  planList: { gap: 9 },
  planCard: { minHeight: 74, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 10, justifyContent: "center", position: "relative", overflow: "hidden" },
  featuredPlanCard: { minHeight: 114, paddingTop: 25, paddingBottom: 11, gap: 10 },
  popularTag: { position: "absolute", top: 0, left: 13, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  popularTagText: { fontSize: 7, fontFamily: "Inter_700Bold", letterSpacing: 0.6 },
  featuredPlanDetails: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  compactPlanDetails: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  planInfo: { flex: 1, gap: 4 },
  compactPlanActions: { alignItems: "flex-end", gap: 6, minWidth: 88 },
  planName: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  planPrice: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.55, textAlign: "right" },
  planCurrency: { fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 0 },
  planPriceValue: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.55 },
  planDays: { fontSize: 8, lineHeight: 12, fontFamily: "Inter_400Regular" },
  activePlanTag: { marginTop: 1, fontSize: 7, fontFamily: "Inter_700Bold", letterSpacing: 0.7 },
  compactSubscribeButton: { width: 82, minHeight: 29, borderRadius: 9, overflow: "hidden" },
  compactSubscribeContent: { flex: 1, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 },
  compactSubscribeText: { fontSize: 8, fontFamily: "Inter_600SemiBold" },
  featuredSubscribeButton: { width: "100%", minHeight: 35, borderRadius: 9, overflow: "hidden" },
  featuredSubscribeContent: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  featuredSubscribeText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  expiryCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 13, marginTop: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  expiryTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  expiryText: { marginTop: 3, fontSize: 9, fontFamily: "Inter_400Regular" },
  noticeCard: { borderWidth: 1, borderRadius: 15, padding: 12, marginTop: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  noticeText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular" },
  planSessionNotice: { minHeight: 54, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  paymentSessionNotice: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  planSessionCopy: { flex: 1, gap: 3 },
  planSessionTitle: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  planSessionText: { fontSize: 8, lineHeight: 12, fontFamily: "Inter_400Regular" },
  planSessionRetry: { paddingHorizontal: 8, paddingVertical: 7 },
  planSessionRetryText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  activityCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 12 },
  activityHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  activityTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  activityText: { fontSize: 11, lineHeight: 17, fontFamily: "Inter_400Regular" },
  profileAction: { minHeight: 68, borderWidth: 1, borderRadius: 17, paddingHorizontal: 12, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 12 },
  errorCard: { borderWidth: 1, borderRadius: 15, padding: 12, marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  errorTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  errorText: { marginTop: 3, fontSize: 9, lineHeight: 14, fontFamily: "Inter_400Regular" },
  footer: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 16, paddingHorizontal: 2 },
  footerText: { flex: 1, fontSize: 9, lineHeight: 14, fontFamily: "Inter_400Regular" },
  bottomNav: { minHeight: 72, borderTopWidth: 1, paddingTop: 8, paddingBottom: 16, paddingHorizontal: 14, flexDirection: "row", justifyContent: "space-around" },
  navButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  navLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  modalScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(3, 8, 18, 0.78)" },
  paymentSheet: { borderWidth: 1, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 11, paddingBottom: 34 },
  sheetHandle: { width: 38, height: 4, borderRadius: 4, alignSelf: "center", marginBottom: 19 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 19 },
  sheetTitle: { fontSize: 21, fontFamily: "Inter_700Bold", letterSpacing: -0.45 },
  sheetSubtitle: { maxWidth: 270, marginTop: 6, fontSize: 11, lineHeight: 17, fontFamily: "Inter_400Regular" },
  orderSummary: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  orderPlan: { fontSize: 12, fontFamily: "Inter_700Bold" },
  orderDuration: { marginTop: 4, fontSize: 9, fontFamily: "Inter_400Regular" },
  orderPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
  inputLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  phoneField: { minHeight: 49, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  phoneInput: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", paddingVertical: 10 },
  countryCode: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  formError: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 },
  formErrorText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: "Inter_500Medium", marginTop: 7 },
  payButton: { minHeight: 49, borderRadius: 15, marginTop: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  payButtonText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  securePaymentNote: { marginTop: 11, textAlign: "center", fontSize: 9, fontFamily: "Inter_400Regular" },
  recoverySheet: { alignSelf: "center", width: "90%", maxWidth: 440, borderWidth: 1, borderRadius: 25, padding: 21, marginBottom: 28 },
  recoveryIcon: { width: 41, height: 41, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  recoveryDescription: { marginTop: 8, fontSize: 11, lineHeight: 17, fontFamily: "Inter_400Regular" },
  recoveryCode: { marginTop: 15, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 13, fontSize: 12, lineHeight: 21, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  recoveryInput: { minHeight: 49, borderWidth: 1, borderRadius: 13, marginTop: 15, paddingHorizontal: 12, fontSize: 12, fontFamily: "Inter_500Medium" },
  dismissRecovery: { alignSelf: "center", padding: 11 },
  dismissText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
