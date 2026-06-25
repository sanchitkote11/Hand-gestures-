/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Point {
  x: number;
  y: number;
}

export interface HandMetric {
  id: number;
  handedness: string; // "Left" | "Right" | "Unknown"
  confidence: number; // 0 to 100
  gesture: string;
  palmCenter: Point; // normalized 0..1
  pinchDistance: number;
  color: string;
  colorName: string;
}

declare global {
  interface Window {
    Hands: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}
