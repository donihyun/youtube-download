import { config as loadEnv } from "dotenv";
import * as readline from "readline";
import { pathToFileURL } from "url";
import { detectSceneChanges, extractFrames } from "./scene.js";
import { describeAllScenes } from "./description.js";
import { generateAllScripts } from "./generatescript.js";
import type { CombinedScript } from "./generatescript.js";
loadEnv();

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
    const videoFilePath = await question("Enter video file path: ");
    const topic = await question("Enter topic: ");

    console.log("\n=== Script ===");
    console.log(`Video File: ${videoFilePath}`);
    console.log(`Topic: ${topic}`);
    console.log("\nGenerating script based on your inputs...");

    const interval = 1;
    const scenes = await detectSceneChanges(videoFilePath, question);

    if (scenes.length === 0) {
      console.log("No scenes detected. Exiting.");
      return;
    }

    console.log("Extracting frames for detected scenes...");
    await extractFrames(videoFilePath, scenes, interval);
    console.log("Describing scenes...");
    const descriptions = await describeAllScenes(scenes, interval, topic);
    console.log("Generating combined script...");
    const scriptResult: CombinedScript = await generateAllScripts(scenes, descriptions, topic, interval);

    console.log(`\n--- Combined Script ---`);
    console.log(`Pacing: ${scriptResult.pacing} | Estimated Words: ${scriptResult.totalEstimatedWords}`);
    if (scriptResult.emphasis?.length) {
      console.log(`Emphasis: ${scriptResult.emphasis.join(", ")}`);
    }
    console.log(scriptResult.script);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    rl.close();
  }
}

// Run when executed directly (ESM-safe)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
