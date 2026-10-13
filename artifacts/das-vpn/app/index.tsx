import { useCallback, useEffect, useMemo, useState } from "react";
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
import * as SecureStore from "expo-secure-store";
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
  useGetVpnServers,
  useGetVpnStatus,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const plans = [
  { code: "three_days", name: "3 Days", days: 3, price: 80 },
  { code: "weekly", name: "Weekly", days: 7, price: 120 },
  { code: "monthly", name: "Monthly", days: 30, price: 350, popular: true },
  { code: "three_months", name: "3 Months", days: 90, price: 999 },
  { code: "yearly", name: "Yearly", days: 365, price: 2300 },
] as const;

type PlanCode = (typeof plans)[number]["code"];
const TOKEN_KEY = "das.vpn.device-token";
const RECOVERY_KEY = "das.vpn.recovery-key";
const RECOVERY_SEEN_KEY = "das.vpn.recovery-viewed";
const NATIVE_WIREGUARD_CLIENT_AVAILABLE = false;

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
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanCode>("monthly");
  const [selectedServerId, setSelectedServerId] = useState("");
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
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      const storedRecovery = await SecureStore.getItemAsync(RECOVERY_KEY);
      const isNewSession = !storedToken || !storedRecovery;
      let token: string;
      let recovery: string;
      if (storedToken && storedRecovery) {
        token = storedToken;
        recovery = storedRecovery;
      } else {
        token = await randomHex(32);
        recovery = await randomHex(32);
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        await SecureStore.setItemAsync(RECOVERY_KEY, recovery);
      }
      setRecoveryKey(recovery);
      if (isNewSession && (await SecureStore.getItemAsync(RECOVERY_SEEN_KEY)) !== "yes") {
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
  const serversQuery = useGetVpnServers({
    query: { queryKey: ["vpn", "servers"], enabled: sessionReady, staleTime: 30_000 },
  });
  const paymentQuery = useGetVpnPayment(paymentId, {
    query: {
      queryKey: ["vpn", "payment", paymentId],
      enabled: sessionReady && paymentId.length > 0,
      refetchInterval: paymentId.length > 0 ? 3000 : false,
    },
  });

  const servers = serversQuery.data?.servers ?? [];
  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId),
    [servers, selectedServerId],
  );
  const subscription = statusQuery.data?.subscription;
  const hasActiveSubscription = Boolean(
    subscription?.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now(),
  );
  const nativeSupported =
    NATIVE_WIREGUARD_CLIENT_AVAILABLE && statusQuery.data?.nativeTunnel.supported === true;
  const nativeConnected =
    nativeSupported && statusQuery.data?.nativeTunnel.connected === true;
  const canConnect = hasActiveSubscription && nativeSupported && Boolean(selectedServer);
  const currentPlan = plans.find((plan) => plan.code === selectedPlan) ?? plans[2];
  const latestPayment = paymentQuery.data ?? statusQuery.data?.latestPayment;

  const finishRecoveryNotice = async () => {
    await SecureStore.setItemAsync(RECOVERY_SEEN_KEY, "yes");
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
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await SecureStore.setItemAsync(RECOVERY_KEY, nextRecovery);
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

  const statusLabel = nativeConnected ? "Protected" : "Not connected";
  const connectReason = !hasActiveSubscription
    ? "Choose a plan to unlock access"
    : servers.length === 0
    ? "No WireGuard servers are deployed"
    : !nativeSupported
    ? "Native WireGuard client is not part of this build"
    : "Choose a server to connect";

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.background, colors.backgroundGlow, colors.background]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
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
        </View>

        <View style={styles.greeting}>
          <Text style={[styles.kicker, { color: colors.primary }]}>YOUR CONNECTION</Text>
          <Text style={[styles.headline, { color: colors.foreground }]}>
            Your privacy,{ "\n" }on your terms.
          </Text>
          <Text style={[styles.subheadline, { color: colors.mutedForeground }]}>
            No account. No recurring charges. Just private access when you need it.
          </Text>
        </View>

        <View style={[styles.connectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardTopline}>
            <View style={styles.liveLabel}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: nativeConnected ? colors.primary : colors.mutedForeground },
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
                { backgroundColor: nativeConnected ? colors.primary : colors.accent },
                auraStyle,
              ]}
            />
            <LinearGradient
              colors={nativeConnected ? [colors.primary, colors.accent] : [colors.card, colors.secondary]}
              style={[styles.connectOrb, { borderColor: colors.border }]}
            >
              <Feather
                name={nativeConnected ? "check" : "shield"}
                size={36}
                color={nativeConnected ? colors.primaryForeground : colors.mutedForeground}
              />
            </LinearGradient>
          </View>

          <Text style={[styles.connectionTitle, { color: colors.foreground }]}>
            {nativeConnected ? "You're protected" : "Not connected"}
          </Text>
          <Text style={[styles.connectionDescription, { color: colors.mutedForeground }]}>
            {nativeConnected
              ? `Connected to ${selectedServer?.name ?? "a verified server"}`
              : connectReason}
          </Text>

          <View style={styles.connectActions}>
            <Pressable
              disabled={!canConnect}
              onPress={() => undefined}
              style={({ pressed }) => [
                styles.connectButton,
                { backgroundColor: canConnect ? colors.primary : colors.secondary },
                pressed && canConnect ? styles.pressed : null,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConnect }}
              testID="vpn-connect"
            >
              <Feather name="power" size={18} color={canConnect ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.connectButtonText, { color: canConnect ? colors.primaryForeground : colors.mutedForeground }]}>
                {nativeConnected ? "Connected" : "Connect"}
              </Text>
            </Pressable>
            <Pressable
              disabled={!nativeConnected}
              onPress={() => undefined}
              style={[
                styles.disconnectButton,
                { borderColor: colors.border, opacity: nativeConnected ? 1 : 0.45 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !nativeConnected }}
              testID="vpn-disconnect"
            >
              <Feather name="square" size={16} color={colors.foreground} />
              <Text style={[styles.disconnectButtonText, { color: colors.foreground }]}>Disconnect</Text>
            </Pressable>
          </View>

          <View style={[styles.metrics, { borderTopColor: colors.border }]}>
            <Metric label="DURATION" value="—" colors={colors} />
            <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
            <Metric label="DATA USED" value="—" colors={colors} />
          </View>
          {!nativeSupported ? (
            <Text style={[styles.metricNote, { color: colors.mutedForeground }]}>
              Usage and connection status appear only when a real WireGuard tunnel is available.
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Choose your location</Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
              Only deployed servers are shown
            </Text>
          </View>
          <Feather name="globe" size={18} color={colors.accent} />
        </View>
        {servers.length > 0 ? (
          <View style={styles.serverList}>
            {servers.map((server) => {
              const selected = server.id === selectedServerId;
              return (
                <Pressable
                  key={server.id}
                  onPress={() => setSelectedServerId(server.id)}
                  style={[
                    styles.serverRow,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.secondary : colors.card,
                    },
                  ]}
                  testID={`server-${server.id}`}
                >
                  <CountryFlag countryCode={server.countryCode} muted={colors.mutedForeground} />
                  <View style={styles.serverText}>
                    <Text style={[styles.serverName, { color: colors.foreground }]}>{server.city}</Text>
                    <Text style={[styles.serverCountry, { color: colors.mutedForeground }]}>
                      {server.country} · {server.name}
                    </Text>
                  </View>
                  {selected ? <Feather name="check-circle" size={19} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={[styles.emptyServer, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Feather name={serversQuery.isLoading ? "loader" : "map-pin"} size={18} color={colors.mutedForeground} />
            </View>
            <View style={styles.serverText}>
              <Text style={[styles.serverName, { color: colors.foreground }]}>
                {serversQuery.isLoading ? "Checking available locations" : "No server locations yet"}
              </Text>
              <Text style={[styles.serverCountry, { color: colors.mutedForeground }]}>
                {serversQuery.isLoading
                  ? "Looking up the live server list"
                  : "WireGuard servers must be deployed before a location can be selected."}
              </Text>
            </View>
            {serversQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
        )}

        <View style={styles.sectionHeading}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Plans for real life</Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
              One-time payment · access begins after verification
            </Text>
          </View>
        </View>

        <View style={styles.planGrid}>
          {plans.map((plan) => {
            const active = subscription?.planCode === plan.code;
            return (
              <Pressable
                key={plan.code}
                onPress={() => {
                  setSelectedPlan(plan.code);
                  setPaymentError("");
                  setPaymentNotice("");
                  setPaymentOpen(true);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => [
                  styles.planCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${plan.name} plan, ${plan.price} Kenyan shillings`}
                testID={`plan-${plan.code}`}
              >
                {"popular" in plan && plan.popular ? (
                  <View style={[styles.popularTag, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.popularTagText, { color: colors.background }]}>MOST POPULAR</Text>
                  </View>
                ) : null}
                <Text style={[styles.planName, { color: colors.mutedForeground }]}>{plan.name}</Text>
                <Text style={[styles.planPrice, { color: colors.foreground }]}>
                  <Text style={[styles.planCurrency, { color: colors.mutedForeground }]}>KES </Text>
                  {plan.price.toLocaleString("en-KE")}
                </Text>
                <Text style={[styles.planDays, { color: colors.mutedForeground }]}>
                  {plan.days} days · no auto-renewal
                </Text>
                {active ? (
                  <Text style={[styles.activePlanTag, { color: colors.primary }]}>CURRENT PLAN</Text>
                ) : null}
              </Pressable>
            );
          })}
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

        {latestPayment ? (
          <View style={[styles.noticeCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather
              name={latestPayment.status === "paid" ? "check-circle" : latestPayment.status === "pending" ? "clock" : "alert-circle"}
              size={17}
              color={latestPayment.status === "paid" ? colors.primary : colors.accent}
            />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
              {latestPayment.status === "pending"
                ? "Waiting for Safaricom to verify your payment. Access stays locked until confirmation."
                : latestPayment.status === "paid"
                ? `${getPlanName(latestPayment.planCode)} payment verified by Safaricom.`
                : latestPayment.status === "cancelled"
                ? "The payment was cancelled. No subscription was activated."
                : latestPayment.status === "failed"
                ? "Payment was not verified. No subscription was activated."
                : paymentNotice}
            </Text>
          </View>
        ) : paymentNotice ? (
          <View style={[styles.noticeCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="info" size={17} color={colors.accent} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>{paymentNotice}</Text>
          </View>
        ) : null}

        {sessionMessage || statusQuery.isError || serversQuery.isError ? (
          <View style={[styles.errorCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="wifi-off" size={17} color={colors.destructive} />
            <View style={styles.serverText}>
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>Secure service unavailable</Text>
              <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                {sessionMessage || "Your access cannot be confirmed right now. Payments and connections are paused."}
              </Text>
            </View>
            <Pressable onPress={() => void startDeviceSession()} accessibilityRole="button" testID="retry-session">
              <Feather name="refresh-cw" size={17} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}

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
      </ScrollView>

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
                  Safaricom will send a secure PIN prompt to your phone.
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
                    Request STK Push
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

function Metric({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 67, paddingBottom: 48, maxWidth: 620, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 34 },
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
  orbWrap: { height: 150, alignItems: "center", justifyContent: "center", marginTop: 1 },
  orbGlow: { position: "absolute", width: 106, height: 106, borderRadius: 54, opacity: 0.5 },
  connectOrb: { width: 96, height: 96, borderRadius: 49, borderWidth: 1, alignItems: "center", justifyContent: "center", elevation: 8 },
  connectionTitle: { textAlign: "center", fontSize: 21, fontFamily: "Inter_700Bold", letterSpacing: -0.35 },
  connectionDescription: { textAlign: "center", fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 6 },
  connectActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  connectButton: { flex: 1, minHeight: 48, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  connectButtonText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  disconnectButton: { minHeight: 48, minWidth: 120, borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  disconnectButtonText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  metrics: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, marginTop: 17, paddingTop: 14 },
  metric: { flex: 1, alignItems: "center" },
  metricLabel: { fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 1.1 },
  metricValue: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 5 },
  metricDivider: { width: 1, height: 27 },
  metricNote: { textAlign: "center", fontSize: 9, lineHeight: 14, fontFamily: "Inter_400Regular", marginTop: 11 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  sectionCaption: { marginTop: 4, fontSize: 10, fontFamily: "Inter_400Regular" },
  emptyServer: { minHeight: 72, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  emptyIcon: { height: 38, width: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  serverList: { gap: 8 },
  serverRow: { minHeight: 66, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  serverText: { flex: 1, gap: 3 },
  serverName: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  serverCountry: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular" },
  flagFallback: { width: 34, height: 24, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  flagFallbackText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  planGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  planCard: { width: "48.5%", minHeight: 100, borderWidth: 1, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 13, justifyContent: "center", position: "relative", overflow: "hidden" },
  popularTag: { position: "absolute", top: 0, right: 0, borderBottomLeftRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  popularTagText: { fontSize: 7, fontFamily: "Inter_700Bold", letterSpacing: 0.6 },
  planName: { fontSize: 10, fontFamily: "Inter_600SemiBold", marginBottom: 7 },
  planPrice: { fontSize: 21, fontFamily: "Inter_700Bold", letterSpacing: -0.7 },
  planCurrency: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0 },
  planDays: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 4 },
  activePlanTag: { marginTop: 7, fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.7 },
  expiryCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 13, marginTop: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  expiryTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  expiryText: { marginTop: 3, fontSize: 9, fontFamily: "Inter_400Regular" },
  noticeCard: { borderWidth: 1, borderRadius: 15, padding: 12, marginTop: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  noticeText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular" },
  errorCard: { borderWidth: 1, borderRadius: 15, padding: 12, marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  errorTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  errorText: { marginTop: 3, fontSize: 9, lineHeight: 14, fontFamily: "Inter_400Regular" },
  footer: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 16, paddingHorizontal: 2 },
  footerText: { flex: 1, fontSize: 9, lineHeight: 14, fontFamily: "Inter_400Regular" },
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
