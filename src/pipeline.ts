import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import fs from "fs";
import path from "path";

export interface TimedSegment {
  startSec: number;
  endSec: number;
  durationSec: number;
  sentence: string;
}

export interface TimedScriptResult {
  totalDurationSec: number;
  segments: TimedSegment[];
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mkv") return "video/x-matroska";
  if (ext === ".webm") return "video/webm";
  return "application/octet-stream";
}

async function waitUntilFileReady(fileManager: GoogleAIFileManager, fileName: string): Promise<void> {
  const maxAttempts = 60;
  const sleepMs = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const meta = await fileManager.getFile(fileName);
    const state = (meta as any)?.state;

    if (!state || state === "ACTIVE") return;
    if (state === "FAILED") {
      throw new Error("Gemini file processing failed.");
    }

    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }

  throw new Error("Timed out waiting for Gemini to process video file.");
}

function parseJsonResponse(raw: string): TimedScriptResult {
  const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(clean);

  const totalDurationSec = Number(parsed.totalDurationSec || 0);
  const segments: TimedSegment[] = Array.isArray(parsed.segments)
    ? parsed.segments
        .map((s: any) => ({
          startSec: Number(s.startSec || 0),
          endSec: Number(s.endSec || 0),
          durationSec: Number(s.durationSec || 0),
          sentence: String(s.sentence || "").trim(),
        }))
        .filter((s: TimedSegment) => s.endSec > s.startSec && s.sentence.length > 0)
    : [];

  if (segments.length === 0) {
    throw new Error("Gemini did not return valid segments.");
  }

  return {
    totalDurationSec,
    segments,
  };
}

export async function generateTimedScriptFromVideo(
  videoFilePath: string,
  subject: string
): Promise<TimedScriptResult> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is not set. Add it to .env");
  }

  if (!fs.existsSync(videoFilePath)) {
    throw new Error(`Video file not found: ${videoFilePath}`);
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.5,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    },
  });

  const mimeType = getMimeType(videoFilePath);

  const prompt = `당신은 한국어 내레이션 작가입니다.

제공된 영상을 직접 분석해, CapCut TTS에 바로 붙여넣을 수 있는 "문장 단위 시간대본"을 작성하세요.
주제(subject): "${subject || "NBA 하이라이트"}"

기본 톤(고정):
- 유튜브 "잡생각" 느낌의 한국어 톤
- 차분하고 관찰적이며, 가볍게 위트 있는 문장
- 과한 텐션/오버 리액션 금지
- 짧고 깔끔한 문장 위주, 자연스러운 연결감 유지

하드 규칙:
1) 반드시 JSON만 반환 (마크다운/코드블록 금지)
2) 아래 스키마를 정확히 따를 것:
{
  "totalDurationSec": 44.8,
  "segments": [
    {
      "startSec": 0.0,
      "endSec": 3.2,
      "durationSec": 3.2,
      "sentence": "오프닝 문장..."
    }
  ]
}
3) segments는 시간순/비중복이어야 함
4) durationSec = endSec - startSec 를 만족해야 함
5) 영상 전체 구간을 최대한 빠짐없이 커버할 것
6) 각 segment의 sentence는 "한국어 한 문장"만 포함
7) CapCut TTS 기준 자연 속도에 맞게 길이를 조절할 것
8) 식별 가능하면 선수 이름/플레이를 구체적으로 쓸 것
`;

  try {
    const uploaded = await fileManager.uploadFile(videoFilePath, {
      mimeType,
      displayName: path.basename(videoFilePath),
    });

    const fileName = (uploaded as any)?.file?.name;
    const fileUri = (uploaded as any)?.file?.uri;

    if (!fileName || !fileUri) {
      throw new Error("Video upload succeeded but file metadata was incomplete.");
    }

    await waitUntilFileReady(fileManager, fileName);

    const result = await model.generateContent([
      { text: prompt },
      {
        fileData: {
          mimeType,
          fileUri,
        },
      },
    ]);

    const text = await result.response.text();
    return parseJsonResponse(text);
  } catch {
    // Fallback: inline video bytes (works for smaller files)
    const videoBuffer = fs.readFileSync(videoFilePath);
    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType,
          data: videoBuffer.toString("base64"),
        },
      },
    ]);

    const text = await result.response.text();
    return parseJsonResponse(text);
  }
}
