import { spawn } from "child_process";

export async function runRhubarb(
  rhubarbPath: string,
  wavPath: string,
  jsonOutputPath: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const rhubarb = spawn(rhubarbPath, [
      "-f",
      "json",
      "-o",
      jsonOutputPath,
      wavPath,
    ]);

    let stderr = "";

    rhubarb.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    rhubarb.on("error", (error) => {
      reject(error);
    });

    rhubarb.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Rhubarb failed with code ${code}: ${stderr}`));
      }
    });
  });
}