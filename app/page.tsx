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
};

type LogMatch = {
  userEntry: UserLogEntry;
  aiEntry?: AILogEntry;
  score: number;
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

function isGoodbyeJohn(text: string) {
  const normalized = text.trim().toLowerCase();

  return (
    /^goodbye[\s,]+john\b/.test(normalized) ||
    /^bye[\s,]+john\b/.test(normalized) ||
    /\bgoodbye[\s,]+john\b/.test(normalized) ||
    /\bbye[\s,]+john\b/.test(normalized)
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

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
  const activationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

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
    return () => {
      if (activationTimeoutRef.current) {
        clearTimeout(activationTimeoutRef.current);
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

    setAiConversationLog((prev) => [
      ...prev,
      {
        id: assistantId,
        text: fullText,
        createdAt: new Date().toISOString(),
        metadata,
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
    const userSaidGoodbyeJohn = isGoodbyeJohn(cleanInput);

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

      setAvatarCommand("idle");

      await wait(50);

      setAvatarCommand("goodbye");
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

    setLoading(true);

    try {
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: cleanedPromptForApi || cleanInput,
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

  function clearConversationLogs() {
    setUserConversationLog([]);
    setAiConversationLog([]);
    localStorage.removeItem("userConversationLog");
    localStorage.removeItem("aiConversationLog");
  }

  function toggleConversationLogs() {
    setLogsOpen((prev) => !prev);
  }

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
            setAvatarCommand("idle");
            setJohnAudioUrl(null);
            setJohnLipSync(null);
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
                ? 'John is online. Say "goodbye john" to send him off.'
                : 'Ask anything or say "Hey John"'}
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
            placeholder='Ask anything. Say "Hey John" to call him or "goodbye john" to send him away...'
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
                            <span className="logItemSource">AI</span>
                            <span className="logItemTime">
                              {new Date(entry.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="logItemText">{entry.text}</p>
                          {entry.metadata?.subject && (
                            <div className="logItemMeta">
                              {entry.metadata.subject}
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
      </section>
    </main>
  );
}