import { NextResponse } from "next/server";
import { Ollama } from "ollama";

type ArtCategory =
  | "artist_identity"
  | "artist_biography"
  | "art_history"
  | "style_analysis"
  | "art_prompt"
  | "creative_inspiration"
  | "artwork_lookup"
  | "general_art_question"
  | "non_art";

type ClassificationResult = {
  isArtRelated: boolean;
  category: ArtCategory;
  subject: string;
  shouldSearchImages: boolean;
  imageSearchQuery: string;
};

const ollama = new Ollama({
  host: "https://ollama.com",
  headers: {
    Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
  },
});

const MODEL_NAME = process.env.OLLAMA_MODEL || "gpt-oss:120b";

const REJECTION_MESSAGE =
  "I am your creative art assistant, so I can only help with art, artists, art history, visual styles, design ideas, drawing, painting, photography, and creative prompts.";

const metaQuestions = [
  "what are you",
  "who are you",
  "what can you do",
  "help",
  "introduce yourself",
];

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function getMetaResponse(text: string) {
  if (
    text.includes("what are you") ||
    text.includes("who are you") ||
    text.includes("introduce yourself")
  ) {
    return "I am your creative AI art assistant. I help turn ideas into visual concepts, polished art prompts, style direction, artist inspiration, and creative guidance.";
  }

  if (text.includes("what can you do") || text.includes("help")) {
    return "I can help with art prompts, painting ideas, drawing concepts, art history, artists, visual styles, photography inspiration, design direction, and turning rough ideas into stronger creative prompts.";
  }

  return null;
}

function isMetaQuestion(text: string) {
  return metaQuestions.some((question) => text.includes(question));
}

