// 판독용 필름. 지식 단계가 오를수록 선명해진다 (0: 흐림, 1: 병변 표시, 2: 확진 표시)
import React from "react";
import type { ArtRegion } from "../../core";

const SOFT = "#34414a";
const DARK = "#0e1418";
const BONE = "#b9c6cd";

function Chest() {
  const ribs: React.ReactElement[] = [];
  for (let i = 0; i < 6; i++) {
    const y = 36 + i * 13;
    ribs.push(<path key={`l${i}`} d={`M96 ${y} C80 ${y - 7} 63 ${y + 1} 55 ${y + 15}`} />);
    ribs.push(<path key={`r${i}`} d={`M104 ${y} C120 ${y - 7} 137 ${y + 1} 145 ${y + 15}`} />);
  }
  return (
    <g>
      <path d="M38 138 C35 92 44 42 70 22 C86 11 114 11 130 22 C156 42 165 92 162 138 Z" fill={SOFT} />
      <path d="M57 120 C51 92 54 52 78 33 C88 28 94 34 95 46 L95 114 C88 120 72 124 57 120 Z" fill={DARK} />
      <path d="M143 120 C149 92 146 52 122 33 C112 28 106 34 105 46 L105 114 C112 120 128 124 143 120 Z" fill={DARK} />
      <path d="M99 60 C115 57 133 70 135 93 C136 109 121 118 104 116 C97 101 96 76 99 60 Z" fill="#8f9ca4" opacity="0.55" />
      <rect x="96" y="14" width="8" height="120" fill={BONE} opacity="0.42" />
      <g stroke={BONE} strokeWidth="2" fill="none" opacity="0.45">
        {ribs}
      </g>
      <g stroke={BONE} strokeWidth="3" fill="none" opacity="0.6" strokeLinecap="round">
        <path d="M68 25 C80 20 91 22 98 27" />
        <path d="M132 25 C120 20 109 22 102 27" />
      </g>
      <g stroke="#9aa7ae" strokeWidth="2" fill="none" opacity="0.6">
        <path d="M56 120 C66 106 86 105 96 115" />
        <path d="M104 115 C114 103 136 105 144 120" />
      </g>
    </g>
  );
}

function Abdomen() {
  const vert: React.ReactElement[] = [];
  for (let i = 0; i < 8; i++) vert.push(<rect key={i} x="94" y={10 + i * 12.5} width="12" height="10" rx="2" />);
  return (
    <g>
      <path d="M34 6 C28 60 31 110 44 138 L156 138 C169 110 172 60 166 6 Z" fill={SOFT} />
      <path d="M38 10 C68 8 95 16 100 32 C85 44 60 47 40 40 Z" fill="#7d8a92" opacity="0.5" />
      <g fill={BONE} opacity="0.45">{vert}</g>
      <g fill={DARK} opacity="0.85">
        <ellipse cx="68" cy="68" rx="10" ry="6" />
        <ellipse cx="122" cy="60" rx="12" ry="7" />
        <ellipse cx="84" cy="88" rx="9" ry="5" />
        <ellipse cx="132" cy="88" rx="10" ry="6" />
        <ellipse cx="60" cy="96" rx="8" ry="5" />
        <ellipse cx="112" cy="102" rx="9" ry="5" />
      </g>
      <g stroke={BONE} strokeWidth="4" fill="none" opacity="0.5" strokeLinecap="round">
        <path d="M48 118 C58 98 84 100 92 124" />
        <path d="M152 118 C142 98 116 100 108 124" />
      </g>
    </g>
  );
}

function Pelvis() {
  const vert: React.ReactElement[] = [];
  for (let i = 0; i < 7; i++) vert.push(<rect key={i} x="94" y={6 + i * 12.5} width="12" height="10" rx="2" />);
  return (
    <g>
      <path d="M34 4 C28 60 31 110 44 138 L156 138 C169 110 172 60 166 4 Z" fill={SOFT} />
      <g fill={BONE} opacity="0.4">{vert}</g>
      <path d="M60 20 C74 16 84 29 80 43 C77 51 80 59 74 65 C64 72 51 62 51 45 C51 33 53 25 60 20 Z" fill="#8f9ca4" opacity="0.6" />
      <path d="M140 20 C126 16 116 29 120 43 C123 51 120 59 126 65 C136 72 149 62 149 45 C149 33 147 25 140 20 Z" fill="#8f9ca4" opacity="0.6" />
      <ellipse cx="100" cy="116" rx="19" ry="12" fill="#6f7c85" opacity="0.55" />
      <g stroke={BONE} strokeWidth="4" fill="none" opacity="0.5" strokeLinecap="round">
        <path d="M46 104 C56 86 82 90 90 114" />
        <path d="M154 104 C144 86 118 90 110 114" />
      </g>
    </g>
  );
}

