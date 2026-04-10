import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ConversationEntry = {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export function useRealtimeInterview() {
  const [isConnected, setIsConnected] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [conversationLog, setConversationLog] = useState<ConversationEntry[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const aiTranscriptRef = useRef("");
  const interviewIdRef = useRef<string>("");

  // Expose stream ref for mute control
  const getStream = useCallback(() => streamRef.current, []);

  const startSession = useCallback(async (interviewId: string, preGeneratedToken?: string, persona?: { name: string; title: string; company: string }) => {
    interviewIdRef.current = interviewId;
    setConnectionStatus("connecting");

    try {
      let ephemeralToken = preGeneratedToken;

      // 1. Get ephemeral token (skip if pre-generated token provided)
      if (!ephemeralToken) {
        const { data: tokenData, error: tokenErr } = await supabase.functions.invoke(
          "realtime-session-token",
          { body: { interviewId, persona } }
        );

        if (tokenErr || !tokenData?.ephemeralToken) {
          throw new Error(tokenErr?.message || "Failed to get session token");
        }

        ephemeralToken = tokenData.ephemeralToken;
      }

      // 2. Create peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 3. Set up remote audio playback
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // 4. Add user microphone with noise gate processing
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Build Web Audio processing chain: High-pass filter → Noise gate
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(rawStream);

      // High-pass filter at 85Hz — removes low-frequency rumble (AC, fans, traffic)
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 85;
      highpass.Q.value = 0.7;

      // Noise gate via DynamicsCompressor — suppresses audio below threshold
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -45; // dB — sounds below this get compressed hard
      compressor.knee.value = 5;
      compressor.ratio.value = 20; // heavy compression = acts as gate
      compressor.attack.value = 0.003;
      compressor.release.value = 0.1;

      // Additional gain to recover volume after compression
      const makeupGain = audioCtx.createGain();
      makeupGain.gain.value = 1.2;

      // Connect chain: source → highpass → compressor → gain → destination
      const destination = audioCtx.createMediaStreamDestination();
      source.connect(highpass);
      highpass.connect(compressor);
      compressor.connect(makeupGain);
      makeupGain.connect(destination);

      const processedStream = destination.stream;
      streamRef.current = rawStream; // keep raw stream ref for mute control
      processedStream.getTracks().forEach((track) => pc.addTrack(track, processedStream));

      // 5. Create data channel for events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        setIsConnected(true);
        setConnectionStatus("connected");

        // Send a response.create event to kick off the conversation
        dc.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
          },
        }));
      };

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          handleRealtimeEvent(event);
        } catch {
          // ignore unparseable messages
        }
      };

      dc.onclose = () => {
        setIsConnected(false);
        setConnectionStatus("idle");
      };

      // 6. Create SDP offer and connect
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ephemeralToken}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      if (!sdpResponse.ok) {
        throw new Error(`SDP negotiation failed: ${sdpResponse.status}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err: any) {
      console.error("Failed to start realtime session:", err);
      setConnectionStatus("error");
      throw err;
    }
  }, []);

  const handleRealtimeEvent = useCallback((event: any) => {
    switch (event.type) {
      case "response.audio_transcript.delta":
        setIsAISpeaking(true);
        aiTranscriptRef.current += event.delta || "";
        break;

      case "response.audio_transcript.done":
        setIsAISpeaking(false);
        if (aiTranscriptRef.current.trim()) {
          const entry: ConversationEntry = {
            role: "assistant",
            text: aiTranscriptRef.current.trim(),
            timestamp: Date.now(),
          };
          setConversationLog((prev) => [...prev, entry]);

          // Save AI message to DB
          supabase.from("messages").insert({
            interview_id: interviewIdRef.current,
            role: "assistant",
            content: entry.text,
          }).then(({ error }) => {
            if (error) console.error("Failed to save AI message:", error);
          });
        }
        aiTranscriptRef.current = "";
        break;

      case "conversation.item.input_audio_transcription.completed": {
        const transcript = event.transcript?.trim();
        if (transcript && !isNoiseTranscription(transcript)) {
          const entry: ConversationEntry = {
            role: "user",
            text: transcript,
            timestamp: Date.now(),
          };
          setConversationLog((prev) => [...prev, entry]);

          // Save user message to DB
          supabase.from("messages").insert({
            interview_id: interviewIdRef.current,
            role: "user",
            content: entry.text,
          }).then(({ error }) => {
            if (error) console.error("Failed to save user message:", error);
          });
        }
        break;
      }

      case "input_audio_buffer.speech_started":
        // User started speaking — AI should stop if it was speaking
        setIsAISpeaking(false);
        break;

      case "response.done":
        setIsAISpeaking(false);
        break;

      case "error":
        console.error("Realtime API error:", event.error);
        break;
    }
  }, []);

  const endSession = useCallback(async () => {
    // Close data channel
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Stop microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Clean up audio element
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }

    setIsConnected(false);
    setIsAISpeaking(false);
    setConnectionStatus("idle");
  }, []);

  return {
    startSession,
    endSession,
    isConnected,
    isAISpeaking,
    conversationLog,
    connectionStatus,
    getStream,
  };
}
