import { NextResponse } from "next/server";
import { Ollama } from "ollama";

type ConversationPersona = "studio" | "john";

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

function isMetaQuestion(text: string) {
  return metaQuestions.some((question) => text.includes(question));
}

function getMetaResponse(text: string, persona: ConversationPersona) {
  if (persona === "john") {
    if (
      text.includes("what are you") ||
      text.includes("who are you") ||
      text.includes("introduce yourself")
    ) {
      return "I am John. I am here with you as a creative guide to help shape ideas, explore artists, build visual concepts, and turn rough thoughts into strong art direction.";
    }

    if (text.includes("what can you do") || text.includes("help")) {
      return "I can help you develop art prompts, visual concepts, artist inspiration, style direction, art history questions, and stronger creative ideas. While I am here, I lead the conversation directly as John.";
    }

    return null;
  }

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

function buildStudioResponseSystemPrompt(category: ArtCategory, source: string) {
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

function buildJohnResponseSystemPrompt(category: ArtCategory, source: string) {
  const sharedJohnIdentity = `
You are John.

You are present in the conversation and you have taken over the interaction.
You are not a generic assistant.
You are not narrating from a distance.
You are John speaking directly to the user.

Your tone is warm, confident, calm, natural, and personal.
You should feel like a present creative collaborator.
Keep the writing clean and easy to read.
Use short paragraphs.
Do not use markdown symbols like ** or ##.
Do not say you are an AI unless directly asked.
Do not refer to yourself as "the assistant" unless directly asked.
Stay in character as John.

When responding as John, condense the information into a natural spoken reply.
Do not ramble.
Do not sound like an essay.
Keep the answer focused, conversational, and easy to say out loud.
Prefer 2 to 5 spoken style sentences unless the user asks for more detail.

You may only answer topics related to art, artists, art history, drawing, painting, illustration, design, photography, sculpture, animation, color theory, composition, aesthetics, digital art, creative direction, visual storytelling, and art prompt writing.
`;

  if (source === "voice") {
    return `
${sharedJohnIdentity}

The user spoke naturally, so their wording may be rough or incomplete.

Respond like John is physically present and listening.
Be direct, natural, and conversational.
Do not sound robotic.
`;
  }

  switch (category) {
    case "artist_identity":
      return `
${sharedJohnIdentity}

The user is asking what an artist looks like.
Answer clearly, naturally, and briefly.
Describe the appearance in a grounded and conversational way, as John.
`;

    case "artist_biography":
      return `
${sharedJohnIdentity}

The user is asking about an artist.
Explain who they are and why they matter in a concise, engaging way.
Sound like John talking directly to the user.
`;

    case "art_history":
      return `
${sharedJohnIdentity}

The user is asking about art history.
Explain it clearly and accessibly, as John.
Keep it natural, informed, and easy to follow.
`;

    case "style_analysis":
      return `
${sharedJohnIdentity}

The user is asking about an art style or movement.
Describe what it is, what it looks like, and what defines it.
Make it feel like John is guiding the user through the style.
`;

    case "art_prompt":
      return `
${sharedJohnIdentity}

The user wants an art prompt.
Turn the idea into a vivid, polished visual prompt.
When useful, include subject, mood, lighting, composition, color palette, medium, and atmosphere.
Make it feel like John is actively shaping the concept with the user.
`;

    case "creative_inspiration":
      return `
${sharedJohnIdentity}

The user wants inspiration.
Give imaginative, useful, visually rich ideas.
Sound like John is helping brainstorm in real time.
`;

    case "artwork_lookup":
      return `
${sharedJohnIdentity}

The user is asking about an artwork or visual reference.
Answer clearly and directly.
Keep it natural and grounded, as John.
`;

    default:
      return `
${sharedJohnIdentity}
`;
  }
}

function buildResponseSystemPrompt(
  category: ArtCategory,
  source: string,
  persona: ConversationPersona
) {
  if (persona === "john") {
    return buildJohnResponseSystemPrompt(category, source);
  }

  return buildStudioResponseSystemPrompt(category, source);
}

function encoderLine(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
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
    const persona: ConversationPersona =
      body?.persona === "john" ? "john" : "studio";

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
      const metaResponse = getMetaResponse(normalized, persona);

      return NextResponse.json({
        response: metaResponse,
        metadata: {
          isArtRelated: true,
          category: "general_art_question",
          subject: persona === "john" ? "john_identity" : "assistant_identity",
          shouldSearchImages: false,
          imageSearchQuery: "",
        },
      });
    }

    const classification = await classifyPrompt(cleanPrompt);

    if (!classification.isArtRelated || classification.category === "non_art") {
      return NextResponse.json(
        {
          response:
            persona === "john"
              ? "I’m here with you, but I only handle art related topics. Ask me about artists, visual styles, art history, drawing ideas, painting concepts, photography, design, or creative prompts."
              : REJECTION_MESSAGE,
          metadata: classification,
        },
        { status: 400 }
      );
    }

    const responseSystemPrompt = buildResponseSystemPrompt(
      classification.category,
      source,
      persona
    );

    const streamResult = await ollama.chat({
      model: MODEL_NAME,
      stream: true,
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

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            encoderLine({
              type: "meta",
              metadata: classification,
              persona,
            })
          )
        );

        try {
          for await (const chunk of streamResult) {
            const content = chunk?.message?.content ?? "";

            if (content) {
              controller.enqueue(
                encoder.encode(
                  encoderLine({
                    type: "chunk",
                    content,
                  })
                )
              );
            }
          }

          controller.enqueue(
            encoder.encode(
              encoderLine({
                type: "done",
              })
            )
          );
        } catch (streamError) {
          controller.enqueue(
            encoder.encode(
              encoderLine({
                type: "error",
                message: "Error talking to Ollama.",
              })
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
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