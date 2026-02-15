import type { Scene } from "./types/types.ts";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

interface SceneDescription {
  sceneIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  description: string;
  visualElements: string[];
  mood: string;
  keyPeople: string[];
  specificActions: string[];
}

async function describeScene(
  sceneIndex: number,
  scene: Scene,
  interval: number = 1,
  topic: string = ""
): Promise<SceneDescription> {
  
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  // Collect all frame paths for this scene
  const framePaths: string[] = [];
  const frameCount = Math.ceil(scene.duration / interval);
  
  for (let i = 0; i < frameCount; i++) {
    const framePath = `${scene.framePath}_${i}.jpg`;
    if (fs.existsSync(framePath)) {
      framePaths.push(framePath);
    }
  }

  if (framePaths.length === 0) {
    throw new Error(`No frames found for scene ${sceneIndex}`);
  }

  // Build parts array for Gemini
  const parts: any[] = [];
  
  const topicContext = topic 
    ? `\n\nVideo Topic: "${topic}"\n\nIMPORTANT: Use specific names, locations, and details from this topic. Identify people by their actual names (e.g., "LeBron James", "Arman Tsarukyan"), not "a person" or "someone".` 
    : '';

  // Add initial prompt
  parts.push({
    text: `You are analyzing Scene ${sceneIndex + 1} from a video.

**Scene Info:**
- Duration: ${scene.duration.toFixed(1)} seconds
- Frames provided: ${framePaths.length}${topicContext}

**Task:**
Analyze these frames chronologically to understand what happens across this entire scene.

**Requirements:**
1. **Be SPECIFIC with names** - If the topic mentions people, identify them in the frames
2. **Describe exact actions** - Don't say "exercising", say "doing lateral lunges" or "dribbling between legs"
3. **Track movement/progression** - What changes across the frames?
4. **Identify key people** - Who are the main subjects?
5. **Visual details** - Setting, objects, text visible

Return ONLY valid JSON (no markdown, no code blocks):
{
  "description": "Detailed narrative of what happens in this scene",
  "visualElements": ["specific objects", "settings", "visible text"],
  "mood": "tone/emotion of the scene",
  "keyPeople": ["Actual names of people identified"],
  "specificActions": ["exact action 1", "exact action 2"],
  "keyDetails": "Any other important context"
}`
  });

  // Add all frames
  for (const framePath of framePaths) {
    const imageBuffer = fs.readFileSync(framePath);
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBuffer.toString('base64')
      }
    });
  }

  const result = await model.generateContent(parts);
  const response = await result.response;
  const text = response.text();
  
  // Clean the response (Gemini sometimes adds markdown)
  const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleanText);

  return {
    sceneIndex,
    startTime: scene.startTime,
    endTime: scene.endTime,
    duration: scene.duration,
    description: parsed.description,
    visualElements: parsed.visualElements || [],
    mood: parsed.mood,
    keyPeople: parsed.keyPeople || [],
    specificActions: parsed.specificActions || []
  };
}

// Process all scenes at once (Gemini can handle 3000+ images!)
async function describeAllScenes(
  scenes: Scene[], 
  interval: number = 1, 
  topic: string = ""
): Promise<SceneDescription[]> {
  
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    }
  });
  
  console.log(`Analyzing all ${scenes.length} scenes at once...`);
  
  const parts: any[] = [];
  
  const topicContext = topic 
    ? `\n\nVideo Topic: "${topic}"\n\nIMPORTANT: Use specific names, locations, and details from this topic. Identify people by their actual names.` 
    : '';

  // Add initial prompt
  parts.push({
    text: `You are analyzing ${scenes.length} scenes from a video.${topicContext}

I will show you frames from each scene. For each scene, analyze what's happening.

**Requirements:**
1. Be SPECIFIC with names and details
2. Describe exact actions
3. Identify key people
4. Track progression across frames

Return ONLY valid JSON array (no markdown, no code blocks):
[
  {
    "sceneIndex": 0,
    "description": "...",
    "visualElements": ["..."],
    "mood": "...",
    "keyPeople": ["..."],
    "specificActions": ["..."],
    "keyDetails": "..."
  },
  ...
]`
  });

  // Add all scenes with their frames
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene) continue;
    
    const frameCount = Math.ceil(scene.duration / interval);
    
    parts.push({
      text: `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE ${i + 1}
Duration: ${scene.duration.toFixed(1)}s
Start: ${scene.startTime.toFixed(1)}s
End: ${scene.endTime.toFixed(1)}s
Frames: ${frameCount}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    });
    
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
    
    // Clean the response
    const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanText);
    
    // Add timing info to each scene
    const descriptions: SceneDescription[] = parsed.map((scene: any, i: number) => ({
      sceneIndex: i,
      startTime: scenes[i]?.startTime || 0,
      endTime: scenes[i]?.endTime || 0,
      duration: scenes[i]?.duration || 0,
      description: scene.description,
      visualElements: scene.visualElements || [],
      mood: scene.mood,
      keyPeople: scene.keyPeople || [],
      specificActions: scene.specificActions || []
    }));
    
    for(let desc of descriptions){ 
        console.log(`✓ Analyzed Scene ${desc.sceneIndex + 1}`);
        console.log(`   Visual Elements: ${desc.visualElements.join(", ")}`);
        console.log(`   Mood: ${desc.mood}`);
        console.log(`   Key People: ${desc.keyPeople.join(", ")}`);
        console.log(`   Specific Actions: ${desc.specificActions.join(", ")}`);
    }
    console.log(`✓ Analyzed ${descriptions.length} scenes`);
    return descriptions;
    
  } catch (error) {
    console.error('Error analyzing scenes:', error);
    
    // Fallback: Process scenes individually if batch fails
    console.log('Falling back to individual scene processing...');
    const descriptions: SceneDescription[] = [];
    
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!scene) continue;
      
      console.log(`Analyzing scene ${i + 1}/${scenes.length}...`);
      
      try {
        const description = await describeScene(i, scene, interval, topic);
        descriptions.push(description);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error analyzing scene ${i + 1}:`, error);
      }
    }
    
    return descriptions;
  }
}

export { describeScene, describeAllScenes };
export type { SceneDescription };