async function classifyPrompt(prompt: string): Promise<ClassificationResult> {
  const classifierSystemPrompt = `
You are an art intent classifier.

You must analyze the user's prompt and return ONLY valid JSON.
Do not include markdown.
Do not include explanations.
Do not include extra text.

Your job is to decide:
1. whether the prompt is art related
2. what kind of art related prompt it is
3. what subject it is mainly about
4. whether image search would help
5. what the best image search query should be

Allowed categories:
artist_identity
artist_biography
art_history
style_analysis
art_prompt
creative_inspiration
artwork_lookup
general_art_question
non_art

Rules:
A prompt is art related if it is about art, artists, painting, drawing, design, photography, art history, art movements, art styles, artworks, museums, galleries, or visual inspiration.
Questions about what an artist looks like count as art related.
Questions about who an artist is count as art related.
Requests for prompts, style inspiration, or visual concepts count as art related.

Set shouldSearchImages to true when images would clearly help, especially for:
artist_identity
style_analysis
creative_inspiration
artwork_lookup
art_prompt

Set imageSearchQuery to the best short search phrase for image results.
Examples:
"what does Romare Bearden look like" -> "Romare Bearden portrait"
"tell me about cubism" -> "cubism art examples"
"make me a surreal forest painting prompt" -> "surreal forest painting"

Return JSON in exactly this shape:
{
  "isArtRelated": true,
  "category": "artist_identity",
  "subject": "Romare Bearden",
  "shouldSearchImages": true,
  "imageSearchQuery": "Romare Bearden portrait"
}
`;

  const result = await ollama.chat({
    model: MODEL_NAME,
    stream: false,
    format: "json",
    messages: [
      {
        role: "system",
        content: classifierSystemPrompt,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const raw = result?.message?.content?.trim() || "";

  try {
    const parsed = JSON.parse(raw);

    return {
      isArtRelated: Boolean(parsed.isArtRelated),
      category: parsed.category || "non_art",
      subject: parsed.subject || "",
      shouldSearchImages: Boolean(parsed.shouldSearchImages),
      imageSearchQuery: parsed.imageSearchQuery || "",
    };
  } catch {
    return {
      isArtRelated: false,
      category: "non_art",
      subject: "",
      shouldSearchImages: false,
      imageSearchQuery: "",
    };
  }
}

function buildResponseSystemPrompt(category: ArtCategory, source: string) {
  if (source === "voice") {
    return `
You are a creative AI art assistant.

The user spoke naturally, so their wording may be rough or incomplete.

Your job is to help in a clear, stylish, easy to read way.

Response rules:
Keep the writing visually clean.
Use short paragraphs.
Do not use markdown symbols like ** or ##.
Do not write giant walls of text.
If the request is about a visual concept, prompt, or inspiration, make the result vivid and useful.
If the request is about an artist or style, answer clearly and directly.
`;
  }

  switch (category) {
    case "artist_identity":
      return `
You are a creative AI art assistant.

The user is asking what an artist looks like.
Describe the artist's appearance clearly, briefly, and naturally.
Keep it visually clean and easy to read.
Use short paragraphs.
Do not use markdown.
Do not over explain.
`;

    case "artist_biography":
      return `
You are a creative AI art assistant.

The user is asking about an artist.
Give a concise, engaging explanation of who they are and why they matter.
Keep it clean and easy to read.
Use short paragraphs.
Do not use markdown.
`;

    case "art_history":
      return `
You are a creative AI art assistant.

The user is asking about art history.
Explain the topic clearly and accessibly.
Keep it clean and easy to read.
Use short paragraphs.
Do not use markdown.
`;

    case "style_analysis":
      return `
You are a creative AI art assistant.

The user is asking about an art style or movement.
Describe what it is, what it looks like, and what defines it.
Keep it clean and easy to read.
Use short paragraphs.
Do not use markdown.
`;

    case "art_prompt":
      return `
You are a creative AI art assistant.

The user wants an art prompt.
Turn their idea into a vivid, polished visual prompt.
When useful, include subject, mood, lighting, composition, color palette, medium, and atmosphere.
Keep it clean and easy to read.
Do not use markdown.
`;

    case "creative_inspiration":
      return `
You are a creative AI art assistant.

The user wants inspiration.
Give imaginative, useful, visually rich ideas.
Keep it clean and easy to read.
Use short paragraphs.
Do not use markdown.
`;

    case "artwork_lookup":
      return `
You are a creative AI art assistant.

The user is asking about an artwork or visual reference.
Answer clearly and directly.
Keep it clean and easy to read.
Use short paragraphs.
Do not use markdown.
`;

    default:
      return `
You are a creative, warm, stylish AI art assistant.

You may only answer topics related to art, artists, art history, drawing, painting, illustration, design, photography, sculpture, animation, color theory, composition, aesthetics, digital art, creative direction, visual storytelling, and art prompt writing.

Keep answers visually clean and easy to read.
Prefer short paragraphs over long blocks.
Do not use markdown symbols like ** or ##.
Keep most responses between 2 and 6 sentences unless the user asks for more detail.
`;
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.OLLAMA_API_KEY) {
      return NextResponse.json(
        {
          response: "Missing OLLAMA_API_KEY in the server environment.",
          metadata: {
            isArtRelated: false,
            category: "non_art",
            subject: "",
            shouldSearchImages: false,
            imageSearchQuery: "",
          },
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    const prompt = body?.prompt;
    const source = body?.source ?? "text";

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        {
          response: "Please enter a valid art related question.",
          metadata: {
            isArtRelated: false,
            category: "non_art",
            subject: "",
            shouldSearchImages: false,
            imageSearchQuery: "",
          },
        },
        { status: 400 }
      );
    }

    const cleanPrompt = prompt.trim();
    const normalized = normalizeText(cleanPrompt);

    if (!cleanPrompt) {
      return NextResponse.json(
        {
          response: "Please enter a valid art related question.",
          metadata: {
            isArtRelated: false,
            category: "non_art",
            subject: "",
            shouldSearchImages: false,
            imageSearchQuery: "",
          },
        },
        { status: 400 }
      );
    }

    if (isMetaQuestion(normalized)) {
      const metaResponse = getMetaResponse(normalized);

      return NextResponse.json({
        response: metaResponse,
        metadata: {
          isArtRelated: true,
          category: "general_art_question",
          subject: "assistant_identity",
          shouldSearchImages: false,
          imageSearchQuery: "",
        },
      });
    }

    const classification = await classifyPrompt(cleanPrompt);

    if (!classification.isArtRelated || classification.category === "non_art") {
      return NextResponse.json(
        {
          response: REJECTION_MESSAGE,
          metadata: classification,
        },
        { status: 400 }
      );
    }

    const responseSystemPrompt = buildResponseSystemPrompt(
      classification.category,
      source
    );

    const result = await ollama.chat({
      model: MODEL_NAME,
      stream: false,
      messages: [
        {
          role: "system",
          content: responseSystemPrompt,
        },
        {
          role: "user",
          content: cleanPrompt,
        },
      ],
    });

    const content = result?.message?.content?.trim();

    return NextResponse.json({
      response: content || "No response from model.",
      metadata: classification,
    });
  } catch (error) {
    console.error("Ollama error:", error);

    return NextResponse.json(
      {
        response: "Error talking to Ollama.",
        metadata: {
          isArtRelated: false,
          category: "non_art",
          subject: "",
          shouldSearchImages: false,
          imageSearchQuery: "",
        },
      },
      { status: 500 }
    );
  }
}