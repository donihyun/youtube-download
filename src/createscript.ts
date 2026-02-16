import { config as loadEnv } from "dotenv";
import * as readline from "readline";
import { pathToFileURL } from "url";
import { generateTimedScriptFromVideo } from "./pipeline.js";

loadEnv();

function secToClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  try {
    const videoFilePath = (await question("Enter video file path: ")).trim();
    const subject = (await question("Enter subject: ")).trim();

    if (!videoFilePath) {
      throw new Error("Video file path is required.");
    }

    console.log("\n=== Direct Video -> Timed Script ===");
    console.log(`Video File: ${videoFilePath}`);
    console.log(`Subject: ${subject || "(none)"}`);
    console.log("\nGenerating timed sentence-by-sentence script...");

    const result = await generateTimedScriptFromVideo(videoFilePath, subject);

    console.log("\n--- JSON ---");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n--- CapCut Paste Format ---");
    result.segments.forEach((seg) => {
      console.log(`[${secToClock(seg.startSec)}-${secToClock(seg.endSec)}] ${seg.sentence}`);
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
