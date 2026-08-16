import Svg, { ClipPath, Defs, LinearGradient, Path, Stop, Image as SvgImage } from "react-native-svg";

type Props = {
  size?: number;
  imageUri?: string | null;
  placeholderColor?: string;
  borderColor?: string;
  gradientColors?: [string, string];
  notchesPerSide?: number;
  notchRadius?: number;
  frameThickness?: number;
};

// 四角形の縁に、必ず「内側」へ凹む、丸みのあるミシン目を、一定間隔で並べたパスを作る
// （二次ベジェ曲線を使うことで、辺の向きに関わらず、確実に内側へ凹ませる）
function buildStampPath(
  w: number,
  h: number,
  inset: number,
  notchesPerSide: number,
  notchRadius: number
) {
  const parts: string[] = [];
  const cx = w / 2;
  const cy = h / 2;
  const left = inset;
  const top = inset;
  const right = w - inset;
  const bottom = h - inset;

  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = (x2 - x1) / notchesPerSide;
    const dy = (y2 - y1) / notchesPerSide;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;

    const midEdgeX = (x1 + x2) / 2;
    const midEdgeY = (y1 + y2) / 2;
    const nAx = -uy;
    const nAy = ux;
    const towardCenterX = cx - midEdgeX;
    const towardCenterY = cy - midEdgeY;
    const dot = nAx * towardCenterX + nAy * towardCenterY;
    const inwardX = dot > 0 ? nAx : -nAx;
    const inwardY = dot > 0 ? nAy : -nAy;

    for (let i = 0; i < notchesPerSide; i++) {
      const midX = x1 + dx * (i + 0.5);
      const midY = y1 + dy * (i + 0.5);
      const nStartX = midX - ux * notchRadius;
      const nStartY = midY - uy * notchRadius;
      const nEndX = midX + ux * notchRadius;
      const nEndY = midY + uy * notchRadius;
      const bulgeX = midX + inwardX * notchRadius * 1.4;
      const bulgeY = midY + inwardY * notchRadius * 1.4;

      parts.push(`L ${nStartX} ${nStartY}`);
      parts.push(`Q ${bulgeX} ${bulgeY} ${nEndX} ${nEndY}`);
    }
    parts.push(`L ${x2} ${y2}`);
  };

  parts.push(`M ${left} ${top}`);
  addEdge(left, top, right, top);
  addEdge(right, top, right, bottom);
  addEdge(right, bottom, left, bottom);
  addEdge(left, bottom, left, top);
  parts.push("Z");

  return parts.join(" ");
}

let idCounter = 0;

export default function StampFrame({
  size = 58,
  imageUri,
  placeholderColor = "#f7f7f7",
  borderColor = "#888",
  gradientColors,
  notchesPerSide = 6,
  notchRadius = 4,
  frameThickness,
}: Props) {
  idCounter += 1;
  const clipId = `stampClip-${idCounter}`;
  const gradId = `stampGrad-${idCounter}`;

  // 未読（グラデーション）のときは太め、既読（単色）のときは、細めにする
  const actualThickness = frameThickness ?? (gradientColors ? 6 : 3);

  // 外側の縁（サイズいっぱい）と、内側の縁（枠の太さぶん、内側に入った位置）の、
  // 2つのギザギザの形を作り、その間を塗りつぶすことで「枠」として表現する
  const outerPath = buildStampPath(size, size, 1, notchesPerSide, notchRadius);
  const innerInset = actualThickness + 1;
  const innerPath = buildStampPath(size, size, innerInset, notchesPerSide, notchRadius * 0.7);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <ClipPath id={clipId}>
          <Path d={innerPath} />
        </ClipPath>
        {gradientColors && (
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradientColors[0]} />
            <Stop offset="1" stopColor={gradientColors[1]} />
          </LinearGradient>
        )}
      </Defs>

      {/* 内側（写真が入る部分）の背景 */}
      <Path d={innerPath} fill={placeholderColor} />

      {imageUri && (
        <SvgImage
          href={imageUri}
          x={0}
          y={0}
          width={size}
          height={size}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipId})`}
        />
      )}

      {/* 外側と内側の、2つのギザギザの間を塗りつぶして、枠として表現する */}
      <Path
        fillRule="evenodd"
        d={`${outerPath} ${innerPath}`}
        fill={gradientColors ? `url(#${gradId})` : borderColor}
      />
    </Svg>
  );
}