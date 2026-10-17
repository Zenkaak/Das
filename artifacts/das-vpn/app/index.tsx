import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  ActivityIndicator,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
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
  RECOVERY_PIN_KEY,
  RECOVERY_SEEN_KEY,
  setSessionValue,
  TOKEN_KEY,
} from "@/lib/sessionStorage";
import { syncVpnStatusNotification } from "@/lib/vpnStatusNotification";

const navigation = [
  { key: "home", label: "Home", icon: "home" },
  { key: "plans", label: "Plans", icon: "shield" },
  { key: "activity", label: "Activity", icon: "activity" },
  { key: "profile", label: "Profile", icon: "user" },
] as const;

type Tab = (typeof navigation)[number]["key"];
type PaymentFlow = "input" | "processing" | "success" | "issue";
type ActivityFilter = "all" | "payments" | "subscriptions";
type RecoveryStep = "setup" | "confirm" | "unlock" | "key" | "restore";

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

<<<<<<< HEAD
function formatSubscriptionCountdown(expiresAt: string, now: number): string {
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(remainingMs)) return "Unavailable";
  if (remainingMs <= 0) return "Expired";

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return days > 0 ? `${days}d ${clock}` : clock;
}

=======
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)
function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const activityDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  if (activityDay === today) {
    return `Today, ${date.toLocaleTimeString("en-KE", {
      timeZone: "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return formatDate(value);
}

function activityTitle(type: string, status: string): string {
  if (type === "activation") return "Subscription Activated";
  if (type === "expiry") return "Subscription Expired";
  if (status === "pending") return "Payment in progress";
  if (status === "paid") return "Payment successful";
  if (status === "failed") return "Payment failed";
  if (status === "cancelled") return "Payment cancelled";
  if (status === "expired") return "Payment expired";
  return "Payment Update";
}

function activityIcon(type: string, status: string): React.ComponentProps<typeof Feather>["name"] {
  if (type === "activation") return "check-square";
  if (type === "expiry") return "clock";
  if (status === "pending") return "smartphone";
  return "credit-card";
}

function formatActivityClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-KE", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function activityDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function activityDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const key = activityDayKey(value);
  const today = activityDayKey(new Date().toISOString());
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (key === today) return "Today";
  if (key === activityDayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString("en-KE", {
    timeZone: "Africa/Nairobi",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function activityStatusLabel(status: string): string {
  if (status === "paid" || status === "active") return "Complete";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "expired") return "Expired";
  return "Updated";
}

async function saveRecoveryPin(pin: string): Promise<void> {
  const salt = await randomHex(16);
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
  );
  await setSessionValue(RECOVERY_PIN_KEY, `${salt}:${digest}`);
}

async function verifyRecoveryPin(pin: string): Promise<boolean> {
  const record = await getSessionValue(RECOVERY_PIN_KEY);
  if (!record) return false;
  const separator = record.indexOf(":");
  if (separator < 1) return false;
  const salt = record.slice(0, separator);
  const savedDigest = record.slice(separator + 1);
  const attemptDigest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
  );
  return attemptDigest === savedDigest;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-KE");
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
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("restore");
  const [recoveryPin, setRecoveryPin] = useState("");
  const [pendingRecoveryPin, setPendingRecoveryPin] = useState("");
  const [recoveryPinConfigured, setRecoveryPinConfigured] = useState(false);
  const [recoveryPinError, setRecoveryPinError] = useState("");
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
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
<<<<<<< HEAD
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
=======
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const checkoutOpening = useRef(false);
  const paymentSubmissionLock = useRef(false);
  const pullStartY = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const scrollOffsetY = useRef(0);

  const aura = useSharedValue(0.55);
  const orbit = useSharedValue(0);
  const outerOrbit = useSharedValue(0);
  const signalWave = useSharedValue(0);
  const float = useSharedValue(0);
<<<<<<< HEAD
  const subscriptionCardPulse = useSharedValue(0);
=======
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)
  useEffect(() => {
    aura.value = withRepeat(withTiming(1, { duration: 2200 }), -1, true);
    orbit.value = withRepeat(withTiming(1, { duration: 8400 }), -1, false);
    outerOrbit.value = withRepeat(withTiming(1, { duration: 11800 }), -1, false);
    signalWave.value = withRepeat(withTiming(1, { duration: 2600 }), -1, false);
    float.value = withRepeat(withTiming(1, { duration: 1800 }), -1, true);
<<<<<<< HEAD
    subscriptionCardPulse.value = withRepeat(withTiming(1, { duration: 1900 }), -1, true);
  }, [aura, float, orbit, outerOrbit, signalWave, subscriptionCardPulse]);
=======
  }, [aura, float, orbit, outerOrbit, signalWave]);
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)
  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.23 + aura.value * 0.28,
    transform: [{ scale: 0.94 + aura.value * 0.06 }],
  }));
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbit.value * 360}deg` }],
  }));
  const outerOrbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${outerOrbit.value * -360}deg` }],
  }));
  const signalWaveStyle = useAnimatedStyle(() => ({
    opacity: 0.28 * (1 - signalWave.value),
    transform: [{ scale: 0.91 + signalWave.value * 0.17 }],
  }));
  const orbFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value * -6 }],
  }));
<<<<<<< HEAD
  const subscriptionCardPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + subscriptionCardPulse.value * 0.012 }],
    shadowOpacity: 0.08 + subscriptionCardPulse.value * 0.14,
    shadowRadius: 8 + subscriptionCardPulse.value * 6,
  }));
  const subscriptionIndicatorPulseStyle = useAnimatedStyle(() => ({
    opacity: 0.58 + subscriptionCardPulse.value * 0.42,
    transform: [{ scale: 0.88 + subscriptionCardPulse.value * 0.24 }],
  }));
=======
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)

  const startDeviceSession = useCallback(async () => {
    setSessionMessage("");
    setSessionReady(false);
    try {
      const storedToken = await getSessionValue(TOKEN_KEY);
      const storedRecovery = await getSessionValue(RECOVERY_KEY);
      const storedPin = await getSessionValue(RECOVERY_PIN_KEY);
      setRecoveryPinConfigured(Boolean(storedPin));
      const isNewSession = !storedToken || !storedRecovery;
      const token = storedToken ?? await randomHex(32);
      const recovery = storedRecovery ?? await randomHex(32);
      if (isNewSession) {
        await setSessionValue(TOKEN_KEY, token);
        await setSessionValue(RECOVERY_KEY, recovery);
      }
      setRecoveryKey(recovery);
      if (isNewSession && (await getSessionValue(RECOVERY_SEEN_KEY)) !== "yes") {
        setRecoveryStep(storedPin ? "unlock" : "setup");
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
      refetchInterval: activeTab === "activity" ? 8000 : false,
    },
  });
  const paymentLookupId = paymentId || statusQuery.data?.latestPayment?.id || "";
  const paymentQuery = useGetVpnPayment(paymentLookupId, {
    query: {
      queryKey: ["vpn", "payment", paymentLookupId],
      enabled: sessionReady && paymentLookupId.length > 0,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status && status !== "pending") return false;
        if (paymentFlow === "processing") return timedOut ? 10000 : 3000;
        if (activeTab === "activity" && paymentLookupId) return 10000;
        return false;
      },
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
  const nativeTunnelConnected = Boolean(statusQuery.data?.nativeTunnel?.connected);
  useEffect(() => {
    void syncVpnStatusNotification(nativeTunnelConnected);
  }, [nativeTunnelConnected]);
  const hasActiveSubscription = Boolean(
    subscription?.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now(),
  );
<<<<<<< HEAD
  useEffect(() => {
    if (!hasActiveSubscription || !subscription?.expiresAt) return;
    setCountdownNow(Date.now());
    const timer = setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasActiveSubscription, subscription?.expiresAt]);
=======
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)
  const subscriptionPlan = plans.find((plan) => plan.code === subscription?.planCode);
  const featuredPlan = plans.find((plan) => plan.durationDays === 3) ?? plans[0];
  const preferredPopularPlans = plans.filter(
    (plan) => plan.durationDays === 7 || plan.durationDays === 30,
  );
  const homePopularPlans = preferredPopularPlans.length
    ? preferredPopularPlans
    : plans.slice(0, 2);
  const latestPayment = paymentQuery.data ?? null;
  const selectedPlanLabel = currentPlan?.label ?? "Selected plan";
  const startPaymentForPlan = (planCode: string) => {
    if (checkoutOpening.current || paymentFlow) return;
    checkoutOpening.current = true;
    setSelectedPlanCode(planCode);
    setPaymentError("");
    setPaymentFlow("input");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openPayment = () => {
    if (currentPlan) startPaymentForPlan(currentPlan.code);
  };

  const openSupport = async () => {
    const message = encodeURIComponent("Hi DAS VPN Support, I need help with my subscription.");
    try {
      await Linking.openURL(`https://wa.me/254180802616?text=${message}`);
    } catch {
      Alert.alert(
        "Unable to open WhatsApp",
        "Please contact DAS VPN Support at +254 180 802 616.",
      );
    }
  };

  const closePaymentFlow = () => {
    checkoutOpening.current = false;
    setPaymentFlow(null);
    setPaymentError("");
  };

  const refreshVisibleData = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    const jobs: Promise<unknown>[] = [];
    if (sessionReady) {
      jobs.push(statusQuery.refetch());
      if (activeTab === "activity") jobs.push(activityQuery.refetch());
      if (paymentLookupId) jobs.push(paymentQuery.refetch());
    }
    if (activeTab === "home" || activeTab === "plans") jobs.push(plansQuery.refetch());
    try {
      await Promise.allSettled(jobs);
    } finally {
      setRefreshing(false);
    }
  }, [
    activeTab,
    activityQuery.refetch,
    paymentLookupId,
    paymentQuery.refetch,
    plansQuery.refetch,
    refreshing,
    sessionReady,
    statusQuery.refetch,
  ]);

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (showRecovery && recoveryStep === "key") {
          setShowRecovery(false);
          setRecoveryStep("unlock");
        }
        return;
      }
      if (!sessionReady) return;
      void statusQuery.refetch();
      if (activeTab === "activity") void activityQuery.refetch();
      if (paymentLookupId) void paymentQuery.refetch();
    });
    return () => listener.remove();
  }, [
    activeTab,
    activityQuery.refetch,
    paymentLookupId,
    paymentQuery.refetch,
    recoveryStep,
    sessionReady,
    showRecovery,
    statusQuery.refetch,
  ]);

  const finishRecoveryNotice = async () => {
    await setSessionValue(RECOVERY_SEEN_KEY, "yes");
    setShowRecovery(false);
    setRecoveryStep("unlock");
    setRecoveryPin("");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const openRecovery = () => {
    setPaymentError("");
    setRecoveryInput("");
    setRecoveryPin("");
    setPendingRecoveryPin("");
    setRecoveryPinError("");
    setRecoveryStep(recoveryKey ? (recoveryPinConfigured ? "unlock" : "setup") : "restore");
    setShowRecovery(true);
  };

  const closeRecovery = () => {
    Keyboard.dismiss();
    setShowRecovery(false);
    setRecoveryPin("");
    setPendingRecoveryPin("");
    setRecoveryPinError("");
    setRecoveryStep(recoveryKey ? "unlock" : "restore");
  };

  const submitRecoveryPin = async () => {
    Keyboard.dismiss();
    setRecoveryPinError("");
    if (!/^\d{4}$/.test(recoveryPin)) {
      setRecoveryPinError("Enter all 4 digits to continue.");
      return;
    }

    try {
      if (recoveryStep === "setup") {
        setPendingRecoveryPin(recoveryPin);
        setRecoveryPin("");
        setRecoveryStep("confirm");
        return;
      }

      if (recoveryStep === "confirm") {
        if (recoveryPin !== pendingRecoveryPin) {
          setRecoveryPin("");
          setRecoveryPinError("Those PINs don’t match. Try again.");
          return;
        }
        await saveRecoveryPin(recoveryPin);
        setRecoveryPinConfigured(true);
        setRecoveryPin("");
        setPendingRecoveryPin("");
        setRecoveryStep("key");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      if (recoveryStep === "unlock") {
        if (await verifyRecoveryPin(recoveryPin)) {
          setRecoveryPin("");
          setRecoveryStep("key");
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setRecoveryPin("");
          setRecoveryPinError("That PIN isn’t correct. Try again.");
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    } catch {
      setRecoveryPin("");
      setRecoveryPinError("The recovery PIN couldn’t be checked or saved securely. Please try again.");
    }
  };

  const submitPayment = async () => {
    if (paymentSubmissionLock.current) return;
    paymentSubmissionLock.current = true;
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
      paymentSubmissionLock.current = false;
      return;
    }
    if (!sessionReady || !currentPlan) {
      setPaymentError("Your secure session or plan details are still loading. Try again shortly.");
      paymentSubmissionLock.current = false;
      return;
    }
    setSubmittingPayment(true);
    try {
      const phoneNumber = `+254${nationalDigits}`;
      const existingAttempt = paymentAttempt;
      const key = existingAttempt &&
        existingAttempt.planCode === currentPlan.code &&
        existingAttempt.phoneNumber === phoneNumber
        ? existingAttempt.key
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
      void statusQuery.refetch();
      void activityQuery.refetch();
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
      paymentSubmissionLock.current = false;
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
      setRecoveryPin("");
      setRecoveryPinError("");
      setRecoveryStep(recoveryPinConfigured ? "unlock" : "setup");
      setShowRecovery(true);
      await statusQuery.refetch();
    } catch {
      setPaymentError("That recovery key could not be verified. No subscription data was changed.");
    } finally {
      setRecovering(false);
    }
  };

  const showHeaderBack = paymentFlow !== null || activeTab === "plans";
  const onHeaderBack = () => {
    if (paymentFlow !== null) {
      closePaymentFlow();
      setActiveTab("plans");
    } else {
      setActiveTab("home");
    }
  };

  const compactHeader = !paymentFlow && (activeTab === "plans" || activeTab === "profile");
  const contentTop = Platform.OS === "web"
    ? paymentFlow ? 37 : activeTab === "plans" ? 24 : activeTab === "profile" ? 32 : 57
    : paymentFlow
      ? insets.top + 14
      : insets.top + (activeTab === "plans" ? 0 : activeTab === "profile" ? 8 : 14);
  const contentBottom = Platform.OS === "web" ? 82 : 78 + insets.bottom;
  const paymentName = latestPayment?.planCode
    ? plans.find((plan) => plan.code === latestPayment.planCode)?.label ?? selectedPlanLabel
    : selectedPlanLabel;
  const allActivities = activityQuery.data?.activities ?? [];
  const visibleActivities = allActivities.filter((item) => {
    if (activityFilter === "payments") return item.type === "payment";
    if (activityFilter === "subscriptions") return item.type === "activation" || item.type === "expiry";
    return true;
  });
  const paymentEventCount = allActivities.filter((item) => item.type === "payment").length;
  const subscriptionEventCount = allActivities.filter(
    (item) => item.type === "activation" || item.type === "expiry",
  ).length;
  const activityGroups = new Map<string, {
    label: string;
    items: (typeof visibleActivities)[number][];
  }>();
  for (const item of visibleActivities) {
    const key = activityDayKey(item.occurredAt);
    const existingGroup = activityGroups.get(key);
    if (existingGroup) {
      existingGroup.items.push(item);
    } else {
      activityGroups.set(key, { label: activityDayLabel(item.occurredAt), items: [item] });
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
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
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollOffsetY.current = event.nativeEvent.contentOffset.y;
        }}
        onTouchStart={(event) => {
          if (Platform.OS !== "web" || refreshing || scrollOffsetY.current > 1) return;
          const touch = event.nativeEvent.touches[0];
          pullStartY.current = touch?.pageY ?? null;
        }}
        onTouchMove={(event) => {
          if (Platform.OS !== "web" || pullStartY.current === null || scrollOffsetY.current > 1) return;
          const touch = event.nativeEvent.touches[0];
          if (!touch) return;
          const distance = Math.max(0, touch.pageY - pullStartY.current);
          pullDistanceRef.current = distance;
          setPullDistance(Math.min(distance, 80));
          if (distance > 8) event.preventDefault();
        }}
        onTouchEnd={() => {
          const shouldRefresh = Platform.OS === "web" && pullDistanceRef.current >= 64;
          pullStartY.current = null;
          pullDistanceRef.current = 0;
          setPullDistance(0);
          if (shouldRefresh) void refreshVisibleData();
        }}
        onTouchCancel={() => {
          pullStartY.current = null;
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshVisibleData()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
          />
        }
      >
        {Platform.OS === "web" && (pullDistance > 8 || refreshing) ? (
          <View
            style={[
              styles.webRefreshIndicator,
              { height: refreshing ? 40 : Math.min(44, pullDistance * 0.6) },
            ]}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
              {refreshing ? "Refreshing…" : pullDistance >= 64 ? "Release to refresh" : "Pull to refresh"}
            </Text>
          </View>
        ) : null}
        <View style={[styles.header, compactHeader ? styles.compactHeader : null]}>
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
          ) : activeTab === "home" ? (
            <View style={styles.brand}>
              <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
                <Feather name="shield" size={18} color={colors.primaryForeground} />
              </View>
              <View>
                <Text style={[styles.brandName, { color: colors.foreground }]}>DAS VPN</Text>
              </View>
            </View>
          ) : null}
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {paymentFlow
              ? "Payment"
              : activeTab === "plans"
                ? "Subscription Plans"
                : activeTab === "activity"
                  ? "Activity"
                  : activeTab === "profile"
                    ? "Profile"
                    : ""}
          </Text>
          {!paymentFlow && activeTab === "home" ? (
            <Pressable
              onPress={() => setActiveTab("profile")}
              style={styles.headerAction}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              testID="home-menu"
            >
              <Feather name="menu" size={20} color={colors.foreground} />
            </Pressable>
          ) : !paymentFlow && activeTab === "profile" ? (
            <Pressable
              onPress={openRecovery}
              style={styles.headerAction}
              accessibilityRole="button"
              accessibilityLabel="Device recovery settings"
              testID="recovery-open"
            >
              <Feather name="settings" size={19} color={colors.foreground} />
            </Pressable>
          ) : null}
        </View>

        {!paymentFlow && activeTab === "home" ? (
          <>
            <Animated.View entering={FadeInDown.duration(380).delay(40)} style={styles.homeHeroIntro}>
              <Text style={[styles.homeHeadline, { color: colors.foreground }]}>
                Your internet,{"\n"}
                <Text style={{ color: colors.accent }}>without limits</Text>
              </Text>
              <View
                style={[
                  styles.homeStatusPill,
                  {
                    backgroundColor: hasActiveSubscription ? colors.successSurface : colors.badgeSurface,
                    borderColor: hasActiveSubscription ? colors.successBorder : colors.border,
                  },
                ]}
              >
                <Feather
                  name={hasActiveSubscription ? "check-circle" : "shield"}
                  size={14}
                  color={hasActiveSubscription ? colors.success : colors.accent}
                />
                <Text
                  style={[
                    styles.homeStatusPillText,
                    { color: hasActiveSubscription ? colors.success : colors.foreground },
                  ]}
                >
                  {hasActiveSubscription ? "SUBSCRIPTION ACTIVE" : "CHOOSE A PLAN TO START"}
                </Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(430).delay(100)} style={styles.homeOrbArea}>
              <Animated.View
                style={[
                  styles.orbAura,
                  { backgroundColor: hasActiveSubscription ? colors.primary : colors.accent },
                  auraStyle,
                ]}
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.orbPulseRing,
                  { borderColor: hasActiveSubscription ? colors.orbEdge : colors.accent },
                  signalWaveStyle,
                ]}
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.orbitTrackWide,
                  { borderColor: colors.border },
                  outerOrbitStyle,
                ]}
              >
                <View style={[styles.orbitDotWide, { backgroundColor: colors.success }]} />
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.orbitTrack,
                  { borderColor: colors.orbEdge },
                  orbitStyle,
                ]}
              >
                <View style={[styles.orbitDot, { backgroundColor: colors.accent }]} />
              </Animated.View>
              <Animated.View
                style={[
                  styles.orbRingOuter,
                  { borderColor: hasActiveSubscription ? colors.orbEdge : colors.border },
                  orbFloatStyle,
                ]}
              >
                <LinearGradient
                  colors={[colors.backgroundGlow, colors.background]}
                  style={styles.orb}
                  testID="subscription-status-orb"
                >
                  <View style={styles.orbInner}>
                    <Feather
                      name={hasActiveSubscription ? "check" : "shield"}
                      size={34}
                      color={hasActiveSubscription ? colors.success : colors.accent}
                    />
                    <Text style={[styles.orbLabel, { color: colors.foreground }]}>
                      {hasActiveSubscription ? "SUBSCRIPTION" : "GET STARTED"}
                    </Text>
                    <Text
                      style={[
                        styles.orbStateLabel,
                        { color: hasActiveSubscription ? colors.success : colors.mutedForeground },
                      ]}
                    >
                      {hasActiveSubscription ? "ACTIVE" : "VIEW PLANS"}
                    </Text>
                  </View>
                </LinearGradient>
              </Animated.View>
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(400).delay(170)}>
<<<<<<< HEAD
              <Animated.View
                style={[
                  styles.homeStatusCardMotion,
                  hasActiveSubscription ? styles.homeStatusCardActiveMotion : null,
                  { backgroundColor: colors.card },
                  hasActiveSubscription ? subscriptionCardPulseStyle : null,
                ]}
              >
                <Pressable
                  onPress={() => setActiveTab(hasActiveSubscription ? "activity" : "plans")}
                  style={({ pressed }) => [
                    styles.homeStatusCard,
                    hasActiveSubscription ? styles.homeStatusCardActive : null,
                    {
                      backgroundColor: colors.card,
                      borderColor: hasActiveSubscription ? colors.successBorder : colors.border,
                    },
                    pressed ? styles.pressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    hasActiveSubscription && subscription
                      ? `View active subscription details, ${formatSubscriptionCountdown(subscription.expiresAt, countdownNow)} remaining`
                      : hasActiveSubscription
                        ? "View active subscription details"
                        : "Choose a subscription plan"
                  }
                  testID="open-plans"
                >
                  <Animated.View style={hasActiveSubscription ? subscriptionIndicatorPulseStyle : undefined}>
                    <IconTile
                      icon={nativeTunnelConnected ? "wifi" : hasActiveSubscription ? "check" : "calendar"}
                      color={nativeTunnelConnected || hasActiveSubscription ? colors.success : colors.accent}
                      background={nativeTunnelConnected || hasActiveSubscription ? colors.successSurface : colors.iconSurface}
                      size={18}
                    />
                  </Animated.View>
                  <View style={styles.homeStatusCopy}>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                      {nativeTunnelConnected
                        ? "Connected securely"
                        : hasActiveSubscription
                          ? "Your subscription is active"
                          : "No active subscription"}
                    </Text>
                    <Text style={[styles.smallCopy, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {nativeTunnelConnected
                        ? `${subscriptionPlan?.label ?? "Active plan"} · Connection verified`
                        : hasActiveSubscription && subscription
                          ? `${subscriptionPlan?.label ?? "Active plan"} · Expires ${formatDate(subscription.expiresAt)}`
                          : "Choose a package to activate your subscription."}
                    </Text>
                    {hasActiveSubscription && subscription ? (
                      <View
                        style={[
                          styles.subscriptionCountdownRow,
                          { backgroundColor: colors.successSurface },
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.subscriptionCountdownDot,
                            { backgroundColor: colors.success },
                            subscriptionIndicatorPulseStyle,
                          ]}
                        />
                        <Text style={[styles.subscriptionCountdownLabel, { color: colors.mutedForeground }]}>
                          TIME LEFT
                        </Text>
                        <Animated.Text
                          style={[
                            styles.subscriptionCountdownValue,
                            { color: colors.success },
                            subscriptionIndicatorPulseStyle,
                          ]}
                        >
                          {formatSubscriptionCountdown(subscription.expiresAt, countdownNow)}
                        </Animated.Text>
                      </View>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </Pressable>
              </Animated.View>
=======
            <Pressable
              onPress={() => setActiveTab(hasActiveSubscription ? "activity" : "plans")}
              style={({ pressed }) => [
                styles.homeStatusCard,
                {
                  backgroundColor: colors.card,
                  borderColor: hasActiveSubscription ? colors.successBorder : colors.border,
                },
                pressed ? styles.pressed : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={hasActiveSubscription ? "View active subscription details" : "Choose a subscription plan"}
              testID="open-plans"
            >
              <IconTile
                icon={nativeTunnelConnected ? "wifi" : hasActiveSubscription ? "check" : "calendar"}
                color={nativeTunnelConnected || hasActiveSubscription ? colors.success : colors.accent}
                background={nativeTunnelConnected || hasActiveSubscription ? colors.successSurface : colors.iconSurface}
                size={18}
              />
              <View style={styles.homeStatusCopy}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                  {nativeTunnelConnected
                    ? "VPN tunnel connected"
                    : hasActiveSubscription
                      ? "Your subscription is active"
                      : "No active subscription"}
                </Text>
                <Text style={[styles.smallCopy, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {nativeTunnelConnected
                    ? `${subscriptionPlan?.label ?? "Active plan"} · VPN connection verified`
                    : hasActiveSubscription && subscription
                      ? `${subscriptionPlan?.label ?? "Active plan"} · VPN not connected · Expires ${formatDate(subscription.expiresAt)}`
                      : "Choose a package to activate your subscription."}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)
            </Animated.View>

            {featuredPlan ? (
            <Animated.View entering={FadeInDown.duration(420).delay(230)}>
            <Pressable
              onPress={() => startPaymentForPlan(featuredPlan.code)}
              style={({ pressed }) => [styles.homePromoCard, pressed ? styles.pressed : null]}
              accessibilityRole="button"
              accessibilityLabel={`Buy ${featuredPlan.durationDays} days for KES ${formatAmount(featuredPlan.amountKes)}`}
              testID="featured-plan-checkout"
            >
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.homePromoGradient}
              >
                <View style={styles.homePromoIcon}>
                  <Feather name="gift" size={32} color={colors.primaryForeground} />
                </View>
                <View style={styles.homePromoCopy}>
                  <Text style={styles.homePromoBadge}>FEATURED PACKAGE</Text>
                  <Text style={styles.homePromoTitle}>
                    GET {featuredPlan.durationDays} {featuredPlan.durationDays === 1 ? "DAY" : "DAYS"}
                  </Text>
                  <Text style={styles.homePromoPrice}>KES {formatAmount(featuredPlan.amountKes)}</Text>
                  <Text style={styles.homePromoSubcopy}>{featuredPlan.label} · Paid securely with M-Pesa</Text>
                </View>
                <View style={styles.homePromoArrow}>
                  <Feather name="arrow-right" size={18} color={colors.primary} />
                </View>
              </LinearGradient>
            </Pressable>
            </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.duration(400).delay(280)} style={[styles.sectionRow, styles.homePlansHeading]}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Popular plans</Text>
                <Text style={[styles.sectionSubcopy, { color: colors.mutedForeground }]}>
                  Pick a package that suits you
                </Text>
              </View>
              <Pressable
                onPress={() => setActiveTab("plans")}
                style={styles.textAction}
                accessibilityRole="button"
                accessibilityLabel="See all plans"
                testID="see-all-plans"
              >
                <Text style={[styles.actionLabel, { color: colors.primary }]}>See all</Text>
                <Feather name="arrow-right" size={14} color={colors.primary} />
              </Pressable>
            </Animated.View>

            {homePopularPlans.length ? (
              <Animated.View entering={FadeInDown.duration(420).delay(330)} style={styles.homePopularGrid}>
                {homePopularPlans.map((plan, index) => (
                  <Animated.View
                    key={plan.code}
                    entering={FadeInDown.duration(360).delay(360 + index * 75)}
                    style={styles.homePopularAnimatedCard}
                  >
                    <Pressable
                      onPress={() => startPaymentForPlan(plan.code)}
                      style={({ pressed }) => [
                        styles.homePopularCard,
                        { backgroundColor: colors.card, borderColor: colors.border },
                        pressed ? styles.pressed : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Buy ${plan.durationDays} days for KES ${formatAmount(plan.amountKes)}`}
                      testID={`home-plan-${plan.code}`}
                    >
                      <View style={[styles.homePopularIcon, { backgroundColor: colors.iconSurface }]}>
                        <Feather name="calendar" size={18} color={colors.primary} />
                      </View>
                      <View style={styles.homePopularCopy}>
                        <Text style={[styles.homePopularDays, { color: colors.foreground }]}>
                          {plan.durationDays} {plan.durationDays === 1 ? "Day" : "Days"}
                        </Text>
                        <Text style={[styles.homePopularPrice, { color: colors.foreground }]}>
                          KES {formatAmount(plan.amountKes)}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                    </Pressable>
                  </Animated.View>
                ))}
              </Animated.View>
            ) : plansQuery.isLoading ? (
              <View style={styles.homePlansLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>Loading packages…</Text>
              </View>
            ) : (
              <View style={[styles.homePlansEmpty, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                  Packages are temporarily unavailable. Please try again shortly.
                </Text>
              </View>
            )}

            <Animated.View entering={FadeInDown.duration(420).delay(390)}>
            <Pressable
              onPress={() => void openSupport()}
              style={({ pressed }) => [
                styles.homeSupportCard,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed ? styles.pressed : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Chat with DAS VPN support on WhatsApp"
              testID="home-support"
            >
              <View style={[styles.homeSupportIcon, { backgroundColor: colors.successSurface }]}>
                <Feather name="message-circle" size={20} color={colors.success} />
              </View>
              <View style={styles.flexOne}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>Need help?</Text>
                <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                  Chat with our support team
                </Text>
              </View>
              <Text style={[styles.homeSupportAction, { color: colors.primary }]}>Chat</Text>
              <Feather name="arrow-up-right" size={15} color={colors.primary} />
            </Pressable>
            </Animated.View>

            {sessionMessage || statusQuery.isError || plansQuery.isError ? (
              <InlineError
                message={
                  sessionMessage
                    || (statusQuery.isError
                      ? "Subscription details could not be refreshed. Retry to check your status."
                      : "Plans could not be refreshed. Retry to check current packages.")
                }
                onRetry={() => void (
                  sessionMessage
                    ? startDeviceSession()
                    : statusQuery.isError
                      ? statusQuery.refetch()
                      : plansQuery.refetch()
                )}
                colors={colors}
              />
            ) : null}
          </>
        ) : null}

        {!paymentFlow && activeTab === "plans" ? (
          <>
            <View style={[styles.screenIntro, styles.compactScreenIntro]}>
              <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
                Choose your preferred plan
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
                        void Haptics.selectionAsync();
                        startPaymentForPlan(plan.code);
                      }}
                      style={[
                        styles.planCard,
                        {
                          backgroundColor: selected ? colors.selectedCard : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                        selected ? styles.planCardSelected : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${plan.label}, KES ${formatAmount(plan.amountKes)}, ${plan.durationDays} days`}
                      testID={`plan-${plan.code}`}
                    >
                      <View style={styles.planCopy}>
                        <View style={styles.planNameLine}>
                          <Text style={[styles.planName, { color: colors.foreground }]}>{plan.label}</Text>
                          {plan.badge ? (
                              <View style={[styles.planBadge, { backgroundColor: colors.primary }]}>
                                <Text style={[styles.planBadgeText, { color: colors.primaryForeground }]}>{plan.badge}</Text>
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
            <Pressable
              onPress={openPayment}
              disabled={!currentPlan || plansQuery.isLoading}
              style={({ pressed }) => [
                styles.primaryButton,
                styles.plansContinue,
                { opacity: !currentPlan || plansQuery.isLoading ? 0.52 : 1 },
                pressed ? styles.pressed : null,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !currentPlan || plansQuery.isLoading }}
              testID="plans-continue"
            >
              <LinearGradient colors={[colors.primary, colors.accent]} style={[styles.primaryButtonGradient, styles.plansContinueGradient]}>
                <Text style={styles.primaryButtonText}>Continue</Text>
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
                <Text style={[styles.inputTitle, { color: colors.foreground }]}>M-Pesa Payment</Text>
              <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                Enter your M-Pesa phone number to receive the STK Push.
              </Text>
              <View style={[styles.phoneField, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.keBadge, { backgroundColor: colors.successSurface }]}>
                    <Text style={[styles.keText, { color: colors.success }]}>🇰🇪</Text>
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
                  <Text style={styles.mpesaButtonText}>Pay with M-Pesa</Text>
                )}
              </Pressable>
              <View style={[styles.mpesaInfo, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.mpesaMark, { backgroundColor: colors.successSurface }]}>
                    <Text style={[styles.mpesaMarkText, { color: colors.success }]}>M-PESA</Text>
                </View>
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Secure payment powered by</Text>
<<<<<<< HEAD
                  <Text style={[styles.rowTitle, styles.mpesaProvider, { color: colors.foreground }]}>DAS VPN</Text>
=======
                  <Text style={[styles.rowTitle, styles.mpesaProvider, { color: colors.foreground }]}>CustomerBuyGoodsOnline</Text>
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                    You’ll receive an STK Push on your phone. Enter your M-Pesa PIN to complete the payment.
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {paymentFlow === "processing" ? (
          <View style={styles.processingScreen}>
            <View style={styles.phoneIllustration}>
              <LinearGradient
                colors={["rgba(18, 119, 255, 0.42)", "rgba(18, 119, 255, 0)"]}
                style={styles.phoneAura}
              />
              <View style={[styles.phoneOutline, { borderColor: colors.orbEdge }]}>
                <View style={[styles.phoneNotch, { backgroundColor: colors.border }]} />
                <Animated.View style={[styles.phoneSpinner, auraStyle, { borderColor: colors.primary }]} />
              </View>
              <View style={styles.sparkleLeft}><Feather name="plus" size={13} color={colors.accent} /></View>
              <View style={styles.sparkleRight}><Feather name="plus" size={13} color={colors.primary} /></View>
            </View>
            <Text style={[styles.processingTitle, { color: colors.foreground }]}>Processing Payment</Text>
            <Text style={[styles.processingSubtitle, { color: colors.mutedForeground }]}>
              {timedOut
                ? "Still checking with M-Pesa. Your request remains pending until it is verified."
                : "Please enter your M-Pesa PIN on your phone."}
            </Text>
            <View style={[styles.stepsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { icon: "check", title: "STK Push Sent", copy: "Waiting for your M-Pesa PIN", complete: true },
                { icon: "refresh-cw", title: "Payment Verification", copy: "Confirming with M-Pesa...", active: true },
                { icon: "shield", title: "Activating Subscription", copy: "After verified payment" },
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
                  Still pending. We’ll keep checking automatically; no subscription is active until M-Pesa confirms.
                </Text>
                <Pressable onPress={() => { setTimedOut(false); void paymentQuery.refetch(); }} accessibilityRole="button" testID="payment-retry">
                  <Feather name="refresh-cw" size={17} color={colors.primary} />
                </Pressable>
              </View>
            ) : null}
            {paymentQuery.isError ? (
              <InlineError message="Payment status is temporarily unavailable. We’re still checking; your subscription will update once M-Pesa confirms." onRetry={() => void paymentQuery.refetch()} colors={colors} />
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
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Payment Successful!</Text>
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
            <View style={styles.successConnectionCard}>
              <LinearGradient
                colors={["#241471", "#171c57"]}
                style={styles.successConnectionGradient}
              >
                <View style={[styles.successConnectionIcon, { backgroundColor: colors.iconSurface }]}>
                  <Feather
                    name={nativeTunnelConnected ? "wifi" : "wifi-off"}
                    size={17}
                    color={nativeTunnelConnected ? colors.success : colors.accent}
                  />
                </View>
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>
<<<<<<< HEAD
                    {nativeTunnelConnected ? "Connected securely" : "Subscription active"}
=======
                    {nativeTunnelConnected ? "Connected securely" : "VPN not connected"}
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)
                  </Text>
                  <Text style={[styles.smallCopy, { color: "#c2c6ef" }]}>
                    {nativeTunnelConnected
                      ? "Your secure connection is active."
<<<<<<< HEAD
                      : "Your payment is verified and your subscription is active."}
=======
                      : "Your payment is verified. A live VPN server is not configured yet."}
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)
                  </Text>
                </View>
              </LinearGradient>
            </View>
            <Pressable
              onPress={() => { setPaymentFlow(null); setActiveTab("activity"); }}
              style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}
              accessibilityRole="button"
              testID="payment-success-home"
            >
              <LinearGradient colors={[colors.primary, colors.accent]} style={styles.primaryButtonGradient}>
                <Text style={styles.primaryButtonText}>View Details</Text>
              </LinearGradient>
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
            <Animated.View entering={FadeInDown.duration(360).delay(30)} style={styles.activityIntro}>
              <Text style={[styles.activityEyebrow, { color: colors.accent }]}>ACCOUNT TIMELINE</Text>
              <Text style={[styles.activityHeading, { color: colors.foreground }]}>Your history</Text>
              <Text style={[styles.activitySubtitle, { color: colors.mutedForeground }]}>
                Payments and plan changes, organized in one place.
              </Text>
            </Animated.View>

            <View style={styles.activitySummaryGrid}>
              <View style={[styles.activitySummaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.activitySummaryHeader}>
                  <IconTile icon="credit-card" color={colors.primary} background={colors.iconSurface} size={16} />
                  <Text style={[styles.activitySummaryLabel, { color: colors.mutedForeground }]}>PAYMENTS</Text>
                </View>
                <Text style={[styles.activitySummaryValue, { color: colors.foreground }]}>
                  {activityQuery.isLoading ? "—" : paymentEventCount}
                </Text>
                <Text style={[styles.activitySummaryCopy, { color: colors.mutedForeground }]}>Recorded transactions</Text>
              </View>
              <View style={[styles.activitySummaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.activitySummaryHeader}>
                  <IconTile icon="shield" color={colors.success} background={colors.successSurface} size={16} />
                  <Text style={[styles.activitySummaryLabel, { color: colors.mutedForeground }]}>PLAN CHANGES</Text>
                </View>
                <Text style={[styles.activitySummaryValue, { color: colors.foreground }]}>
                  {activityQuery.isLoading ? "—" : subscriptionEventCount}
                </Text>
                <Text style={[styles.activitySummaryCopy, { color: colors.mutedForeground }]}>Activations and expiries</Text>
              </View>
            </View>

            <View style={styles.activityFilters}>
              {[
                { key: "all", label: "All" },
                { key: "payments", label: "Payments" },
                { key: "subscriptions", label: "Plan changes" },
              ].map((filter) => {
                const selected = activityFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setActivityFilter(filter.key as ActivityFilter)}
                    style={[
                      styles.activityFilter,
                      {
                        backgroundColor: selected ? colors.accent : colors.card,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    testID={`activity-filter-${filter.key}`}
                  >
                    <Text style={[styles.activityFilterText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {activityQuery.isLoading && sessionReady ? (
              <View style={[styles.activityFeed, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[0, 1, 2].map((item) => (
                  <View key={item} style={[styles.activitySkeleton, { backgroundColor: colors.secondary }]} />
                ))}
              </View>
            ) : activityQuery.isError ? (
              <InlineError
                message="Activity could not be refreshed. Pull down to retry."
                onRetry={() => void activityQuery.refetch()}
                colors={colors}
              />
            ) : visibleActivities.length ? (
              <View style={styles.activityGroups}>
                {Array.from(activityGroups.values()).map((group) => (
                  <View key={activityDayKey(group.items[0]?.occurredAt ?? "")}>
                    <View style={styles.activityDayHeading}>
                      <Text style={[styles.activityDayTitle, { color: colors.foreground }]}>{group.label}</Text>
                      <Text style={[styles.activityDayCount, { color: colors.mutedForeground }]}>
                        {group.items.length} {group.items.length === 1 ? "event" : "events"}
                      </Text>
                    </View>
                    <View
                      style={[styles.activityFeed, { backgroundColor: colors.card, borderColor: colors.border }]}
                      testID="activity-feed"
                    >
                      {group.items.map((item, index) => {
                        const isSuccess = item.status === "paid" || item.status === "active";
                        const isPending = item.status === "pending";
                        const isFailure = ["failed", "cancelled", "expired"].includes(item.status);
                        const statusColor = isSuccess
                          ? colors.success
                          : isPending
                            ? colors.accent
                            : isFailure
                              ? colors.destructive
                              : colors.mutedForeground;
                        const statusSurface = isSuccess
                          ? colors.successSurface
                          : isPending
                            ? colors.pendingSurface
                            : colors.iconSurface;
                        return (
                          <Animated.View
                            key={item.id}
                            entering={FadeInDown.duration(300).delay(Math.min(index * 45, 270))}
                            style={[
                              styles.activityFeedRow,
                              index > 0 ? { borderTopColor: colors.border, borderTopWidth: 1 } : null,
                            ]}
                          >
                            <View style={[styles.activityEventIcon, { backgroundColor: statusSurface }]}>
                              <Feather name={activityIcon(item.type, item.status)} size={17} color={statusColor} />
                            </View>
                            <View style={styles.activityEventCopy}>
                              <Text style={[styles.activityEventTitle, { color: colors.foreground }]}>
                                {activityTitle(item.type, item.status)}
                              </Text>
                              <Text style={[styles.activityEventDescription, { color: colors.mutedForeground }]} numberOfLines={1}>
                                {item.planLabel}
                                {item.type === "payment" ? ` · KES ${formatAmount(item.amountKes)}` : ""}
                              </Text>
                            </View>
                            <View style={styles.activityMeta}>
                              <Text style={[styles.activityTime, { color: colors.mutedForeground }]}>
                                {formatActivityClock(item.occurredAt)}
                              </Text>
                              <View style={[styles.activityStatusBadge, { backgroundColor: statusSurface }]}>
                                <Text style={[styles.activityStatusText, { color: statusColor }]}>
                                  {activityStatusLabel(item.status)}
                                </Text>
                              </View>
                            </View>
                          </Animated.View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={[styles.emptyActivityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.emptyActivityIcon, { backgroundColor: colors.iconSurface }]}>
                  <Feather name="clock" size={21} color={colors.accent} />
                </View>
                <Text style={[styles.emptyActivityTitle, { color: colors.foreground }]}>
                  {activityFilter === "all" ? "Your history starts here" : "Nothing in this category yet"}
                </Text>
                <Text style={[styles.emptyActivityCopy, { color: colors.mutedForeground }]}>
                  {activityFilter === "all"
                    ? "Payments and subscription changes will appear here once recorded."
                    : "Try another filter or check back after your next account update."}
                </Text>
              </View>
            )}
            {paymentFlow === null && paymentId && paymentQuery.isError ? (
              <InlineError message="The latest payment status could not be checked." onRetry={() => void paymentQuery.refetch()} colors={colors} />
            ) : null}
          </>
        ) : null}

        {!paymentFlow && activeTab === "profile" ? (
          <>
            <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.profileIdentity}>
                <View style={[styles.profileAvatar, { backgroundColor: colors.iconSurface, borderColor: colors.border }]}>
                  <Feather name="user" size={22} color={colors.accent} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Anonymous Device</Text>
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                    {sessionReady ? "Secure · Private · Anonymous" : sessionMessage || "Establishing secure session"}
                  </Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: sessionReady ? colors.success : colors.accent }]} />
              </View>
            </View>
            <View style={[styles.profileMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                onPress={() => setActiveTab(hasActiveSubscription ? "activity" : "plans")}
                style={styles.profileMenuRow}
                accessibilityRole="button"
                testID="profile-subscription"
              >
                <Feather name="calendar" size={18} color={colors.mutedForeground} />
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Subscription</Text>
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {hasActiveSubscription && subscription
                      ? `${plans.find((plan) => plan.code === subscription.planCode)?.label ?? "Active plan"} · Expires ${formatDate(subscription.expiresAt)}`
                      : "No active subscription"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
              <View style={[styles.profileMenuDivider, { backgroundColor: colors.border }]} />
              <Pressable
                onPress={() => setActiveTab("activity")}
                style={styles.profileMenuRow}
                accessibilityRole="button"
                testID="profile-usage"
              >
                <Feather name="clock" size={18} color={colors.mutedForeground} />
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Usage Statistics</Text>
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>View your activity history</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
              <View style={[styles.profileMenuDivider, { backgroundColor: colors.border }]} />
              <Pressable
                onPress={() => void openSupport()}
                style={styles.profileMenuRow}
                accessibilityRole="button"
              >
                <Feather name="help-circle" size={18} color={colors.mutedForeground} />
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>Help & Support</Text>
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>Get assistance</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
              <View style={[styles.profileMenuDivider, { backgroundColor: colors.border }]} />
              <Pressable
                onPress={() => Alert.alert("About DAS VPN", "DAS VPN · Version 1.0.0")}
                style={styles.profileMenuRow}
                accessibilityRole="button"
              >
                <Feather name="info" size={18} color={colors.mutedForeground} />
                <View style={styles.flexOne}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>About DAS VPN</Text>
                  <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>Version 1.0.0</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Pressable
              onPress={openRecovery}
              style={[styles.recoveryButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={
                recoveryPinConfigured
                  ? "Recovery key protection. PIN is enabled. Tap to reveal your key."
                  : "Recovery key protection. Set a 4-digit PIN to protect your recovery key."
              }
              testID="profile-recovery"
            >
              <Feather name="lock" size={17} color={colors.foreground} />
              <View style={styles.flexOne}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>Recovery key protection</Text>
                <Text style={[styles.smallCopy, { color: colors.mutedForeground }]}>
                  {recoveryPinConfigured
                    ? "PIN protection is on · Tap to reveal your key"
                    : "Set a 4-digit PIN to protect your recovery key"}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
            {sessionMessage ? (
              <InlineError message={sessionMessage} onRetry={() => void startDeviceSession()} colors={colors} />
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.bottomNav,
          {
            backgroundColor: colors.navSurface,
            borderColor: colors.border,
            paddingBottom: Platform.OS === "web" ? 9 : Math.max(insets.bottom, 9),
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

      <Modal visible={showRecovery} transparent animationType="fade" onRequestClose={closeRecovery}>
        <View style={styles.modalScrim}>
          <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={styles.recoveryKeyboard}>
            <View style={[styles.recoverySheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.recoveryIcon, { backgroundColor: colors.iconSurface }]}>
                <Feather name={recoveryKey && recoveryStep !== "restore" ? "lock" : "key"} size={21} color={colors.accent} />
              </View>
              {recoveryKey && recoveryStep === "key" ? (
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
              ) : recoveryKey ? (
                <>
                  <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                    {recoveryStep === "setup"
                      ? "Create a 4-digit PIN"
                      : recoveryStep === "confirm"
                        ? "Confirm your PIN"
                        : "Unlock your recovery key"}
                  </Text>
                  <Text style={[styles.recoveryDescription, { color: colors.mutedForeground }]}>
                    {recoveryStep === "setup"
                      ? "Choose a PIN you can remember. You’ll enter it each time you reveal this key."
                      : recoveryStep === "confirm"
                        ? "Enter the same 4 digits once more to finish protecting your key."
                        : "Enter your 4-digit PIN to reveal the recovery key on this device."}
                  </Text>
                  <TextInput
                    value={recoveryPin}
                    onChangeText={(value) => {
                      setRecoveryPin(value.replace(/\D/g, "").slice(0, 4));
                      if (recoveryPinError) setRecoveryPinError("");
                    }}
                    placeholder="••••"
                    placeholderTextColor={colors.placeholder}
                    keyboardType="number-pad"
                    secureTextEntry
                    autoComplete="off"
                    maxLength={4}
                    returnKeyType="done"
                    onSubmitEditing={() => void submitRecoveryPin()}
                    style={[styles.recoveryPinInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    accessibilityLabel={
                      recoveryStep === "confirm"
                        ? "Confirm four digit recovery PIN"
                        : recoveryStep === "unlock"
                          ? "Enter recovery PIN"
                          : "Create four digit recovery PIN"
                    }
                    testID="recovery-pin-input"
                  />
                  {recoveryPinError ? (
                    <Text accessibilityLiveRegion="polite" style={[styles.formErrorText, { color: colors.destructive }]}>
                      {recoveryPinError}
                    </Text>
                  ) : null}
                  <Pressable
                    onPress={() => void submitRecoveryPin()}
                    disabled={recoveryPin.length !== 4}
                    style={[styles.primaryButton, { opacity: recoveryPin.length === 4 ? 1 : 0.55 }]}
                    accessibilityRole="button"
                    testID="recovery-pin-submit"
                  >
                    <LinearGradient colors={[colors.primary, colors.accent]} style={styles.primaryButtonGradient}>
                      <Text style={styles.primaryButtonText}>
                        {recoveryStep === "setup" ? "Continue" : recoveryStep === "confirm" ? "Set PIN" : "Unlock key"}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                  <Pressable onPress={closeRecovery} style={styles.dismissRecovery} accessibilityRole="button" testID="recovery-dismiss">
                    <Text style={[styles.quietButtonText, { color: colors.mutedForeground }]}>Close</Text>
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
                  <Pressable onPress={closeRecovery} style={styles.dismissRecovery} accessibilityRole="button" testID="recovery-dismiss">
                    <Text style={[styles.quietButtonText, { color: colors.mutedForeground }]}>Close</Text>
                  </Pressable>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: "100%" },
  scrollView: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, maxWidth: 620, width: "100%", alignSelf: "center" },
  webRefreshIndicator: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, overflow: "hidden" },
  topHalo: { position: "absolute", top: 0, left: 0, right: 0, height: 340 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 42, marginBottom: 13 },
  brand: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { height: 32, width: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  backButton: { width: 34, height: 38, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: "700", textAlign: "left", marginLeft: 3 },
  headerAction: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  compactHeader: { minHeight: 32, marginBottom: 8 },
  keyButton: { height: 37, width: 39, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroIntro: { marginTop: 2, marginBottom: 20 },
  eyebrow: { fontSize: 9, letterSpacing: 1.7, fontWeight: "700" },
  heroTitle: { fontSize: 31, lineHeight: 36, fontWeight: "700", letterSpacing: -0.9, marginTop: 9 },
  heroCopy: { fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 350 },
  screenIntro: { marginBottom: 14 },
  compactScreenIntro: { marginBottom: 10 },
  pageSubtitle: { fontSize: 11, lineHeight: 16, marginTop: -4 },
  pageTitle: { fontSize: 25, lineHeight: 32, fontWeight: "700", letterSpacing: -0.55, marginTop: 7 },
  connectionCard: { borderWidth: 1, borderRadius: 23, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 16, overflow: "hidden" },
  connectionMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 8, letterSpacing: 1.2, fontWeight: "700" },
  anonymousLabel: { fontSize: 7, letterSpacing: 0.9, fontWeight: "700" },
  orbArea: { height: 190, alignItems: "center", justifyContent: "center", marginTop: 0 },
  homeHeroIntro: { alignItems: "center", marginTop: 1, marginBottom: 1 },
  homeHeadline: { fontSize: 25, lineHeight: 30, fontWeight: "700", letterSpacing: -0.65, textAlign: "center" },
  homeStatusPill: { minHeight: 27, marginTop: 9, paddingHorizontal: 11, borderRadius: 15, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  homeStatusPillText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  homeOrbArea: { height: 190, alignItems: "center", justifyContent: "center", marginTop: 0, marginBottom: 0 },
  orbAura: { position: "absolute", height: 178, width: 178, borderRadius: 90 },
  orbPulseRing: { position: "absolute", height: 182, width: 182, borderRadius: 92, borderWidth: 1 },
  orbitTrackWide: { position: "absolute", top: 3, alignSelf: "center", width: 184, height: 184, borderRadius: 92, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "flex-start" },
  orbitDotWide: { width: 5, height: 5, borderRadius: 3, marginTop: -3 },
  orbitTrack: { position: "absolute", top: 18, alignSelf: "center", width: 154, height: 154, borderRadius: 80, borderWidth: 1, alignItems: "center", justifyContent: "flex-start" },
  orbitDot: { width: 8, height: 8, borderRadius: 4, marginTop: -4 },
  orbRingOuter: { width: 174, height: 174, borderRadius: 90, borderWidth: 2, alignItems: "center", justifyContent: "center", shadowOpacity: 0.4, shadowRadius: 24, elevation: 8 },
  orb: { height: 158, width: 158, borderRadius: 80, overflow: "hidden" },
  orbInner: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  orbLabel: { fontSize: 8, letterSpacing: 1.2, fontWeight: "700" },
  orbStateLabel: { fontSize: 13, letterSpacing: 0.8, fontWeight: "800" },
  centered: { textAlign: "center" },
  connectionTitle: { textAlign: "center", fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  connectionSubcopy: { textAlign: "center", fontSize: 10, marginTop: 5, lineHeight: 15 },
<<<<<<< HEAD
  homeStatusCardMotion: { width: "100%", marginBottom: 14, borderRadius: 15 },
  homeStatusCardActiveMotion: { shadowColor: "#14b879", shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  homeStatusCard: { width: "100%", minHeight: 63, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 10 },
  homeStatusCardActive: { minHeight: 77, paddingVertical: 10 },
  homeStatusCopy: { flex: 1, gap: 1, minWidth: 0 },
  subscriptionCountdownRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, marginTop: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  subscriptionCountdownDot: { width: 5, height: 5, borderRadius: 3 },
  subscriptionCountdownLabel: { fontSize: 8, lineHeight: 12, fontWeight: "700", letterSpacing: 0.45 },
  subscriptionCountdownValue: { fontSize: 10, lineHeight: 12, fontWeight: "800", letterSpacing: 0.25, fontVariant: ["tabular-nums"] },
=======
  homeStatusCard: { width: "100%", minHeight: 63, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  homeStatusCopy: { flex: 1, gap: 1 },
>>>>>>> 6adb9a8 (Update api server logic and regenerate client SDKs)
  homePlanButton: { minHeight: 28, paddingHorizontal: 12, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  homePlanButtonText: { color: "#ffffff", fontSize: 9, fontWeight: "700" },
  homePromoCard: { borderRadius: 17, overflow: "hidden", marginBottom: 17, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6 },
  homePromoGradient: { minHeight: 116, paddingHorizontal: 13, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  homePromoIcon: { height: 64, width: 64, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  homePromoCopy: { flex: 1, minWidth: 0 },
  homePromoBadge: { color: "#ffffff", fontSize: 7, lineHeight: 12, fontWeight: "800", letterSpacing: 0.8, opacity: 0.88 },
  homePromoTitle: { color: "#ffffff", fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 3 },
  homePromoPrice: { color: "#ffffff", fontSize: 21, lineHeight: 25, fontWeight: "800", letterSpacing: -0.4 },
  homePromoSubcopy: { color: "#f0ebff", fontSize: 8, lineHeight: 12, marginTop: 2 },
  homePromoArrow: { height: 32, width: 32, borderRadius: 16, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  homePlansHeading: { marginBottom: 9 },
  homePopularGrid: { flexDirection: "row", gap: 8, marginBottom: 14 },
  homePopularAnimatedCard: { flex: 1, minWidth: 0 },
  homePopularCard: { flex: 1, minWidth: 0, minHeight: 75, borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 8 },
  homePopularIcon: { height: 38, width: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  homePopularCopy: { flex: 1, minWidth: 0 },
  homePopularDays: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  homePopularPrice: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  homePlansLoading: { minHeight: 75, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  homePlansEmpty: { minHeight: 60, borderWidth: 1, borderRadius: 14, marginBottom: 14, paddingHorizontal: 13, justifyContent: "center" },
  homeSupportCard: { minHeight: 65, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 9 },
  homeSupportIcon: { height: 39, width: 39, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  homeSupportAction: { fontSize: 10, fontWeight: "700" },
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
  privacyFootnote: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 20, paddingHorizontal: 3 },
  privacyCopy: { flex: 1, fontSize: 9, lineHeight: 14 },
  planList: { gap: 8 },
  planCard: { minHeight: 64, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  planCardSelected: { shadowColor: "#245bff", shadowOpacity: 0.45, shadowRadius: 11, elevation: 7 },
  planCopy: { flex: 1 },
  planNameLine: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  planName: { fontSize: 11, fontWeight: "600" },
  planBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  planBadgeText: { fontSize: 7, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  planPrice: { fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  planDuration: { fontSize: 8, lineHeight: 12, marginTop: 1 },
  radioOuter: { width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 8, height: 8, borderRadius: 5 },
  secureNote: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 15 },
  primaryButton: { borderRadius: 13, overflow: "hidden", minHeight: 44 },
  primaryButtonGradient: { minHeight: 44, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  plansContinue: { minHeight: 30, marginTop: 11, borderRadius: 11 },
  plansContinueGradient: { minHeight: 30, paddingHorizontal: 17 },
  primaryButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "700", letterSpacing: 0.1 },
  skeletonGroup: { gap: 9 },
  planSkeleton: { height: 75, borderWidth: 1, borderRadius: 14, padding: 13, justifyContent: "center", gap: 8 },
  skeletonLine: { height: 8, borderRadius: 6 },
  emptyPanel: { minHeight: 190, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 22, gap: 9 },
  linkButton: { padding: 9 },
  paymentPlanCard: { minHeight: 83, marginHorizontal: 4, flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderRadius: 15, padding: 13 },
  paymentPrice: { fontSize: 13, fontWeight: "700", marginTop: 3, marginBottom: 2 },
  paymentForm: { marginTop: 21 },
  inputTitle: { fontSize: 15, fontWeight: "700", marginBottom: 5 },
  phoneField: { height: 40, marginHorizontal: 4, borderRadius: 12, borderWidth: 1, marginTop: 26, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  keBadge: { width: 26, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  keText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.4 },
  countryPrefix: { fontSize: 12, fontWeight: "600" },
  phoneInput: { flex: 1, fontSize: 13, height: "100%", letterSpacing: 0.3 },
  formError: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, marginTop: 10 },
  formErrorText: { fontSize: 10, lineHeight: 15, flex: 1 },
  sessionNotice: { borderWidth: 1, borderRadius: 12, padding: 11, marginTop: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  mpesaButton: { minHeight: 36, marginHorizontal: 4, backgroundColor: "#00c77a", borderRadius: 12, marginTop: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  mpesaButtonText: { fontSize: 12, color: "#ffffff", fontWeight: "700" },
  mpesaInfo: { marginHorizontal: 4, marginTop: 25, borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 11 },
  mpesaMark: { width: 59, height: 37, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  mpesaMarkText: { fontWeight: "800", fontSize: 11, letterSpacing: -0.3 },
  mpesaProvider: { marginBottom: 4 },
  processingScreen: { alignItems: "center", paddingTop: 3 },
  phoneIllustration: { height: 101, width: 150, alignItems: "center", justifyContent: "center", marginBottom: 5 },
  phoneAura: { position: "absolute", height: 92, width: 124, borderRadius: 62 },
  phoneOutline: { height: 91, width: 55, borderWidth: 2, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#0c1632" },
  phoneNotch: { position: "absolute", top: 4, width: 22, height: 4, borderRadius: 2 },
  phoneSpinner: { width: 24, height: 24, borderWidth: 2, borderRadius: 12, borderTopColor: "transparent" },
  sparkleLeft: { position: "absolute", left: 19, top: 41 },
  sparkleRight: { position: "absolute", right: 20, top: 48 },
  processingTitle: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  processingSubtitle: { fontSize: 10, lineHeight: 15, textAlign: "center", maxWidth: 310, marginTop: 5, marginBottom: 34 },
  stepsCard: { width: "100%", borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 8 },
  stepRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 11, position: "relative" },
  stepIcon: { width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", zIndex: 1 },
  stepRule: { position: "absolute", left: 12, top: 35, width: 1, height: 13 },
  stepTitle: { fontSize: 11, fontWeight: "600", marginBottom: 2 },
  timeoutNotice: { borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 12, flexDirection: "row", gap: 9, alignItems: "center" },
  quietButton: { minHeight: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  quietButtonText: { fontSize: 11, fontWeight: "600" },
  successScreen: { alignItems: "center", paddingTop: 2 },
  successBurst: { height: 104, width: 180, alignItems: "center", justifyContent: "center", marginBottom: 1, position: "relative" },
  successHalo: { position: "absolute", height: 88, width: 88, borderRadius: 50, opacity: 0.45 },
  successOrb: { width: 67, height: 67, borderRadius: 36, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  successSpark: { position: "absolute", width: 5, height: 5, borderRadius: 3 },
  sparkOne: { top: 23, left: 36 },
  sparkTwo: { right: 34, top: 31 },
  sparkThree: { left: 48, bottom: 18 },
  successTitle: { fontSize: 18, fontWeight: "700", letterSpacing: -0.4, textAlign: "center" },
  successSubtitle: { fontSize: 10, marginTop: 4, marginBottom: 14, textAlign: "center" },
  successPlanCard: { width: "100%", marginBottom: 11 },
  successInfo: { width: "100%", borderRadius: 14, borderWidth: 1, padding: 13, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 15 },
  successConnectionCard: { width: "100%", borderRadius: 14, overflow: "hidden", marginBottom: 15 },
  successConnectionGradient: { minHeight: 82, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  successConnectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  issueScreen: { alignItems: "center", paddingTop: 38 },
  issueIcon: { height: 66, width: 66, borderRadius: 34, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  issueActions: { width: "100%", marginTop: 15 },
  activityCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 12 },
  activityTitle: { fontSize: 13, fontWeight: "700", marginTop: 14, marginBottom: 4 },
  pendingBanner: { flexDirection: "row", gap: 10, alignItems: "center", borderRadius: 11, padding: 11, marginTop: 13 },
  emptySubscription: { marginTop: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  activityList: { marginTop: 9 },
  activityItem: { borderTopWidth: 1, paddingTop: 12, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  activityIntro: { marginTop: 4, marginBottom: 16 },
  activityEyebrow: { fontSize: 9, letterSpacing: 1.4, fontWeight: "700" },
  activityHeading: { fontSize: 26, lineHeight: 31, fontWeight: "700", letterSpacing: -0.7, marginTop: 5 },
  activitySubtitle: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  activitySummaryGrid: { flexDirection: "row", gap: 10, marginBottom: 18 },
  activitySummaryCard: { flex: 1, minHeight: 112, borderWidth: 1, borderRadius: 17, padding: 12 },
  activitySummaryHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  activitySummaryLabel: { fontSize: 8, fontWeight: "700", letterSpacing: 0.8 },
  activitySummaryValue: { fontSize: 24, lineHeight: 29, fontWeight: "700", marginTop: 9 },
  activitySummaryCopy: { fontSize: 9, lineHeight: 13, marginTop: 1 },
  activityFilters: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  activityFilter: { minHeight: 35, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  activityFilterText: { fontSize: 10, fontWeight: "600" },
  activityGroups: { gap: 18 },
  activityDayHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 2 },
  activityDayTitle: { fontSize: 14, fontWeight: "700" },
  activityDayCount: { fontSize: 9, fontWeight: "500" },
  activityFeed: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  activityFeedRow: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 10 },
  activityEventIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  activityEventCopy: { flex: 1, minWidth: 0 },
  activityEventTitle: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  activityEventDescription: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  activityMeta: { width: 72, alignItems: "flex-end", gap: 5 },
  activityTime: { fontSize: 9, lineHeight: 12, textAlign: "right" },
  activityStatusBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  activityStatusText: { fontSize: 8, fontWeight: "700" },
  statusTag: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 },
  statusTagText: { fontSize: 8, fontWeight: "700" },
  activitySkeleton: { height: 70, borderRadius: 12, marginTop: 8 },
  emptyActivityCard: { borderWidth: 1, borderRadius: 18, minHeight: 200, alignItems: "center", justifyContent: "center", padding: 24, gap: 9 },
  emptyActivityIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyActivityTitle: { fontSize: 13, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  emptyActivityCopy: { fontSize: 10, lineHeight: 15, textAlign: "center", maxWidth: 270 },
  errorPanel: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  errorTitle: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  profileCard: { borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 11 },
  profileIdentity: { flexDirection: "row", alignItems: "center", gap: 11 },
  profileAvatar: { height: 46, width: 46, borderRadius: 23, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  profileDivider: { height: 1, marginVertical: 14 },
  profileAction: { borderWidth: 1, borderRadius: 15, padding: 12, minHeight: 63, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 11 },
  profileMenu: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, marginBottom: 14 },
  profileMenuRow: { minHeight: 59, flexDirection: "row", alignItems: "center", gap: 11 },
  profileMenuDivider: { height: 1, marginLeft: 29 },
  recoveryButton: { minHeight: 60, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, gap: 11 },
  bottomNav: { minHeight: 60, borderTopWidth: 1, paddingTop: 7, flexDirection: "row", justifyContent: "space-around", alignItems: "flex-start" },
  navButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 45 },
  navIconActive: { width: 34, height: 24, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  navLabel: { fontSize: 8, fontWeight: "600" },
  modalScrim: { flex: 1, backgroundColor: "rgba(2, 6, 18, 0.82)", justifyContent: "center", padding: 21 },
  recoveryKeyboard: { flex: 1, justifyContent: "center" },
  recoverySheet: { borderWidth: 1, borderRadius: 22, padding: 20, width: "100%", maxWidth: 440, alignSelf: "center" },
  recoveryIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  sheetTitle: { fontSize: 19, fontWeight: "700", marginBottom: 8 },
  recoveryDescription: { fontSize: 11, lineHeight: 17, marginBottom: 15 },
  recoveryCode: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 10, lineHeight: 20, letterSpacing: 0.5, marginBottom: 14, fontWeight: "600" },
  recoveryInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, minHeight: 48, fontSize: 12, marginBottom: 11 },
  recoveryPinInput: { borderWidth: 1, borderRadius: 12, minHeight: 58, paddingHorizontal: 15, textAlign: "center", fontSize: 22, letterSpacing: 10, fontWeight: "700", marginBottom: 11 },
  dismissRecovery: { alignItems: "center", padding: 12 },
});
