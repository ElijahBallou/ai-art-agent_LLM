import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { convertMp3ToWav } from "@/lib/audio/convertMp3ToWav";
import { runRhubarb } from "@/lib/audio/runRhubarb";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text?.trim()) {
      return NextResponse.json(
        { error: "Missing text for John speech generation." },
        { status: 400 }
      );
    }

    const elevenApiKey = process.env.ELEVENLABS_API_KEY;
    const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!elevenApiKey || !elevenVoiceId) {
      return NextResponse.json(
        { error: "Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID." },
        { status: 500 }
      );
    }

    const publicAudioDir = path.join(process.cwd(), "public", "audio");
    const publicLipDir = path.join(process.cwd(), "public", "lipsync");

    await mkdir(publicAudioDir, { recursive: true });
    await mkdir(publicLipDir, { recursive: true });

    const baseName = `john-${Date.now()}`;
    const mp3Path = path.join(publicAudioDir, `${baseName}.mp3`);
    const wavPath = path.join(publicAudioDir, `${baseName}.wav`);
    const lipSyncPath = path.join(publicLipDir, `${baseName}.json`);

    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
        }),
      }
    );

    if (!elevenRes.ok) {
      const errorText = await elevenRes.text();
      return NextResponse.json(
        { error: `ElevenLabs failed: ${errorText}` },
        { status: 500 }
      );
    }

    console.log("API KEY EXISTS:", !!process.env.ELEVENLABS_API_KEY);
    console.log("VOICE ID EXISTS:", !!process.env.ELEVENLABS_VOICE_ID);

    const audioBuffer = Buffer.from(await elevenRes.arrayBuffer());
    await writeFile(mp3Path, audioBuffer);

    await convertMp3ToWav(mp3Path, wavPath);

    const rhubarbPath = path.join(
      process.cwd(),
      "tools",
      "Rhubarb-Lip-Sync-1.14.0-Windows",
      "Rhubarb-Lip-Sync-1.14.0-Windows",
      "rhubarb.exe"
    );

    await runRhubarb(rhubarbPath, wavPath, lipSyncPath);

    const lipSync = JSON.parse(await readFile(lipSyncPath, "utf8"));

    return NextResponse.json({
      text,
      audioUrl: `/audio/${baseName}.wav`,
      lipSyncUrl: `/lipsync/${baseName}.json`,
      lipSync,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message || "Failed to generate John audio and lip sync.",
      },
      { status: 500 }
    );
  }
}