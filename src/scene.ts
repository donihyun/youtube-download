import { exec } from 'child_process';
import util from 'util';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const execPromise = util.promisify(exec);

export interface Scene {
    startTime: number;
    endTime: number;
    duration: number;
    framePath: string;
}

export async function detectSceneChanges(
    videoPath: string,
    ask?: (query: string) => Promise<string>
) : Promise<Scene[]> {
    let rl: readline.Interface | undefined;
    const question = ask ?? ((query: string) => {
        if (!rl) rl = readline.createInterface({ input, output });
        return rl.question(query);
    });

    try {
        const changeAnswer = await question(
            'Enter comma-separated scene change timestamps in seconds (exclude 0 and final duration): '
        );

        const durationAnswer = await question(
            'Enter total video duration in seconds: '
        );

        const totalDuration = parseFloat(durationAnswer.trim());
        if (Number.isNaN(totalDuration) || totalDuration <= 0) {
            throw new Error('Total duration must be a positive number.');
        }

        const changeTimes = changeAnswer
            .split(',')
            .map(time => parseFloat(time.trim()))
            .filter(time => !Number.isNaN(time) && time > 0 && time < totalDuration);

        const timestamps = [0, ...Array.from(new Set(changeTimes)).sort((a, b) => a - b), totalDuration];

        const scenes: Scene[] = [];
        for (let i = 0; i < timestamps.length - 1; i++) {
            const start = timestamps[i] ?? 0;
            const end = timestamps[i + 1] ?? 0;
            if (end <= start) continue;

            scenes.push({
                startTime: start,
                endTime: end,
                duration: end - start,
                framePath: `scene_${i}`
            });
        }

        if (scenes.length === 0) {
            throw new Error('No valid scenes could be created from the provided timestamps.');
        }

        console.log(`Detected ${scenes.length} scene(s) from provided timestamps.`);
        return scenes;
    } finally {
        if (!ask && rl) {
            rl.close();
        }
    }
}

export async function extractFrames(videoPath: string, scenes: Scene[], interval: number = 1): Promise<void> {
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene) continue;
    let index = 0;
    for (let t = scene.startTime; t < scene.endTime; t += interval) {
      const time = Math.min(t, scene.endTime);
      await execPromise(
        `ffmpeg -ss ${time} -i "${videoPath}" -frames:v 1 -q:v 2 "${scene.framePath}_${index}.jpg"`
      );
      index++;
    }
    console.log(`Extracted ${index + 1} frames for scene ${i + 1}/${scenes.length}`);
  }
  
}
