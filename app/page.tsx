"use client";

import { useEffect, useRef, useState } from "react";
import AvatarViewer from "@/components/AvatarViewer";

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

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

function formatMessageParagraphs(text: string) {
  const cleaned = cleanAssistantText(text);

  return cleaned
    .split(/\n\s*\n|\n(?=\d+\.)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getCategoryLabel(category?: ChatMetadata["category"]) {
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

function getCategoryClass(category?: ChatMetadata["category"]) {
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

function startsWithHeyJohn(text: string) {
  const normalized = text.trim().toLowerCase();
  return normalized.startsWith("hey john") || normalized.startsWith("hey, john");
}

function stripWakePhrase(text: string) {
  return text
    .trim()
    .replace(/^hey,\s*john[:,]?\s*/i, "")
    .replace(/^hey\s+john[:,]?\s*/i, "")
    .trim();
}

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const [johnAwake, setJohnAwake] = useState(false);
  const [avatarCommand, setAvatarCommand] = useState<"idle" | "activate">(
    "idle"
  );

  const [johnAudioUrl, setJohnAudioUrl] = useState<string | null>(null);
  const [johnLipSync, setJohnLipSync] = useState<LipSyncData | null>(null);

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
    },
  ]);

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const autoSendingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if (activationTimeoutRef.current) {
        clearTimeout(activationTimeoutRef.current);
      }
    };
  }, []);

  async function typeAssistantMessage(
    fullText: string,
    images: { url: string; title?: string }[] = [],
    metadata?: ChatMetadata
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
          ? { ...message, images, metadata }
          : message
      )
    );
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
    try {
      const res = await fetch("/api/john-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("john-speech failed:", data.error);
        return;
      }

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
    } catch (error) {
      console.error("Failed to generate John speech:", error);
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

    const userCalledJohn = startsWithHeyJohn(cleanInput);

    if (!johnAwake && !userCalledJohn) {
      const userMessage: ChatMessage = {
        id: Date.now(),
        role: "user",
        text: cleanInput,
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");

      await wait(500);
      await typeAssistantMessage(
        'Say "Hey John" first to bring your assistant on screen.',
        [],
        {
          isArtRelated: true,
          category: "general_art_question",
          subject: "Wake John",
          shouldSearchImages: false,
          imageSearchQuery: "",
        }
      );

      return;
    }

    if (userCalledJohn && !johnAwake) {
      setJohnAwake(true);
    }

    if (activationTimeoutRef.current) {
      clearTimeout(activationTimeoutRef.current);
    }

    const cleanedPromptForApi = userCalledJohn
      ? stripWakePhrase(cleanInput)
      : cleanInput;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      text: cleanInput,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: cleanedPromptForApi || "Hello John",
          source,
        }),
      });

      const data = await chatRes.json();
      const metadata: ChatMetadata | undefined = data.metadata;

      let images: { url: string; title?: string }[] = [];

      if (
        metadata?.isArtRelated &&
        metadata?.shouldSearchImages &&
        metadata?.imageSearchQuery
      ) {
        images = await fetchImages(metadata.imageSearchQuery);
      }

      const assistantText = data.response ?? "No response";

      await wait(1400);
      await typeAssistantMessage(assistantText, images, metadata);

      if (johnAwake || userCalledJohn) {
        await generateJohnSpeech(assistantText);
      }
    } catch {
      await wait(1400);
      await typeAssistantMessage("Something went wrong.");
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
        }
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
  }, [loading, johnAwake]);

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

  return (
    <main className="chatPage">
      {johnAwake && (
        <AvatarViewer
          active={johnAwake}
          command={avatarCommand}
          audioUrl={johnAudioUrl}
          lipSync={johnLipSync}
        />
      )}

      <div className="chatGlow chatGlowOne" />
      <div className="chatGlow chatGlowTwo" />

      <div className="artBackdrop artBackdropOne" />
      <div className="artBackdrop artBackdropTwo" />
      <div className="artTexture" />
      <div className="floatingFrame floatingFrameOne" />
      <div className="floatingFrame floatingFrameTwo" />

      <section className="chatShell">
        <header className="chatHeader">
          <div className="chatAvatar">🎨</div>

          <div className="chatHeaderText">
            <h1>AI Art Studio</h1>
            <p>
              {isListening
                ? "Listening..."
                : loading
                ? "Designing your idea..."
                : johnAwake
                ? "John is online"
                : 'Say "Hey John"'}
            </p>
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
            const categoryLabel = getCategoryLabel(message.metadata?.category);
            const categoryClass = getCategoryClass(message.metadata?.category);

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
                  <div className="miniAvatar">🎨</div>
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

                        {message.metadata?.subject && (
                          <h3 className="assistantSubject">
                            {message.metadata.subject}
                          </h3>
                        )}
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
              <div className="miniAvatar">🎨</div>

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
            placeholder='Type "Hey John" to bring him on screen...'
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
      </section>
    </main>
  );
}