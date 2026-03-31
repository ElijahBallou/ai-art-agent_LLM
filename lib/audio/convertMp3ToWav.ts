import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";

export async function convertMp3ToWav(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const resolvedFfmpegPath = ffmpegPath;

  if (!resolvedFfmpegPath) {
    throw new Error("FFmpeg binary not found.");
  }

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(resolvedFfmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-ar",
      "44100",
      "-ac",
      "1",
      outputPath,
    ]);

    let stderr = "";

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
      }
    });
  });
}