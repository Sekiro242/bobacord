/**
 * Global Web Audio API processing engine managing local mic and remote audio streams.
 */

// Global shared AudioContext
let audioContext: AudioContext | null = null;
let globalGain: GainNode | null = null;
let globalCompressor: DynamicsCompressorNode | null = null;

// Map to hold remote stream processing nodes to prevent memory leaks
const remoteStreamNodes = new Map<string, {
    source: MediaStreamAudioSourceNode,
    compressor: DynamicsCompressorNode,
    gain: GainNode
}>();

export function getAudioContext(): AudioContext {
    if (!audioContext) {
        audioContext = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
        
        // studio-grade brickwall limiter to prevent digital clipping
        globalCompressor = audioContext.createDynamicsCompressor();
        globalCompressor.threshold.value = -0.5; // Brickwall ceiling
        globalCompressor.knee.value = 0; // Hard knee for limiting
        globalCompressor.ratio.value = 20; // High ratio for limiting
        globalCompressor.attack.value = 0; // Instant response
        globalCompressor.release.value = 0.1; // Fast release
        
        globalGain = audioContext.createGain();
        globalGain.gain.value = 1.0;
        
        globalCompressor.connect(globalGain);
        globalGain.connect(audioContext.destination);
    }
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

/**
 * Mute or unmute all incoming remote streams (used for deafening).
 */
export function setGlobalVolume(volume: number) {
    if (globalGain) {
        globalGain.gain.setTargetAtTime(volume, getAudioContext().currentTime, 0.05);
    }
}

/**
 * Process the local microphone stream before sending to Mediasoup.
 * Includes VAD (Voice Activity Detection), mild compression, and structural setup for RNNoise.
 */
export async function processLocalMic(rawStream: MediaStream, onSpeakingChange: (speaking: boolean) => void): Promise<MediaStream> {
    const ctx = getAudioContext();
    const sourceNode = ctx.createMediaStreamSource(rawStream);
    
    // 0. Noise Suppression Worklet (RNNoise / Krisp)
    let rnnoiseNode: AudioWorkletNode | null = null;
    try {
        // Attempt to load the RNNoise worklet processor
        await ctx.audioWorklet.addModule('/worklets/rnnoise-processor.js');
        rnnoiseNode = new AudioWorkletNode(ctx, 'rnnoise-processor');
        console.log('[AudioEngine] RNNoise Worklet loaded');
    } catch (e) {
        console.warn('[AudioEngine] Could not load RNNoise worklet, falling back to raw mic:', e);
    }

    // 0.5. Voice Band Filters — strip non-speech frequencies
    // High-pass at 100Hz (vocals don't live below this; remove rumble cleanly)
    const highPassFilter = ctx.createBiquadFilter();
    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = 100;
    highPassFilter.Q.value = 0.5; // Gentle Butterworth rolloff

    // Low-pass at 8000Hz (voice cutoff; kills hiss above 8k)
    const lowPassFilter = ctx.createBiquadFilter();
    lowPassFilter.type = 'lowpass';
    lowPassFilter.frequency.value = 8000;
    lowPassFilter.Q.value = 0.5;

    // WARMTH: Low-shelf +1.5dB at 250Hz — adds body/richness to voice
    const warmthFilter = ctx.createBiquadFilter();
    warmthFilter.type = 'lowshelf';
    warmthFilter.frequency.value = 250;
    warmthFilter.gain.value = 1.5;

    // PRESENCE: Peaking +3dB at 3kHz — the "clarity" band. Makes voice cut through
    // and sound intelligible. This is Discord's signature clarity feel.
    const presenceFilter = ctx.createBiquadFilter();
    presenceFilter.type = 'peaking';
    presenceFilter.frequency.value = 3000;
    presenceFilter.Q.value = 1.2;
    presenceFilter.gain.value = 3.0;

    // SILKINESS: Gentle high shelf -1.5dB at 7kHz — smooths sibilance and harshness
    const silkFilter = ctx.createBiquadFilter();
    silkFilter.type = 'highshelf';
    silkFilter.frequency.value = 7000;
    silkFilter.gain.value = -1.5;

    // 1. Transparent voice compressor — preserves consonant transients
    // Key insight: Discord uses 2:1 ratio with 15ms attack. Fast attack kills
    // plosives like P/T/K and makes voices sound 'muffled'. 15ms attack lets them through.
    const localCompressor = ctx.createDynamicsCompressor();
    localCompressor.threshold.value = -18; // Capture from -18dB up
    localCompressor.knee.value = 15;       // Soft knee for transparent transition
    localCompressor.ratio.value = 2.5;     // Gentle 2.5:1 — compress without pumping
    localCompressor.attack.value = 0.015;  // 15ms — preserves speech transients
    localCompressor.release.value = 0.15;  // 150ms — smooth, no pumping artifacts

    // Makeup gain: 2.5:1 at -18dBFS → output is around -11dBFS avg. Bring back to -6dBFS.
    const makeupGain = ctx.createGain();
    makeupGain.gain.value = 1.5; // +~3.5dB makeup

    // 1.5. Noise Gate (GainNode keyed by VAD)
    const gateNode = ctx.createGain();
    gateNode.gain.value = 0; // Default to muted


    // 2. VAD node — Voice-frequency weighted energy detection
    // We analyze BEFORE the gate (post-compressor) so the analyser always sees signal.
    // Using a larger FFT for better frequency resolution.
    const analyzer = ctx.createAnalyser();
    analyzer.fftSize = 1024; // Higher resolution
    analyzer.smoothingTimeConstant = 0.25; // Some smoothing to avoid click spikes
    analyzer.minDecibels = -80;
    analyzer.maxDecibels = -10; // Ignore very loud transients (keyboard clicks)
    const bufData = new Uint8Array(analyzer.frequencyBinCount);
    
    // Voice frequency range at 48kHz sample rate:
    // Bin size = 48000 / fftSize = ~46.9 Hz/bin
    // Voice fundamental: 300Hz = bin 6, 3000Hz = bin 64
    const binSize = ctx.sampleRate / analyzer.fftSize;
    const voiceLowBin = Math.floor(300 / binSize);   // ~300Hz
    const voiceHighBin = Math.floor(3400 / binSize); // ~3400Hz
    
    let isSpeaking = false;
    let speakingTimeout: NodeJS.Timeout | null = null;
    
    const checkSpeaking = () => {
        analyzer.getByteFrequencyData(bufData);
        
        // Only average energy in the VOICE BAND (300Hz–3400Hz)
        // Keyboard clicks and fan noise are broad-spectrum — they still register here
        // but the maxDecibels cap prevents short transients from spiking the average
        let sum = 0;
        let count = voiceHighBin - voiceLowBin;
        for (let i = voiceLowBin; i < voiceHighBin; i++) {
            sum += bufData[i];
        }
        const avg = sum / count;
        
        // Threshold: human voice consistently around 20-40 in voice band
        // Keyboard clicks are brief and capped by maxDecibels, so average stays low
        const currentSpeaking = avg > 18;
        
        if (currentSpeaking !== isSpeaking) {
            if (currentSpeaking) {
                if (speakingTimeout) clearTimeout(speakingTimeout);
                isSpeaking = true;
                // Open gate gradually (50ms fade-in)
                gateNode.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
                onSpeakingChange(true);
            } else {
                // SHORT hangover: 200ms then close gate fast
                speakingTimeout = setTimeout(() => {
                    isSpeaking = false;
                    // Close gate sharply (80ms fade-out to minimize trailing noise)
                    gateNode.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
                    onSpeakingChange(false);
                }, 200);
            }
        }
        requestAnimationFrame(checkSpeaking);
    };
    requestAnimationFrame(checkSpeaking);

    //
    // OUTBOUND SIGNAL CHAIN:
    // Source → [RNNoise] → HPF(100Hz) → LPF(8kHz) → Warmth → Presence → Silk → Compressor → MakeupGain → Gate → SFU
    //                                                                            ↓
    //                                                                        Analyser (voice-band VAD, pre-gate)
    //
    const destNode = ctx.createMediaStreamDestination();

    if (rnnoiseNode) {
        sourceNode.connect(rnnoiseNode);
        rnnoiseNode.connect(highPassFilter);
    } else {
        sourceNode.connect(highPassFilter);
    }

    highPassFilter.connect(lowPassFilter);
    lowPassFilter.connect(warmthFilter);
    warmthFilter.connect(presenceFilter);
    presenceFilter.connect(silkFilter);
    silkFilter.connect(localCompressor);
    localCompressor.connect(makeupGain);
    makeupGain.connect(gateNode);
    makeupGain.connect(analyzer); // VAD taps AFTER compressor, BEFORE gate — always sees signal
    gateNode.connect(destNode);

    // Return the new, processed MediaStream to be ingested by Mediasoup
    return destNode.stream;
}

/**
 * Handle incoming remote streams by routing them through the shared AudioContext 
 * with individual DynamicsCompressorNodes for volume normalization.
 */
export function addRemoteStream(peerId: string, stream: MediaStream) {
    if (!stream || stream.getAudioTracks().length === 0) return;
    try {
        const ctx = getAudioContext();
        
        // Cleanup existing if present
        removeRemoteStream(peerId);
        
        const sourceNode = ctx.createMediaStreamSource(stream);

        // INBOUND SIGNAL CHAIN:
        // Remote → HPF(100Hz) → Presence(+2dB/3kHz) → Gentle Compressor → PeerGain → Global Limiter
        //
        // High-pass to strip remote mic rumble
        const remoteHPF = ctx.createBiquadFilter();
        remoteHPF.type = 'highpass';
        remoteHPF.frequency.value = 100;
        remoteHPF.Q.value = 0.5;

        // Gentle presence boost for remote voice clarity
        const remotePresence = ctx.createBiquadFilter();
        remotePresence.type = 'peaking';
        remotePresence.frequency.value = 2800;
        remotePresence.Q.value = 1.0;
        remotePresence.gain.value = 2.0; // +2dB — subtle, just adds air

        // Transparent normalization compressor
        // Matches volumes across users without sounding squashed.
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18; // Compress peaks above -18dBFS
        compressor.knee.value = 12;       // Soft knee
        compressor.ratio.value = 3;       // 3:1 — moderately gentle
        compressor.attack.value = 0.010;  // 10ms — preserves transients
        compressor.release.value = 0.20;  // 200ms — smooth release, no pumping

        // Per-peer gain node for individual volume control
        const peerGain = ctx.createGain();
        peerGain.gain.value = 1.0;

        sourceNode.connect(remoteHPF);
        remoteHPF.connect(remotePresence);
        remotePresence.connect(compressor);
        compressor.connect(peerGain);

        if (globalCompressor) {
            peerGain.connect(globalCompressor);
        } else {
            peerGain.connect(ctx.destination);
        }

        remoteStreamNodes.set(peerId, { source: sourceNode, compressor, gain: peerGain });

        // IMPORTANT: We do NOT need a local hidden <audio> tag anymore, 
        // as the Web Audio API destination plays the sound directly.
    } catch (e) {
        console.error(`[AudioEngine] Failed to add remote stream for ${peerId}:`, e);
    }
}

/**
 * Set individual volume for a remote peer (0.0 to 2.0).
 */
export function setPeerVolume(peerId: string, volume: number) {
    const nodes = remoteStreamNodes.get(peerId);
    if (nodes) {
        nodes.gain.gain.setTargetAtTime(volume, getAudioContext().currentTime, 0.05);
    }
}

/**
 * Stop processing and disconnect nodes for a leaving remote stream.
 */
export function removeRemoteStream(peerId: string) {
    const nodes = remoteStreamNodes.get(peerId);
    if (nodes) {
        try {
            nodes.source.disconnect();
            nodes.compressor.disconnect();
            nodes.gain.disconnect();
        } catch (e) {
            // Ignore disconnect errors
        }
        remoteStreamNodes.delete(peerId);
    }
}

/**
 * Clean up all remote streams (e.g., when leaving a call).
 */
export function cleanupAllRemoteStreams() {
    remoteStreamNodes.forEach((_, peerId) => removeRemoteStream(peerId));
}
