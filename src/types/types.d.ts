export interface SceneDescription {
  sceneIndex: number;
  startTime: number;
  endTime: number;
  description: string;
  visualElements: string[];
  mood: string;
}

export interface Scene {
    startTime: number;
    endTime: number;
    duration: number;
    framePath: string;
}