function Head() {
  return (
    <g>
      <ellipse cx="100" cy="70" rx="60" ry="57" fill="#3a454d" />
      <ellipse cx="100" cy="70" rx="60" ry="57" fill="none" stroke="#dfe7ec" strokeWidth="7" opacity="0.85" />
      <path d="M100 16 V124" stroke="#6b7880" strokeWidth="1.2" opacity="0.6" />
      <g fill={DARK} opacity="0.9">
        <path d="M93 58 C87 49 79 55 83 66 C87 73 94 71 97 64 Z" />
        <path d="M107 58 C113 49 121 55 117 66 C113 73 106 71 103 64 Z" />
        <path d="M98 76 H102 V88 H98 Z" />
      </g>
      <g stroke="#56636b" strokeWidth="1.2" fill="none" opacity="0.7">
        <path d="M58 52 C64 46 70 48 74 44" />
        <path d="M142 52 C136 46 130 48 126 44" />
        <path d="M60 92 C66 96 72 94 78 98" />
        <path d="M140 92 C134 96 128 94 122 98" />
      </g>
    </g>
  );
}

function Leg() {
  return (
    <g>
      <path d="M56 4 C41 30 43 60 51 90 C55 110 59 126 63 140 L87 140 C89 120 93 100 95 80 C97 50 93 25 89 4 Z" fill={SOFT} />
      <path d="M144 4 C159 30 157 60 149 90 C145 110 141 126 137 140 L113 140 C111 120 107 100 105 80 C103 50 107 25 111 4 Z" fill={SOFT} />
      <g stroke={BONE} strokeLinecap="round" fill="none" opacity="0.6">
        <path d="M74 6 L76 138" strokeWidth="7" />
        <path d="M62 12 L67 132" strokeWidth="3" />
        <path d="M126 6 L124 138" strokeWidth="7" />
        <path d="M138 12 L133 132" strokeWidth="3" />
      </g>
      <g stroke={DARK} strokeWidth="1.4" fill="none" opacity="0.7">
        <path d="M83 10 C85 50 82 90 80 136" />
        <path d="M117 10 C115 50 118 90 120 136" />
      </g>
    </g>
  );
}

function Body() {
  return (
    <g>
      <circle cx="100" cy="16" r="10" fill={SOFT} />
      <path d="M86 28 C92 26 108 26 114 28 L132 34 C138 36 140 42 141 50 L146 86 L139 88 L132 54 L128 60 L126 96 L116 138 L106 138 L101 100 L99 100 L94 138 L84 138 L74 96 L72 60 L68 54 L61 88 L54 86 L59 50 C60 42 62 36 68 34 Z" fill={SOFT} />
      <g stroke={BONE} strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round">
        <path d="M100 30 V98" />
        <path d="M84 40 C90 44 110 44 116 40" />
        <path d="M80 92 C90 86 110 86 120 92" />
      </g>
      <path d="M88 44 C92 60 108 60 112 44" fill="#6f7c85" opacity="0.4" />
    </g>
  );
}

const REGION_LABEL: Record<ArtRegion, string> = {
  head: "BRAIN CT AXIAL",
  chest: "CHEST PA",
  abdomen: "ABDOMEN SUPINE",
  pelvis: "KUB",
  leg: "LOWER EXT",
  body: "WHOLE BODY",
};

export function Film({
  region,
  lesion,
  knowledge,
  uid,
  cured,
}: {
  region: ArtRegion;
  lesion: [number, number, number];
  knowledge: 0 | 1 | 2;
  uid: string;
  cured?: boolean;
}) {
  const [lx, ly, lr] = lesion;
  const cx = lx * 200;
  const cy = ly * 140;
  const r = Math.max(8, lr * 200);
  const gid = `les-${uid}`;
  const Region = { head: Head, chest: Chest, abdomen: Abdomen, pelvis: Pelvis, leg: Leg, body: Body }[region];
  return (
    <div className={`film k${knowledge} ${cured ? "is-cured" : ""}`}>
      <svg viewBox="0 0 200 140" className="film-svg" aria-hidden="true">
        <defs>
          <radialGradient id={gid}>
            <stop offset="0%" stopColor="#f4f8fa" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#dbe6ec" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#dbe6ec" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="film-anatomy">
          <Region />
        </g>
        <circle cx={cx} cy={cy} r={r} fill={`url(#${gid})`} className="film-lesion" />
        {knowledge >= 2 && (
          <path
            d={`M${cx - r * 1.25} ${cy} C${cx - r * 1.25} ${cy - r * 1.3} ${cx + r * 1.3} ${cy - r * 1.25} ${cx + r * 1.28} ${cy + r * 0.1} C${cx + r * 1.2} ${cy + r * 1.3} ${cx - r * 1.3} ${cy + r * 1.2} ${cx - r * 1.1} ${cy - r * 0.35}`}
            className="film-circle"
          />
        )}
      </svg>
      <span className="film-r">R</span>
      <span className="film-meta mono">{REGION_LABEL[region]}</span>
    </div>
  );
}
