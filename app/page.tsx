"use client";

import { useEffect, useRef, useState } from "react";
import AvatarViewer from "@/components/AvatarViewer";

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    cv?: any;
    Module?: {
      onRuntimeInitialized?: () => void;
    };
  }
}

type ConversationMode = "studio" | "john";

type ChatMetadata = {
  isArtRelated: boolean;
  category:
    | "artist_identity"
    | "artist_biography"
    | "art_history"
    | "style_analysis"
    | "art_prompt"
    | "creative_inspiration"
    | "artwork_lookup"
    | "general_art_question"
    | "non_art";
  subject: string;
  shouldSearchImages: boolean;
  imageSearchQuery: string;
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  images?: { url: string; title?: string }[];
  metadata?: ChatMetadata;
  speakerMode?: ConversationMode;
};

type MouthCue = {
  start: number;
  end: number;
  value: string;
};

type LipSyncData = {
  metadata?: {
    soundFile?: string;
    duration?: number;
  };
  mouthCues: MouthCue[];
};

type UserLogEntry = {
  id: number;
  text: string;
  source: "text" | "voice";
  createdAt: string;
};

type AILogEntry = {
  id: number;
  text: string;
  createdAt: string;
  metadata?: ChatMetadata;
  speakerMode?: ConversationMode;
};

type LogMatch = {
  userEntry: UserLogEntry;
  aiEntry?: AILogEntry;
  score: number;
};

type StreamEvent =
  | {
      type: "meta";
      metadata: ChatMetadata;
      persona: ConversationMode;
    }
  | {
      type: "chunk";
      content: string;
    }
  | {
      type: "done";
    }
  | {
      type: "error";
      message: string;
    };

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanAssistantText(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\r/g, "")
    .trim();
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getKeywordSet(text: string) {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "do",
    "does",
    "did",
    "to",
    "of",
    "in",
    "on",
    "for",
    "and",
    "or",
    "but",
    "with",
    "can",
    "could",
    "would",
    "should",
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "me",
    "my",
    "your",
    "this",
    "that",
    "these",
    "those",
    "what",
    "how",
    "why",
    "when",
    "where",
  ]);

  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((word) => word.length > 2 && !stopWords.has(word))
  );
}

function getSimilarityScore(a: string, b: string) {
  const aWords = getKeywordSet(a);
  const bWords = getKeywordSet(b);

  if (aWords.size === 0 || bWords.size === 0) {
    return 0;
  }

  let overlap = 0;

  for (const word of aWords) {
    if (bWords.has(word)) {
      overlap++;
    }
  }

  return overlap / Math.max(aWords.size, bWords.size);
}

