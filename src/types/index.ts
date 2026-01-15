export interface GraphSettings {
  expression: string;
  xRange: [number, number];
  yRange: [number, number];
  zRange: [number, number] | 'auto';
  resolution: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number | null;
}

export interface Example {
  name: string;
  expression: string;
  description: string;
}
