import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { View } from "react-native";

// ===== 「カードが重なった」見た目を、四角2枚＋星マークで表現する、自作アイコン =====
export default function CardsIcon({ size = 20, color = "#333" }: { size?: number; color?: string }) {
  const squareSize = size * 0.7;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: squareSize,
          height: squareSize,
          borderRadius: 3,
          borderWidth: 1.5,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: squareSize,
          height: squareSize,
          borderRadius: 3,
          borderWidth: 1.5,
          borderColor: color,
          backgroundColor: "#fff",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <MaterialIcons name="star-border" size={squareSize * 0.6} color={color} />
      </View>
    </View>
  );
}