function formatMessageParagraphs(text: string) {
  const cleaned = cleanAssistantText(text);

  return cleaned
    .split(/\n\s*\n|\n(?=\d+\.)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getCategoryLabel(
  category?: ChatMetadata["category"],
  mode: ConversationMode = "studio"
) {
  if (mode === "john") {
    return "John";
  }

  switch (category) {
    case "artist_identity":
      return "Artist Appearance";
    case "artist_biography":
      return "Artist Profile";
    case "art_history":
      return "Art History";
    case "style_analysis":
      return "Style Analysis";
    case "art_prompt":
      return "Creative Prompt";
    case "creative_inspiration":
      return "Inspiration";
    case "artwork_lookup":
      return "Artwork Lookup";
    case "general_art_question":
      return "Art Assistant";
    default:
      return "Creative Output";
  }
}

function getCategoryClass(
  category?: ChatMetadata["category"],
  mode: ConversationMode = "studio"
) {
  if (mode === "john") {
    return "assistantCardJohn";
  }

  switch (category) {
    case "artist_identity":
      return "assistantCardArtist";
    case "artist_biography":
      return "assistantCardBiography";
    case "art_history":
      return "assistantCardHistory";
    case "style_analysis":
      return "assistantCardStyle";
    case "art_prompt":
      return "assistantCardPrompt";
    case "creative_inspiration":
      return "assistantCardInspiration";
    case "artwork_lookup":
      return "assistantCardArtwork";
    default:
      return "assistantCardDefault";
  }
}

function normalizeForIntent(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsJohnAlias(text: string) {
  const normalized = normalizeForIntent(text);
  const aliases = ["john", "jon", "johnn", "jahn"];

  return aliases.some((alias) => {
    const pattern = new RegExp(`\\b${alias}\\b`);
    return pattern.test(normalized);
  });
}

function detectJohnIntent(text: string) {
  const normalized = normalizeForIntent(text);

  const wakePatterns = [
    /\bhey john\b/,
    /\bhi john\b/,
    /\bhello john\b/,
    /\byo john\b/,
    /\bok john\b/,
    /\bokay john\b/,
    /\balright john\b/,
    /\bcome here john\b/,
    /\bjohn are you there\b/,
    /\bcan you hear me john\b/,
    /\blisten john\b/,
    /\bhelp me john\b/,
    /\btalk to me john\b/,
    /\bi need you john\b/,
    /\bjohn\b/,
  ];

  const goodbyePatterns = [
    /\bgoodbye john\b/,
    /\bbye john\b/,
    /\bsee you john\b/,
    /\bsee ya john\b/,
    /\blater john\b/,
    /\btalk to you later john\b/,
    /\bgood night john\b/,
    /\bnight john\b/,
    /\bgo away john\b/,
    /\byou can leave john\b/,
    /\bthat will be all john\b/,
    /\bthanks john goodbye\b/,
    /\bbye jon\b/,
    /\bgoodbye jon\b/,
    /\bsee you jon\b/,
  ];

  const wake =
    wakePatterns.some((pattern) => pattern.test(normalized)) ||
    ["john", "jon", "yo john", "hi john", "hello john", "hey john"].includes(
      normalized
    );

  const goodbye = goodbyePatterns.some((pattern) => pattern.test(normalized));

  return {
    wake,
    goodbye,
    mentionsJohn: containsJohnAlias(normalized),
    normalized,
  };
}

function stripJohnAddress(text: string) {
  return text
    .replace(/^\s*(hey|hi|hello|yo|okay|ok|alright)\s+john[:,]?\s*/i, "")
    .replace(/^\s*(hey|hi|hello|yo|okay|ok|alright)\s+jon[:,]?\s*/i, "")
    .replace(/^\s*john[:,]?\s*/i, "")
    .replace(/^\s*jon[:,]?\s*/i, "")
    .trim();
}

function extractSpeakableSentences(buffer: string) {
  const matches = buffer.match(/.*?[.!?](?:\s|$)/g) || [];
  const consumedLength = matches.reduce((sum, item) => sum + item.length, 0);

  return {
    sentences: matches.map((s) => s.trim()).filter(Boolean),
    remainder: buffer.slice(consumedLength),
  };
}

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const [conversationMode, setConversationMode] =
    useState<ConversationMode>("studio");

  const [johnAwake, setJohnAwake] = useState(false);
  const [avatarCommand, setAvatarCommand] = useState<
    "idle" | "activate" | "goodbye"
  >("idle");

  const [johnAudioUrl, setJohnAudioUrl] = useState<string | null>(null);
  const [johnLipSync, setJohnLipSync] = useState<LipSyncData | null>(null);

  const [logsOpen, setLogsOpen] = useState(false);
  const [logMatches, setLogMatches] = useState<LogMatch[]>([]);

  const [userConversationLog, setUserConversationLog] = useState<UserLogEntry[]>(
    []
  );
  const [aiConversationLog, setAiConversationLog] = useState<AILogEntry[]>([]);

  const [canvasImages, setCanvasImages] = useState<
    { url: string; title?: string }[]
  >([]);
  const [canvasPrompt, setCanvasPrompt] = useState("");
  const [canvasTitle, setCanvasTitle] = useState("Canvas Preview");

  const [opencvReady, setOpencvReady] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastCameraCapture, setLastCameraCapture] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "Welcome to AI Art Studio. Bring me a rough idea, an art question, a style, a mood, or even a spoken concept, and I will help shape it into something visual and creative.",
      metadata: {
        isArtRelated: true,
        category: "general_art_question",
        subject: "AI Art Studio",
        shouldSearchImages: false,
        imageSearchQuery: "",
      },
      speakerMode: "studio",
    },
  ]);

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const autoSendingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const fallbackVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speakingUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentAssistantIdRef = useRef<number | null>(null);
  const speechQueueRef = useRef<string[]>([]);
  const speechRemainderRef = useRef("");
  const isSpeakingRef = useRef(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    try {
      const savedUserLog = localStorage.getItem("userConversationLog");
      const savedAiLog = localStorage.getItem("aiConversationLog");
      const savedLogsOpen = localStorage.getItem("conversationLogsOpen");

      if (savedUserLog) {
        setUserConversationLog(JSON.parse(savedUserLog));
      }

      if (savedAiLog) {
        setAiConversationLog(JSON.parse(savedAiLog));
      }

      if (savedLogsOpen) {
        setLogsOpen(JSON.parse(savedLogsOpen));
      }
    } catch (error) {
      console.error("Failed to load conversation logs:", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "userConversationLog",
        JSON.stringify(userConversationLog)
      );
    } catch (error) {
      console.error("Failed to save user conversation log:", error);
    }
  }, [userConversationLog]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "aiConversationLog",
        JSON.stringify(aiConversationLog)
      );
    } catch (error) {
      console.error("Failed to save AI conversation log:", error);
    }
  }, [aiConversationLog]);

  useEffect(() => {
    try {
      localStorage.setItem("conversationLogsOpen", JSON.stringify(logsOpen));
    } catch (error) {
      console.error("Failed to save logs open state:", error);
    }
  }, [logsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.cv) {
      setOpencvReady(true);
      return;
    }

    const existingScript = document.querySelector(
      'script[data-opencv-js="true"]'
    ) as HTMLScriptElement | null;

    if (existingScript) {
      const checkReady = setInterval(() => {
        if (window.cv) {
          setOpencvReady(true);
          clearInterval(checkReady);
        }
      }, 250);

      return () => clearInterval(checkReady);
    }

    window.Module = {
      onRuntimeInitialized() {
        setOpencvReady(true);
      },
    };

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.x/opencv.js";
    script.async = true;
    script.setAttribute("data-opencv-js", "true");
    script.onerror = () => {
      setCameraError("OpenCV failed to load.");
    };

    document.body.appendChild(script);
  }, []);

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    return () => {
      if (activationTimeoutRef.current) {
        clearTimeout(activationTimeoutRef.current);
      }

      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      stopCameraStream();
    };
  }, []);

  async function startCamera() {
    setCameraError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraOpen(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error(error);
      setCameraError("Camera access failed.");
      setCameraOpen(false);
    }
  }

  function closeCamera() {
    stopCameraStream();
    setCameraOpen(false);
    setCameraBusy(false);
    setCameraError("");
  }

  function processCurrentFrameToSketch() {
    if (!window.cv || !videoRef.current || !captureCanvasRef.current) {
      setCameraError("OpenCV or camera is not ready yet.");
      return;
    }

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("No camera frame available.");
      return;
    }

    setCameraBusy(true);
    setCameraError("");

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const rawDataUrl = canvas.toDataURL("image/png");
      setLastCameraCapture(rawDataUrl);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const cv = window.cv;

      const src = cv.matFromImageData(imageData);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edges = new cv.Mat();
      const rgbaEdges = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
      cv.Canny(blurred, edges, 70, 160, 3, false);
      cv.cvtColor(edges, rgbaEdges, cv.COLOR_GRAY2RGBA, 0);

      cv.imshow(canvas, rgbaEdges);

      const sketchUrl = canvas.toDataURL("image/png");

      setCanvasTitle("Camera Sketch");
      setCanvasPrompt(
        "Live camera frame processed into an OpenCV sketch preview."
      );
      setCanvasImages([
        { url: sketchUrl, title: "OpenCV Edge Sketch" },
        ...(rawDataUrl ? [{ url: rawDataUrl, title: "Original Camera Frame" }] : []),
      ]);

      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      rgbaEdges.delete();
    } catch (error) {
      console.error(error);
      setCameraError("Sketch processing failed.");
    } finally {
      setCameraBusy(false);
    }
  }

  function useSketchAsPrompt() {
    if (!canvasPrompt.trim()) {
      return;
    }

    void sendPrompt(
      `Use this camera sketch as inspiration and give me three art directions based on it: ${canvasPrompt}`,
      "text"
    );
  }

  function pickDefaultJohnVoice() {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return null;
    }

    const voices = window.speechSynthesis.getVoices();

    if (!voices.length) {
      return null;
    }

    const preferredVoice =
      voices.find((voice) =>
        /david|mark|guy|daniel|alex|fred/i.test(voice.name)
      ) ||
      voices.find((voice) => /en[-_ ]?us|english/i.test(voice.lang)) ||
      voices.find((voice) => voice.default) ||
      voices[0];

    fallbackVoiceRef.current = preferredVoice || null;
    return fallbackVoiceRef.current;
  }

  function stopBrowserSpeech() {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.cancel();
    speakingUtteranceRef.current = null;
    speechQueueRef.current = [];
    speechRemainderRef.current = "";
    isSpeakingRef.current = false;
  }

  function pumpSpeechQueue() {
    if (
      typeof window === "undefined" ||
      !window.speechSynthesis ||
      isSpeakingRef.current
    ) {
      return;
    }

    const next = speechQueueRef.current.shift();

    if (!next) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(next);
    const selectedVoice = fallbackVoiceRef.current || pickDefaultJohnVoice();

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || "en-US";
    } else {
      utterance.lang = "en-US";
    }

    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      isSpeakingRef.current = true;

      if (activationTimeoutRef.current) {
        clearTimeout(activationTimeoutRef.current);
      }

      setAvatarCommand("idle");
      setTimeout(() => {
        setAvatarCommand("activate");
      }, 50);
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      pumpSpeechQueue();
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      pumpSpeechQueue();
    };

    speakingUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function queueSpeechFromTextChunk(text: string) {
    const cleaned = cleanAssistantText(text);

    if (!cleaned) {
      return;
    }

    speechRemainderRef.current += cleaned;

    const { sentences, remainder } = extractSpeakableSentences(
      speechRemainderRef.current
    );

    speechRemainderRef.current = remainder;

    if (sentences.length) {
      speechQueueRef.current.push(...sentences);
      pumpSpeechQueue();
    }
  }

  function flushRemainingSpeech() {
    const remainder = cleanAssistantText(speechRemainderRef.current);

    if (remainder) {
      speechQueueRef.current.push(remainder);
      speechRemainderRef.current = "";
      pumpSpeechQueue();
    }
  }

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    const loadVoices = () => {
      pickDefaultJohnVoice();
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  function findMatchesInLogs(question: string) {
    const matches: LogMatch[] = userConversationLog
      .map((userEntry) => {
        const score = getSimilarityScore(question, userEntry.text);
        const aiEntry = aiConversationLog.find((entry) => entry.id > userEntry.id);

        return {
          userEntry,
          aiEntry,
          score,
        };
      })
      .filter((entry) => entry.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    setLogMatches(matches);
  }

  useEffect(() => {
    const trimmed = input.trim();

    if (!trimmed) {
      setLogMatches([]);
      return;
    }

    findMatchesInLogs(trimmed);
  }, [input, userConversationLog, aiConversationLog]);

  function createStreamingAssistantMessage(
    metadata: ChatMetadata | undefined,
    speakerMode: ConversationMode
  ) {
    const assistantId = Date.now() + Math.floor(Math.random() * 1000);
    currentAssistantIdRef.current = assistantId;

    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        text: "",
        images: [],
        metadata,
        speakerMode,
      },
    ]);

    return assistantId;
  }

  function updateStreamingAssistantMessage(
    assistantId: number,
    nextText: string,
    metadata?: ChatMetadata
  ) {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId
          ? { ...message, text: nextText, metadata }
          : message
      )
    );
  }

  function finalizeStreamingAssistantMessage(
    assistantId: number,
    fullText: string,
    images: { url: string; title?: string }[] = [],
    metadata?: ChatMetadata,
    speakerMode: ConversationMode = "studio"
  ) {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId
          ? { ...message, text: fullText, images, metadata, speakerMode }
          : message
      )
    );

    setAiConversationLog((prev) => [
      ...prev,
      {
        id: assistantId,
        text: fullText,
        createdAt: new Date().toISOString(),
        metadata,
        speakerMode,
      },
    ]);
  }

  async function typeAssistantMessage(
    fullText: string,
    images: { url: string; title?: string }[] = [],
    metadata?: ChatMetadata,
    speakerMode: ConversationMode = "studio"
  ) {
    const assistantId = Date.now() + Math.floor(Math.random() * 1000);

    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        text: "",
        images: [],
        metadata,
        speakerMode,
      },
    ]);

    let currentText = "";

    for (let i = 0; i < fullText.length; i++) {
      currentText += fullText[i];

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, text: currentText }
            : message
        )
      );

      await wait(10);
    }

    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId
          ? { ...message, images, metadata, speakerMode }
          : message
      )
    );

    setAiConversationLog((prev) => [
      ...prev,
      {
        id: assistantId,
        text: fullText,
        createdAt: new Date().toISOString(),
        metadata,
        speakerMode,
      },
    ]);
  }

  async function fetchImages(query: string) {
    try {
      const imgRes = await fetch("/api/images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!imgRes.ok) {
        return [];
      }

      const imgData = await imgRes.json();
      return imgData.images || [];
    } catch {
      return [];
    }
  }

  async function generateJohnSpeech(text: string) {
    const cleanedText = cleanAssistantText(text);

    if (!cleanedText) {
      return;
    }

    try {
      const res = await fetch("/api/john-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: cleanedText }),
      });

      const data = await res.json();

      if (!res.ok || !data?.audioUrl) {
        queueSpeechFromTextChunk(cleanedText);
        return;
      }

      stopBrowserSpeech();

      setJohnAudioUrl(data.audioUrl || null);
      setJohnLipSync(data.lipSync || null);

      if (activationTimeoutRef.current) {
        clearTimeout(activationTimeoutRef.current);
      }

      setAvatarCommand("idle");
      await wait(100);
      setAvatarCommand("activate");

      activationTimeoutRef.current = setTimeout(() => {
        setAvatarCommand("idle");
      }, 12000);
    } catch {
      queueSpeechFromTextChunk(cleanedText);
    }
  }

  async function sendPrompt(
    promptText: string,
    source: "text" | "voice" = "text"
  ) {
    const cleanInput = promptText.trim();

    if (!cleanInput || loading) {
      return;
    }

    setCanvasPrompt(cleanInput);

    const johnIntent = detectJohnIntent(cleanInput);
    const userCalledJohn = johnIntent.wake;
    const userSaidGoodbyeJohn = johnIntent.goodbye;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      text: cleanInput,
    };

    setMessages((prev) => [...prev, userMessage]);

    setUserConversationLog((prev) => [
      ...prev,
      {
        id: userMessage.id,
        text: cleanInput,
        source,
        createdAt: new Date().toISOString(),
      },
    ]);

    setInput("");

    if (userSaidGoodbyeJohn && johnAwake) {
      if (activationTimeoutRef.current) {
        clearTimeout(activationTimeoutRef.current);
      }

      stopBrowserSpeech();
      setJohnAudioUrl(null);
      setJohnLipSync(null);

      setAvatarCommand("idle");
      await wait(50);
      setAvatarCommand("goodbye");
      return;
    }

    if (userCalledJohn && !johnAwake) {
      setJohnAwake(true);
      setConversationMode("john");
    }

    if (activationTimeoutRef.current) {
      clearTimeout(activationTimeoutRef.current);
    }

    const cleanedPromptForApi = userCalledJohn
      ? stripJohnAddress(cleanInput)
      : cleanInput;

    const activePersona: ConversationMode =
      userCalledJohn || johnAwake ? "john" : "studio";

    setLoading(true);

    if (activePersona === "john") {
      stopBrowserSpeech();
    }

    try {
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: cleanedPromptForApi || cleanInput,
          source,
          persona: activePersona,
          johnActive: activePersona === "john",
        }),
      });

      if (!chatRes.ok || !chatRes.body) {
        throw new Error("Streaming response unavailable.");
      }

      const reader = chatRes.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let metadata: ChatMetadata | undefined;
      let assistantText = "";
      let assistantId: number | null = null;
      let images: { url: string; title?: string }[] = [];

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          const line = eventBlock
            .split("\n")
            .find((entry) => entry.startsWith("data: "));

          if (!line) {
            continue;
          }

          const json = line.replace(/^data:\s*/, "");

          let parsed: StreamEvent;

          try {
            parsed = JSON.parse(json);
          } catch {
            continue;
          }

          if (parsed.type === "meta") {
            metadata = parsed.metadata;
            assistantId = createStreamingAssistantMessage(metadata, activePersona);

            if (metadata?.subject) {
              setCanvasTitle(metadata.subject);
            }

            if (
              metadata?.isArtRelated &&
              metadata?.shouldSearchImages &&
              metadata?.imageSearchQuery
            ) {
              images = await fetchImages(metadata.imageSearchQuery);
              setCanvasImages(images);
            } else if (!canvasTitle.includes("Camera Sketch")) {
              setCanvasImages([]);
            }

            continue;
          }

          if (parsed.type === "chunk") {
            if (!assistantId) {
              assistantId = createStreamingAssistantMessage(
                metadata,
                activePersona
              );
            }

            assistantText += parsed.content;
            updateStreamingAssistantMessage(assistantId, assistantText, metadata);

            if (activePersona === "john") {
              queueSpeechFromTextChunk(parsed.content);
            }

            continue;
          }

          if (parsed.type === "error") {
            throw new Error(parsed.message);
          }

          if (parsed.type === "done") {
            continue;
          }
        }
      }

      if (!assistantId) {
        assistantId = createStreamingAssistantMessage(metadata, activePersona);
      }

      finalizeStreamingAssistantMessage(
        assistantId,
        assistantText || "No response",
        images,
        metadata,
        activePersona
      );

      if (activePersona === "john") {
        flushRemainingSpeech();
      }
    } catch {
      await wait(300);
      await typeAssistantMessage(
        "Something went wrong.",
        [],
        undefined,
        activePersona
      );
    } finally {
      setLoading(false);
      autoSendingRef.current = false;
    }
  }

  useEffect(() => {
    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      transcriptRef.current = "";
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let transcript = "";

      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      const cleanTranscript = transcript.trim();
      transcriptRef.current = cleanTranscript;
      setInput(cleanTranscript);
    };

    recognition.onerror = async () => {
      setIsListening(false);
      autoSendingRef.current = false;

      await wait(1000);
      await typeAssistantMessage(
        "I had trouble hearing that clearly. Try again.",
        [],
        {
          isArtRelated: true,
          category: "general_art_question",
          subject: "Voice Error",
          shouldSearchImages: false,
          imageSearchQuery: "",
        },
        conversationMode
      );
    };

    recognition.onend = () => {
      setIsListening(false);

      const finalTranscript = transcriptRef.current.trim();

      if (finalTranscript && !autoSendingRef.current) {
        autoSendingRef.current = true;
        void sendPrompt(finalTranscript, "voice");
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognitionRef.current?.stop();
    };
  }, [loading, johnAwake, conversationMode]);

  function handleMicClick() {
    if (!recognitionRef.current || loading) {
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      return;
    }

    transcriptRef.current = "";
    autoSendingRef.current = false;
    recognitionRef.current.start();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    autoSendingRef.current = false;
    await sendPrompt(input, "text");
  }

  function handleQuickPrompt(text: string) {
    if (loading || isListening) {
      return;
    }

    void sendPrompt(text, "text");
  }

  function clearConversationLogs() {
    setUserConversationLog([]);
    setAiConversationLog([]);
    localStorage.removeItem("userConversationLog");
    localStorage.removeItem("aiConversationLog");
  }

  function toggleConversationLogs() {
    setLogsOpen((prev) => !prev);
  }

  const headerTitle =
    conversationMode === "john" ? "John is Present" : "AI Art Studio";

  const headerStatus = isListening
    ? "Listening..."
    : loading
    ? conversationMode === "john"
      ? "John is responding..."
      : "Designing your idea..."
    : conversationMode === "john"
    ? 'John has taken over. Say "goodbye john" when you want him to leave.'
    : 'Ask anything or say "Hey John"';

  return (
    <main className="chatPage">
      {johnAwake && (
        <AvatarViewer
          active={johnAwake}
          command={avatarCommand}
          audioUrl={johnAudioUrl}
          lipSync={johnLipSync}
          onExitComplete={() => {
            setJohnAwake(false);
            setConversationMode("studio");
            setAvatarCommand("idle");
            setJohnAudioUrl(null);
            setJohnLipSync(null);
            stopBrowserSpeech();
          }}
        />
      )}

      <div className="chatGlow chatGlowOne" />
      <div className="chatGlow chatGlowTwo" />

      <div className="artBackdrop artBackdropOne" />
      <div className="artBackdrop artBackdropTwo" />
      <div className="artTexture" />
      <div className="floatingFrame floatingFrameOne" />
      <div className="floatingFrame floatingFrameTwo" />

      <section className="studioLayout">
        <div className="chatShell">
          <header className="chatHeader">
            <div className="chatAvatar">
              {conversationMode === "john" ? "🧠" : "🎨"}
            </div>

            <div className="chatHeaderText">
              <h1>{headerTitle}</h1>
              <p>{headerStatus}</p>
            </div>
          </header>

          <div className="quickPromptBar">
            <button
              type="button"
              className="quickPrompt"
              onClick={() => handleQuickPrompt("Give me a brief history of art")}
              disabled={loading || isListening}
            >
              History of Art
            </button>

            <button
              type="button"
              className="quickPrompt"
              onClick={() =>
                handleQuickPrompt("Give me anime and sketch art ideas")
              }
              disabled={loading || isListening}
            >
              Anime and Sketch
            </button>

            <button
              type="button"
              className="quickPrompt"
              onClick={() =>
                handleQuickPrompt("Give me ideas for modern art pieces")
              }
              disabled={loading || isListening}
            >
              Modern Art
            </button>
          </div>

          <div className="chatMessages">
            {messages.map((message) => {
              const messageMode =
                message.role === "assistant"
                  ? message.speakerMode || "studio"
                  : "studio";

              const categoryLabel = getCategoryLabel(
                message.metadata?.category,
                messageMode
              );

              const categoryClass = getCategoryClass(
                message.metadata?.category,
                messageMode
              );

              return (
                <div
                  key={message.id}
                  className={`messageRow ${
                    message.role === "user"
                      ? "messageRowUser"
                      : "messageRowAssistant"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="miniAvatar">
                      {messageMode === "john" ? "🧠" : "🎨"}
                    </div>
                  )}

                  <div
                    className={`messageBubble ${
                      message.role === "user"
                        ? "messageBubbleUser"
                        : `messageBubbleAssistant ${categoryClass}`
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="messageTextGroup">
                        <div className="assistantCardTop">
                          <span className="assistantCategoryBadge">
                            {categoryLabel}
                          </span>

                          <h3 className="assistantSubject">
                            {messageMode === "john"
                              ? "John"
                              : message.metadata?.subject || "AI Art Studio"}
                          </h3>
                        </div>

                        {formatMessageParagraphs(message.text).map(
                          (paragraph, index) => (
                            <p key={index} className="messageParagraph">
                              {paragraph}
                            </p>
                          )
                        )}

                        {message.images && message.images.length > 0 && (
                          <div className="imageGrid">
                            {message.images.map((img, index) => (
                              <img
                                key={index}
                                src={img.url}
                                alt={img.title || "Art inspiration"}
                                className="artImage"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="messageParagraph">{message.text}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="messageRow messageRowAssistant">
                <div className="miniAvatar">
                  {conversationMode === "john" ? "🧠" : "🎨"}
                </div>

                <div className="messageBubble messageBubbleAssistant assistantCardDefault typingBubble">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="chatInputBar">
            <button
              type="button"
              className={`micChatButton ${
                isListening ? "micChatButtonActive" : ""
              }`}
              onClick={handleMicClick}
              disabled={loading || !speechSupported}
              aria-label={isListening ? "Stop listening" : "Start voice input"}
              title={isListening ? "Stop listening" : "Start voice input"}
            >
              <img src="/mic-icon.svg" alt="Mic" className="micIconImage" />
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                conversationMode === "john"
                  ? 'John is here. Talk to him naturally or say "goodbye john"...'
                  : 'Ask anything. Say "Hey John" to call him or "goodbye john" to send him away...'
              }
              className="chatInput"
              disabled={loading || isListening}
            />

            <button
              type="submit"
              className="sendChatButton"
              disabled={loading || isListening || !input.trim()}
            >
              <span className="sendIcon">→</span>
            </button>
          </form>

          {input.trim() && (
            <div className="logQuestionCheckSection">
              <div className="logQuestionCheckHeader">
                <h3 className="logQuestionCheckTitle">Related Log Matches</h3>
                <span className="logQuestionCheckCount">{logMatches.length}</span>
              </div>

              {logMatches.length === 0 ? (
                <p className="logQuestionCheckEmpty">
                  No strong matches found in previous conversation logs.
                </p>
              ) : (
                <div className="logQuestionCheckList">
                  {logMatches.map((match) => (
                    <div key={match.userEntry.id} className="logQuestionCheckCard">
                      <div className="logQuestionCheckScore">
                        Match {Math.round(match.score * 100)}%
                      </div>

                      <div className="logQuestionCheckBlock">
                        <div className="logQuestionCheckLabel">
                          Previous User Question
                        </div>
                        <p className="logQuestionCheckText">
                          {match.userEntry.text}
                        </p>
                      </div>

                      {match.aiEntry && (
                        <div className="logQuestionCheckBlock">
                          <div className="logQuestionCheckLabel">
                            Related AI Answer
                          </div>
                          <p className="logQuestionCheckText">
                            {match.aiEntry.text}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="conversationLogsSection">
            <div className="conversationLogsTopBar">
              <div className="conversationLogsTopLeft">
                <button
                  type="button"
                  onClick={toggleConversationLogs}
                  className="logsToggleButton"
                >
                  {logsOpen ? "Hide Conversation Logs" : "Show Conversation Logs"}
                </button>

                <div className="logsSummaryBadges">
                  <span className="logsSummaryBadge">
                    User {userConversationLog.length}
                  </span>
                  <span className="logsSummaryBadge">
                    AI {aiConversationLog.length}
                  </span>
                </div>
              </div>

              {logsOpen && (
                <button
                  type="button"
                  onClick={clearConversationLogs}
                  className="clearLogsButton"
                >
                  Clear Conversation Logs
                </button>
              )}
            </div>

            {logsOpen && (
              <div className="logsGrid">
                <section className="logPanel logPanelUser">
                  <div className="logPanelHeader">
                    <h3 className="logPanelTitle">User Inputs</h3>
                    <span className="logPanelCount">
                      {userConversationLog.length}
                    </span>
                  </div>

                  <div className="logScrollArea">
                    {userConversationLog.length === 0 ? (
                      <p className="logEmpty">No user input stored yet.</p>
                    ) : (
                      <ul className="logList">
                        {userConversationLog.map((entry) => (
                          <li key={entry.id} className="logItem">
                            <div className="logItemTop">
                              <span className="logItemSource">{entry.source}</span>
                              <span className="logItemTime">
                                {new Date(entry.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="logItemText">{entry.text}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>

                <section className="logPanel logPanelAI">
                  <div className="logPanelHeader">
                    <h3 className="logPanelTitle">AI Outputs</h3>
                    <span className="logPanelCount">
                      {aiConversationLog.length}
                    </span>
                  </div>

                  <div className="logScrollArea">
                    {aiConversationLog.length === 0 ? (
                      <p className="logEmpty">No AI output stored yet.</p>
                    ) : (
                      <ul className="logList">
                        {aiConversationLog.map((entry) => (
                          <li key={entry.id} className="logItem">
                            <div className="logItemTop">
                              <span className="logItemSource">
                                {entry.speakerMode === "john" ? "John" : "AI"}
                              </span>
                              <span className="logItemTime">
                                {new Date(entry.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="logItemText">{entry.text}</p>
                            {entry.metadata?.subject && (
                              <div className="logItemMeta">
                                {entry.speakerMode === "john"
                                  ? "John"
                                  : entry.metadata.subject}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        <aside className="canvasPanel">
          <div className="canvasPanelInner">
            <div className="canvasHeader">
              <div className="canvasHeaderTop">
                <span className="canvasBadge">Live Canvas</span>
                <span className="canvasStatus">
                  {loading
                    ? "Updating..."
                    : cameraBusy
                    ? "Sketching..."
                    : canvasImages.length > 0
                    ? "Ready"
                    : "Empty"}
                </span>
              </div>

              <h2 className="canvasTitle">{canvasTitle}</h2>
              <p className="canvasPromptText">
                {canvasPrompt || "Your next visual idea will appear here."}
              </p>
            </div>

            <div className="cameraToolCard">
              <div className="cameraToolTop">
                <h3>Camera Sketch Tool</h3>
                <span className={`opencvPill ${opencvReady ? "opencvReady" : ""}`}>
                  {opencvReady ? "OpenCV Ready" : "Loading OpenCV"}
                </span>
              </div>

              <p className="cameraToolText">
                Capture a real world frame and convert it into a sketch for the canvas.
              </p>

              {cameraError && <p className="cameraErrorText">{cameraError}</p>}

              <div className="cameraActions">
                <button
                  type="button"
                  className="canvasActionButton"
                  onClick={() => void startCamera()}
                  disabled={cameraOpen || !opencvReady || cameraBusy}
                >
                  Open Camera
                </button>

                <button
                  type="button"
                  className="canvasActionButton"
                  onClick={processCurrentFrameToSketch}
                  disabled={!cameraOpen || !opencvReady || cameraBusy}
                >
                  Capture Sketch
                </button>

                <button
                  type="button"
                  className="canvasActionButton canvasActionButtonSecondary"
                  onClick={closeCamera}
                  disabled={!cameraOpen}
                >
                  Close Camera
                </button>
              </div>

              {cameraOpen && (
                <div className="cameraPreviewWrap">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="cameraPreview"
                  />
                </div>
              )}

              <canvas ref={captureCanvasRef} className="hiddenCaptureCanvas" />

              {lastCameraCapture && (
                <div className="cameraLastCaptureWrap">
                  <p className="cameraMiniLabel">Last raw frame</p>
                  <img
                    src={lastCameraCapture}
                    alt="Last camera frame"
                    className="cameraLastCapture"
                  />
                </div>
              )}
            </div>

            <div className="canvasBody">
              {loading && canvasImages.length === 0 ? (
                <div className="canvasEmptyState">
                  <div className="canvasEmptyIcon">🎨</div>
                  <p className="canvasEmptyTitle">Building your concept</p>
                  <p className="canvasEmptySubtitle">
                    The studio is preparing visual references for your idea.
                  </p>
                </div>
              ) : canvasImages.length > 0 ? (
                <div className="canvasGrid">
                  {canvasImages.map((img, index) => (
                    <div key={index} className="canvasImageCard">
                      <img
                        src={img.url}
                        alt={img.title || "Canvas preview"}
                        className="canvasImage"
                      />
                      {img.title && (
                        <p className="canvasImageCaption">{img.title}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="canvasEmptyState">
                  <div className="canvasEmptyIcon">🖼️</div>
                  <p className="canvasEmptyTitle">Canvas Preview</p>
                  <p className="canvasEmptySubtitle">
                    Start creating or use the camera tool to send a sketch into the studio.
                  </p>
                </div>
              )}
            </div>

            <div className="canvasActions">
              <button
                type="button"
                className="canvasActionButton"
                onClick={useSketchAsPrompt}
                disabled={loading || !canvasPrompt.trim()}
              >
                Explore This Sketch
              </button>

              <button
                type="button"
                className="canvasActionButton canvasActionButtonSecondary"
                onClick={() => {
                  setCanvasImages([]);
                  setCanvasPrompt("");
                  setCanvasTitle("Canvas Preview");
                  setLastCameraCapture(null);
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}