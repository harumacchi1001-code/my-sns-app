import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../firebaseConfig";
const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
export default function CallScreen() {
  const router = useRouter();
  const { id: chatId, mode, otherEmail } = useLocalSearchParams<{
    id: string;
    mode: "video" | "audio";
    otherEmail: string;
  }>();
  const isVideoCall = mode === "video";
  const [status, setStatus] = useState<"connecting" | "connected" | "ended">("connecting");
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(isVideoCall);
  const localVideoRef = useRef<any>(null);
  const remoteVideoRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const myEmail = auth.currentUser?.email;
  useEffect(() => {
    if (Platform.OS !== "web" || !chatId || !myEmail) return;
    let unsubscribeCallDoc: (() => void) | null = null;
    let unsubscribeOfferCandidates: (() => void) | null = null;
    let unsubscribeAnswerCandidates: (() => void) | null = null;
    const setup = async () => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      // ===== 自分の、カメラ・マイクの、映像・音声を取得 =====
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: isVideoCall,
        audio: true,
      });
      localStreamRef.current = localStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
      // ===== 相手の、映像・音声が、届いたら、表示する =====
      const remoteStream = new MediaStream();
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
      };
      const callDocRef = doc(db, "calls", chatId);
      const callSnap = await getDoc(callDocRef);
      const isCaller = !callSnap.exists();
      if (isCaller) {
        // ===== 発信者：オファーを作成し、Firestoreに書き込む =====
        const offerCandidatesRef = collection(db, "calls", chatId, "offerCandidates");
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            addDoc(offerCandidatesRef, event.candidate.toJSON());
          }
        };
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);
        await setDoc(callDocRef, {
          callerEmail: myEmail,
          calleeEmail: otherEmail,
          mode: mode || "video",
          status: "ringing",
          offer: { sdp: offerDescription.sdp, type: offerDescription.type },
        });
        // ===== 相手が、応答（answer）を、書き込んだら、それを、受け取る =====
        unsubscribeCallDoc = onSnapshot(callDocRef, (snap) => {
          const data = snap.data();
          if (!data) return;
          if (data.status === "ended") {
            setStatus("ended");
            return;
          }
          if (data.answer && !pc.currentRemoteDescription) {
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription);
            setStatus("connected");
          }
        });
        // ===== 相手の、ICE候補（接続経路の候補）を、受け取る =====
        const answerCandidatesRef = collection(db, "calls", chatId, "answerCandidates");
        unsubscribeAnswerCandidates = onSnapshot(answerCandidatesRef, (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === "added") {
              pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            }
          });
        });
      } else {
        // ===== 受信者：すでにある、オファーに、対して、応答（answer）を作る =====
        const data = callSnap.data();
        const answerCandidatesRef = collection(db, "calls", chatId, "answerCandidates");
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            addDoc(answerCandidatesRef, event.candidate.toJSON());
          }
        };
        const offerDescription = data.offer;
        await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);
        await updateDoc(callDocRef, {
          answer: { sdp: answerDescription.sdp, type: answerDescription.type },
          status: "connected",
        });
        setStatus("connected");
        // ===== 発信者の、ICE候補（接続経路の候補）を、受け取る =====
        const offerCandidatesRef = collection(db, "calls", chatId, "offerCandidates");
        unsubscribeOfferCandidates = onSnapshot(offerCandidatesRef, (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === "added") {
              pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            }
          });
        });
        // ===== 通話が、終了したことを検知する =====
        unsubscribeCallDoc = onSnapshot(callDocRef, (snap) => {
          const d = snap.data();
          if (d?.status === "ended") {
            setStatus("ended");
          }
        });
      }
    };
    setup();
    return () => {
      unsubscribeCallDoc?.();
      unsubscribeOfferCandidates?.();
      unsubscribeAnswerCandidates?.();
    };
  }, [chatId]);
  // ===== 通話が、終了したら、後片付けして、チャット画面に、戻る =====
  useEffect(() => {
    if (status !== "ended") return;
    cleanupAndClose();
  }, [status]);
  const cleanupAndClose = async () => {
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    router.back();
  };
  const handleHangUp = async () => {
    if (chatId) {
      const callDocRef = doc(db, "calls", chatId);
      await updateDoc(callDocRef, { status: "ended" }).catch(() => {});
      // ===== 後片付け：ICE候補の、サブコレクションも、削除する =====
      const offerCandidatesSnap = await getDocs(collection(db, "calls", chatId, "offerCandidates"));
      await Promise.all(offerCandidatesSnap.docs.map((d) => deleteDoc(d.ref)));
      const answerCandidatesSnap = await getDocs(collection(db, "calls", chatId, "answerCandidates"));
      await Promise.all(answerCandidatesSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(callDocRef).catch(() => {});
    }
    cleanupAndClose();
  };
  const toggleMic = () => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setMicOn((prev) => !prev);
  };
  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setCameraOn((prev) => !prev);
  };
  if (Platform.OS !== "web") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.statusText}>この、機能は、Web版でのみ、ご利用いただけます</Text>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.videoArea}>
        {isVideoCall ? (
          <>
            {/* ===== 相手の、映像（大きく、表示） ===== */}
            <video ref={remoteVideoRef} autoPlay playsInline style={styles.remoteVideo as any} />
            {/* ===== 自分の、映像（小さく、右下に、表示） ===== */}
            <video ref={localVideoRef} autoPlay playsInline muted style={styles.localVideo as any} />
          </>
        ) : (
          <View style={styles.audioCallInfo}>
            <MaterialIcons name="call" size={64} color="#fff" />
            <Text style={styles.audioCallText}>{otherEmail}</Text>
            <Text style={styles.statusText}>
              {status === "connecting" ? "接続中..." : status === "connected" ? "通話中" : "通話、終了"}
            </Text>
          </View>
        )}
        {isVideoCall && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {status === "connecting" ? "接続中..." : status === "connected" ? "通話中" : "通話、終了"}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.controlButton} onPress={toggleMic}>
          <MaterialIcons name={micOn ? "mic" : "mic-off"} size={26} color="#fff" />
        </TouchableOpacity>
        {isVideoCall && (
          <TouchableOpacity style={styles.controlButton} onPress={toggleCamera}>
            <MaterialIcons name={cameraOn ? "videocam" : "videocam-off"} size={26} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.hangUpButton} onPress={handleHangUp}>
          <MaterialIcons name="call-end" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  videoArea: {
    flex: 1,
    position: "relative",
    backgroundColor: "#000",
  },
  remoteVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  localVideo: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 110,
    height: 150,
    borderRadius: 12,
    objectFit: "cover",
    borderWidth: 2,
    borderColor: "#fff",
  },
  audioCallInfo: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
  },
  audioCallText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
  },
  statusText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    textAlign: "center",
  },
  statusBadge: {
    position: "absolute",
    top: 16,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  statusBadgeText: {
    color: "#fff",
    fontSize: 13,
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    paddingVertical: 24,
    backgroundColor: "#111",
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  hangUpButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#e74c3c",
    justifyContent: "center",
    alignItems: "center",
  },
});