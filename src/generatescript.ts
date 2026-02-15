import type { Scene } from "./types/types.ts";
import type { SceneDescription } from "./description.ts";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

interface VoiceoverScript {
  sceneIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  script: string;
  estimatedWords: number;
  pacing: 'slow' | 'medium' | 'fast';
  emphasis?: string[];
}

interface CombinedScript {
  script: string;
  totalEstimatedWords: number;
  pacing: 'slow' | 'medium' | 'fast';
  emphasis?: string[];
}

async function generateScriptForScene(
  scene: Scene,
  description: SceneDescription,
  topic: string,
  previousScripts: VoiceoverScript[] = [],
  interval: number = 1
): Promise<VoiceoverScript> {
  
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const framePaths: string[] = [];
  const frameCount = Math.ceil(scene.duration / interval);
  
  for (let i = 0; i < frameCount; i++) {
    const framePath = `${scene.framePath}_${i}.jpg`;
    if (fs.existsSync(framePath)) {
      framePaths.push(framePath);
    }
  }

  const parts: any[] = [];

  const narrativeContext = previousScripts.length > 0
    ? `\n\nPrevious narration (for context and flow):\n${previousScripts.slice(-2).map(s => 
        `Scene ${s.sceneIndex + 1}: "${s.script}"`
      ).join('\n')}`
    : '';

  const maxWords = Math.floor(description.duration * 2.5);

  parts.push({
    text: `You are writing Korean voiceover narration for Scene ${description.sceneIndex + 1} of: "${topic}"

**Scene Analysis (from Agent 1):**
- Duration: ${description.duration.toFixed(1)} seconds
- Description: ${description.description}
- Key People: ${description.keyPeople.join(', ') || 'None identified'}
- Actions: ${description.specificActions.join(', ')}
- Visual Elements: ${description.visualElements.join(', ')}
- Mood: ${description.mood}
- Start Time: ${description.startTime.toFixed(1)}s
- End Time: ${description.endTime.toFixed(1)}s${narrativeContext}

**Timing Constraints:**
- Maximum words: ${maxWords} (based on ${description.duration.toFixed(1)}s at 150 WPM)
- Speaking rate: 2.5 words per second
- You MUST fit within this limit

**Requirements:**
1. **Use actual names** - If key people are identified, use their names in Korean (e.g., "르브론 제임스가", "아르만 차루키안이")
2. **Describe specific actions** - Match the specific actions from the analysis
3. **Natural Korean** - Use terms Korean sports/fitness fans understand
4. **Match the mood** - ${description.mood}
5. **Flow from previous narration** - Make it feel connected
6. **Exciting delivery** - This is highlight/educational content

**Pacing guide:**
- Fast: Quick exciting moments (dunks, knockouts, explosive moves)
- Medium: General action, explanations
- Slow: Strategic moments, setup, important context

Here are the frames for visual reference:`
  });

  // Add frames
  for (const framePath of framePaths) {
    const imageBuffer = fs.readFileSync(framePath);
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBuffer.toString('base64')
      }
    });
  }

  parts.push({
    text: `
Return ONLY valid JSON (no markdown, no code blocks):
{
  "script": "Korean voiceover text here",
  "estimatedWords": 25,
  "pacing": "fast",
  "emphasis": ["words", "to", "emphasize"],
  "notes": "any delivery notes"
}`
  });

  const result = await model.generateContent(parts);
  const response = await result.response;
  const text = response.text();
  
  const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleanText);
  return {
    sceneIndex: description.sceneIndex,
    startTime: description.startTime,
    endTime: description.endTime,
    duration: description.duration,
    script: parsed.script,
    estimatedWords: parsed.estimatedWords,
    pacing: parsed.pacing,
    emphasis: parsed.emphasis
  };
}

async function generateAllScripts(
  scenes: Scene[],
  descriptions: SceneDescription[],
  topic: string,
  interval: number = 1
): Promise<CombinedScript> {
  
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    }
  });
  
  console.log(`Generating a single script covering ${descriptions.length} scenes...`);
  
  const parts: any[] = [];

  // Initial prompt
  parts.push({
    text: `You are writing Korean voiceover narration for all scenes of: "${topic}"

I will provide:
1. Analysis from Agent 1 for each scene
2. Visual frames for each scene

Generate one flowing, engaging Korean narration that spans the entire video (not separated by scenes) while matching timing constraints overall.

**Global Requirements:**
- Use actual names in Korean
- Describe specific actions
- Natural Korean sports/fitness terminology
- Create narrative flow between scenes
- Match mood and pacing
- 150 WPM speaking rate (2.5 words/sec)

Return ONLY valid JSON (no markdown, no code blocks):
{
  "script": "Full Korean narration for the whole video as one piece",
  "totalEstimatedWords": 250,
  "pacing": "medium",
  "emphasis": ["word1", "word2"]
}`
  });

  // Add each scene's data
  for (let i = 0; i < descriptions.length; i++) {
    const desc = descriptions[i];
    if (!desc) continue;
    
    const scene = scenes[i];
    if (!scene) continue;
    
    const maxWords = Math.floor(desc.duration * 2.5);
    
    parts.push({
      text: `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE ${i + 1}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Duration: ${desc.duration.toFixed(1)}s
Max Words: ${maxWords}
Time: ${desc.startTime.toFixed(1)}s - ${desc.endTime.toFixed(1)}s

Description: ${desc.description}
Key People: ${desc.keyPeople.join(', ') || 'None'}
Actions: ${desc.specificActions.join(', ')}
Visual Elements: ${desc.visualElements.join(', ')}
Mood: ${desc.mood}

Frames:`
    });
    
    // Add frames
    const frameCount = Math.ceil(scene.duration / interval);
    for (let j = 0; j < frameCount; j++) {
      const framePath = `${scene.framePath}_${j}.jpg`;
      if (fs.existsSync(framePath)) {
        const imageBuffer = fs.readFileSync(framePath);
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBuffer.toString('base64')
          }
        });
      }
    }
  }

  try {
    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text();
    
    const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanText);
    
    const combined: CombinedScript = {
      script: parsed.script,
      totalEstimatedWords: parsed.totalEstimatedWords,
      pacing: parsed.pacing,
      emphasis: parsed.emphasis
    };
    
    console.log(`✓ Generated combined script`);
    return combined;
    
  } catch (error) {
    console.error('Error generating scripts in batch:', error);
    
    // Fallback: Generate individually and merge
    console.log('Falling back to individual script generation and merge...');
    const scripts: VoiceoverScript[] = [];
    
    for (let i = 0; i < descriptions.length; i++) {
      console.log(`Generating script ${i + 1}/${descriptions.length}...`);
      
      try {
        const script = await generateScriptForScene(
          scenes[i]!,
          descriptions[i]!,
          topic,
          scripts,
          interval
        );
        
        scripts.push(script);
        
        // Validate timing
        const wordsPerSecond = script.estimatedWords / script.duration;
        if (wordsPerSecond > 2.5) {
          console.warn(`⚠️  Scene ${i + 1}: Script may be too long`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error generating script for scene ${i + 1}:`, error);
      }
    }
    
    const mergedScript = scripts
      .sort((a, b) => a.sceneIndex - b.sceneIndex)
      .map(s => s.script)
      .join('\n\n');

    return {
      script: mergedScript,
      totalEstimatedWords: scripts.reduce((sum, s) => sum + (s.estimatedWords || 0), 0),
      pacing: 'medium',
      emphasis: scripts.flatMap(s => s.emphasis || [])
    };
  }
}

export { generateScriptForScene, generateAllScripts };
export type { VoiceoverScript, CombinedScript };
