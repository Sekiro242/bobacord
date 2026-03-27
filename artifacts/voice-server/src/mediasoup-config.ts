import type { RtpCodecCapability, WorkerSettings, WebRtcTransportOptions } from "mediasoup/node/lib/types.js";

// ─── Worker settings ──────────────────────────────────────────────────────────

export const workerSettings: WorkerSettings = {
  logLevel: "warn",
  logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
  rtcMinPort: Number(process.env.RTC_MIN_PORT) || 40000,
  rtcMaxPort: Number(process.env.RTC_MAX_PORT) || 49999,
};

// ─── Router media codecs ───────────────────────────────────────────────────────
// Opus is THE codec for WebRTC voice — 48kHz, stereo capable, low latency

export const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
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
    // Allow SCTP (data channels) — not used currently but enables future text
    enableSctp: false,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 800000,
  };
}
