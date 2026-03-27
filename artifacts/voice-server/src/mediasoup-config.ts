import type { RtpCodecCapability, WorkerSettings, WebRtcTransportOptions } from "mediasoup/node/lib/types.js";

// ─── Worker settings ──────────────────────────────────────────────────────────

export const workerSettings: WorkerSettings = {
  logLevel: "warn",
  logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
  rtcMinPort: Number(process.env.RTC_MIN_PORT) || 40000,
  rtcMaxPort: Number(process.env.RTC_MAX_PORT) || 49999,
};

// ─── Router media codecs ───────────────────────────────────────────────────────
// Supports: Opus audio + VP8 / VP9 / H264 video

export const mediaCodecs: RtpCodecCapability[] = [
  // ── Audio ──
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },

  // ── Video: VP8 (widest browser support) ──
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },

  // ── Video: VP9 (better quality / compression than VP8) ──
  {
    kind: "video",
    mimeType: "video/VP9",
    clockRate: 90000,
    parameters: {
      "profile-id": 2,
      "x-google-start-bitrate": 1000,
    },
  },

  // ── Video: H264 (hardware acceleration on most devices) ──
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "4d0032",
      "level-asymmetry-allowed": 1,
      "x-google-start-bitrate": 1000,
    },
  },
];

// ─── WebRTC Transport options ─────────────────────────────────────────────────

export function getWebRtcTransportOptions(): WebRtcTransportOptions {
  const announcedIp = process.env.ANNOUNCED_IP || "127.0.0.1";

  return {
    listenInfos: [
      {
        protocol: "udp",
        ip: "0.0.0.0",
        announcedAddress: announcedIp,
      },
      {
        protocol: "tcp",
        ip: "0.0.0.0",
        announcedAddress: announcedIp,
      },
    ],
    enableSctp: false,
    enableTcp: true,
    preferUdp: true,
    // Higher bitrate ceiling for video
    initialAvailableOutgoingBitrate: 1_500_000,
  };
}
