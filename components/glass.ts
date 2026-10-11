// ===== ここからWeb版専用：リキッドグラス風の見た目を、全画面で共通にするための部品 =====
import { Platform } from "react-native";

export const isWeb = Platform.OS === "web";

// Web版ならa、それ以外（スマホ）ならbを返す
export const pick = <T,>(a: T, b: T): T => (isWeb ? a : b);

// 画面全体の、暗いオーロラ風の背景（Web版のみ）
export const webScreenBackground: any = isWeb
  ? {
      backgroundColor: "#05060d",
      backgroundImage:
        "radial-gradient(ellipse 60% 45% at 18% 10%, rgba(70,95,190,0.5), transparent 70%), radial-gradient(ellipse 55% 45% at 85% 80%, rgba(110,70,190,0.35), transparent 70%), linear-gradient(160deg, #05060d 0%, #0a0d1c 55%, #080915 100%)",
    }
  : {};

// ガラスの箱（カード・メニュー・入力欄など）
export const webGlassBox: any = isWeb
  ? {
      backgroundColor: "rgba(24,26,44,0.55)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
      backdropFilter: "blur(24px) saturate(180%)",
      boxShadow: "0 12px 28px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)",
    }
  : {};

// 選択中・押されているものの、少し浮き上がったガラス
export const webSelected: any = isWeb
  ? {
      backgroundColor: "rgba(255,255,255,0.16)",
      boxShadow:
        "0 3px 10px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -1px 2px rgba(0,0,0,0.15)",
    }
  : {};

// 薄いガラスのボタン（枠つき）
export const webSoftButton: any = isWeb
  ? {
      backgroundColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    }
  : {};

// 文字・アイコンの色（Web版は暗い背景用）
export const textMain = pick("#ffffff", "#222");
export const textSub = pick("rgba(255,255,255,0.6)", "#666");
export const textFaint = pick("rgba(255,255,255,0.4)", "#999");
export const accentColor = pick("#9db4ff", "#4a90e2");
export const dangerColor = pick("#ff7a7a", "#e74c3c");
// ===== ここまでWeb版専用 =====