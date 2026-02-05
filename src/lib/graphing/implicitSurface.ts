import * as THREE from 'three';
import { compile } from 'mathjs';
import { getColorForZWithPalette } from './colors';

/**
 * Marching Cubes implementation for implicit surfaces F(x,y,z) = 0
 * Based on the classic Paul Bourke algorithm
 */

// Preprocess expression for 3 variables: x, y, z
const FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'sqrt', 'exp', 'log', 'log10', 'log2', 'abs', 'ceil', 'floor', 'round', 'sign'];

function preprocessImplicitExpression(expr: string): string {
  let result = expr;

  // Auto-add brackets for functions: sinx -> sin(x), cosy -> cos(y), sinz -> sin(z)
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`(${fn})([xyz])(?![a-z0-9(])`, 'gi'), '$1($2)');
    result = result.replace(new RegExp(`(${fn})([xyz])([+\\-*/^])`, 'gi'), '$1($2)$3');
    result = result.replace(new RegExp(`(${fn})([xyz])$`, 'gi'), '$1($2)');
  });

  // Number followed by variable: 2x -> 2*x
  result = result.replace(/(\d)([xyz])/gi, '$1*$2');
  // Variable followed by number: x2 -> x*2
  result = result.replace(/([xyz])(\d)/gi, '$1*$2');
  // Variable followed by variable: xy -> x*y, xz -> x*z
  result = result.replace(/([xyz])([xyz])/gi, '$1*$2');
  // Number followed by paren: 2( -> 2*(
  result = result.replace(/(\d)\(/g, '$1*(');
  // )( -> )*(
  result = result.replace(/\)\(/g, ')*(');
  // )2 -> )*2
  result = result.replace(/\)(\d)/g, ')*$1');
  // )x -> )*x
  result = result.replace(/\)([xyz])/gi, ')*$1');

  // Variable followed by opening paren (not function): x( -> x*(
  let temp = result;
  FUNCTIONS.forEach((fn, i) => {
    temp = temp.replace(new RegExp(fn + '\\(', 'gi'), `__FN${i}__(`);
  });
  temp = temp.replace(/([xyz])\(/gi, '$1*(');
  FUNCTIONS.forEach((fn, i) => {
    temp = temp.replace(new RegExp(`__FN${i}__\\(`, 'g'), fn + '(');
  });
  result = temp;

  // Number followed by function: 2sin -> 2*sin
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`(\\d)(${fn})\\(`, 'gi'), '$1*$2(');
  });
  // Variable followed by function: xsin -> x*sin
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`([xyz])(${fn})\\(`, 'gi'), '$1*$2(');
  });
  // )sin -> )*sin
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`\\)(${fn})\\(`, 'gi'), ')*$1(');
  });

  // Convert π
  result = result.replace(/π/g, 'pi');

  // Handle e and pi implicit multiplication
  result = result.replace(/([xyz])(e)(?!xp)/gi, '$1*$2');
  result = result.replace(/(\d)(e)(?!xp)/gi, '$1*$2');
  result = result.replace(/\be(?!xp)\(/g, 'e*(');
  result = result.replace(/\be(?!xp)([xyz])/gi, 'e*$1');
  result = result.replace(/\be(?!xp)(\d)/gi, 'e*$1');

  result = result.replace(/([xyz])(pi)\b/gi, '$1*$2');
  result = result.replace(/(\d)(pi)\b/gi, '$1*$2');
  result = result.replace(/\bpi\(/gi, 'pi*(');
  result = result.replace(/\bpi([xyz])/gi, 'pi*$1');
  result = result.replace(/\bpi(\d)/gi, 'pi*$1');

  return result;
}

export function validateImplicitExpression(expression: string): { valid: boolean; error?: string } {
  if (!expression.trim()) {
    return { valid: false, error: 'Expression cannot be empty' };
  }
  try {
    const processed = preprocessImplicitExpression(expression);
    compile(processed);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid expression'
    };
  }
}

export interface ImplicitSurfaceOptions {
  expression: string;  // F(x,y,z), surface is where F = 0
  xRange: [number, number];
  yRange: [number, number];
  zRange: [number, number];
  resolution: number;  // Grid divisions per axis
  functionIndex?: number;
}

export interface ImplicitSurfaceResult {
  geometry: THREE.BufferGeometry;
  transform: {
    xScale: number;
    yScale: number;
    zScale: number;
    xOffset: number;
    yOffset: number;
    zOffset: number;
  };
}

// Marching cubes edge table - which edges are intersected for each cube configuration
// From Paul Bourke's classic lookup tables
const EDGE_TABLE = [
  0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
  0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
  0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
  0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
  0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
  0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
  0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
  0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
  0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c,
  0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
  0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc,
  0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
  0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c,
  0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc,
  0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
  0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
  0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
  0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
  0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
  0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
  0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
  0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
  0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
  0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
  0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
  0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
  0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
  0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
  0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
  0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0
];

// Triangle table - for each cube configuration, lists edges forming triangles
// -1 terminates the list
const TRI_TABLE: number[][] = [
  [-1], [0, 8, 3, -1], [0, 1, 9, -1], [1, 8, 3, 9, 8, 1, -1],
  [1, 2, 10, -1], [0, 8, 3, 1, 2, 10, -1], [9, 2, 10, 0, 2, 9, -1], [2, 8, 3, 2, 10, 8, 10, 9, 8, -1],
  [3, 11, 2, -1], [0, 11, 2, 8, 11, 0, -1], [1, 9, 0, 2, 3, 11, -1], [1, 11, 2, 1, 9, 11, 9, 8, 11, -1],
  [3, 10, 1, 11, 10, 3, -1], [0, 10, 1, 0, 8, 10, 8, 11, 10, -1], [3, 9, 0, 3, 11, 9, 11, 10, 9, -1], [9, 8, 10, 10, 8, 11, -1],
  [4, 7, 8, -1], [4, 3, 0, 7, 3, 4, -1], [0, 1, 9, 8, 4, 7, -1], [4, 1, 9, 4, 7, 1, 7, 3, 1, -1],
  [1, 2, 10, 8, 4, 7, -1], [3, 4, 7, 3, 0, 4, 1, 2, 10, -1], [9, 2, 10, 9, 0, 2, 8, 4, 7, -1], [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1],
  [8, 4, 7, 3, 11, 2, -1], [11, 4, 7, 11, 2, 4, 2, 0, 4, -1], [9, 0, 1, 8, 4, 7, 2, 3, 11, -1], [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1],
  [3, 10, 1, 3, 11, 10, 7, 8, 4, -1], [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1], [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1], [4, 7, 11, 4, 11, 9, 9, 11, 10, -1],
  [9, 5, 4, -1], [9, 5, 4, 0, 8, 3, -1], [0, 5, 4, 1, 5, 0, -1], [8, 5, 4, 8, 3, 5, 3, 1, 5, -1],
  [1, 2, 10, 9, 5, 4, -1], [3, 0, 8, 1, 2, 10, 4, 9, 5, -1], [5, 2, 10, 5, 4, 2, 4, 0, 2, -1], [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1],
  [9, 5, 4, 2, 3, 11, -1], [0, 11, 2, 0, 8, 11, 4, 9, 5, -1], [0, 5, 4, 0, 1, 5, 2, 3, 11, -1], [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1],
  [10, 3, 11, 10, 1, 3, 9, 5, 4, -1], [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1], [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1], [5, 4, 8, 5, 8, 10, 10, 8, 11, -1],
  [9, 7, 8, 5, 7, 9, -1], [9, 3, 0, 9, 5, 3, 5, 7, 3, -1], [0, 7, 8, 0, 1, 7, 1, 5, 7, -1], [1, 5, 3, 3, 5, 7, -1],
  [9, 7, 8, 9, 5, 7, 10, 1, 2, -1], [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1], [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1], [2, 10, 5, 2, 5, 3, 3, 5, 7, -1],
  [7, 9, 5, 7, 8, 9, 3, 11, 2, -1], [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1], [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1], [11, 2, 1, 11, 1, 7, 7, 1, 5, -1],
  [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1], [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1], [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1], [11, 10, 5, 7, 11, 5, -1],
  [10, 6, 5, -1], [0, 8, 3, 5, 10, 6, -1], [9, 0, 1, 5, 10, 6, -1], [1, 8, 3, 1, 9, 8, 5, 10, 6, -1],
  [1, 6, 5, 2, 6, 1, -1], [1, 6, 5, 1, 2, 6, 3, 0, 8, -1], [9, 6, 5, 9, 0, 6, 0, 2, 6, -1], [5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1],
  [2, 3, 11, 10, 6, 5, -1], [11, 0, 8, 11, 2, 0, 10, 6, 5, -1], [0, 1, 9, 2, 3, 11, 5, 10, 6, -1], [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1],
  [6, 3, 11, 6, 5, 3, 5, 1, 3, -1], [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1], [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1], [6, 5, 9, 6, 9, 11, 11, 9, 8, -1],
  [5, 10, 6, 4, 7, 8, -1], [4, 3, 0, 4, 7, 3, 6, 5, 10, -1], [1, 9, 0, 5, 10, 6, 8, 4, 7, -1], [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1],
  [6, 1, 2, 6, 5, 1, 4, 7, 8, -1], [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1], [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1], [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1],
  [3, 11, 2, 7, 8, 4, 10, 6, 5, -1], [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1], [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1], [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1],
  [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1], [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1], [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1], [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1],
  [10, 4, 9, 6, 4, 10, -1], [4, 10, 6, 4, 9, 10, 0, 8, 3, -1], [10, 0, 1, 10, 6, 0, 6, 4, 0, -1], [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1],
  [1, 4, 9, 1, 2, 4, 2, 6, 4, -1], [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1], [0, 2, 4, 4, 2, 6, -1], [8, 3, 2, 8, 2, 4, 4, 2, 6, -1],
  [10, 4, 9, 10, 6, 4, 11, 2, 3, -1], [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1], [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1], [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1],
  [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1], [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1], [3, 11, 6, 3, 6, 0, 0, 6, 4, -1], [6, 4, 8, 11, 6, 8, -1],
  [7, 10, 6, 7, 8, 10, 8, 9, 10, -1], [0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1], [10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1], [10, 6, 7, 10, 7, 1, 1, 7, 3, -1],
  [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1], [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1], [7, 8, 0, 7, 0, 6, 6, 0, 2, -1], [7, 3, 2, 6, 7, 2, -1],
  [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1], [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1], [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1], [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1],
  [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1], [0, 9, 1, 11, 6, 7, -1], [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1], [7, 11, 6, -1],
  [7, 6, 11, -1], [3, 0, 8, 11, 7, 6, -1], [0, 1, 9, 11, 7, 6, -1], [8, 1, 9, 8, 3, 1, 11, 7, 6, -1],
  [10, 1, 2, 6, 11, 7, -1], [1, 2, 10, 3, 0, 8, 6, 11, 7, -1], [2, 9, 0, 2, 10, 9, 6, 11, 7, -1], [6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1],
  [7, 2, 3, 6, 2, 7, -1], [7, 0, 8, 7, 6, 0, 6, 2, 0, -1], [2, 7, 6, 2, 3, 7, 0, 1, 9, -1], [1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1],
  [10, 7, 6, 10, 1, 7, 1, 3, 7, -1], [10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1], [0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1], [7, 6, 10, 7, 10, 8, 8, 10, 9, -1],
  [6, 8, 4, 11, 8, 6, -1], [3, 6, 11, 3, 0, 6, 0, 4, 6, -1], [8, 6, 11, 8, 4, 6, 9, 0, 1, -1], [9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1],
  [6, 8, 4, 6, 11, 8, 2, 10, 1, -1], [1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1], [4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1], [10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1],
  [8, 2, 3, 8, 4, 2, 4, 6, 2, -1], [0, 4, 2, 4, 6, 2, -1], [1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1], [1, 9, 4, 1, 4, 2, 2, 4, 6, -1],
  [8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1], [10, 1, 0, 10, 0, 6, 6, 0, 4, -1], [4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1], [10, 9, 4, 6, 10, 4, -1],
  [4, 9, 5, 7, 6, 11, -1], [0, 8, 3, 4, 9, 5, 11, 7, 6, -1], [5, 0, 1, 5, 4, 0, 7, 6, 11, -1], [11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1],
  [9, 5, 4, 10, 1, 2, 7, 6, 11, -1], [6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1], [7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1], [3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1],
  [7, 2, 3, 7, 6, 2, 5, 4, 9, -1], [9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1], [3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1], [6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1],
  [9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1], [1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1], [4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1], [7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1],
  [6, 9, 5, 6, 11, 9, 11, 8, 9, -1], [3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1], [0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1], [6, 11, 3, 6, 3, 5, 5, 3, 1, -1],
  [1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1], [0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1], [11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1], [6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1],
  [5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1], [9, 5, 6, 9, 6, 0, 0, 6, 2, -1], [1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1], [1, 5, 6, 2, 1, 6, -1],
  [1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1], [10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1], [0, 3, 8, 5, 6, 10, -1], [10, 5, 6, -1],
  [11, 5, 10, 7, 5, 11, -1], [11, 5, 10, 11, 7, 5, 8, 3, 0, -1], [5, 11, 7, 5, 10, 11, 1, 9, 0, -1], [10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1],
  [11, 1, 2, 11, 7, 1, 7, 5, 1, -1], [0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1], [9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1], [7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1],
  [2, 5, 10, 2, 3, 5, 3, 7, 5, -1], [8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1], [9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1], [9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1],
  [1, 3, 5, 3, 7, 5, -1], [0, 8, 7, 0, 7, 1, 1, 7, 5, -1], [9, 0, 3, 9, 3, 5, 5, 3, 7, -1], [9, 8, 7, 5, 9, 7, -1],
  [5, 8, 4, 5, 10, 8, 10, 11, 8, -1], [5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1], [0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1], [10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1],
  [2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1], [0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1], [0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1], [9, 4, 5, 2, 11, 3, -1],
  [2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1], [5, 10, 2, 5, 2, 4, 4, 2, 0, -1], [3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1], [5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1],
  [8, 4, 5, 8, 5, 3, 3, 5, 1, -1], [0, 4, 5, 1, 0, 5, -1], [8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1], [9, 4, 5, -1],
  [4, 11, 7, 4, 9, 11, 9, 10, 11, -1], [0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1], [1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1], [3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4, -1],
  [4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2, -1], [9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1], [11, 7, 4, 11, 4, 2, 2, 4, 0, -1], [11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4, -1],
  [2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1], [9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7, -1], [3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1], [1, 10, 2, 8, 7, 4, -1],
  [4, 9, 1, 4, 1, 7, 7, 1, 3, -1], [4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1], [4, 0, 3, 7, 4, 3, -1], [4, 8, 7, -1],
  [9, 10, 8, 10, 11, 8, -1], [3, 0, 9, 3, 9, 11, 11, 9, 10, -1], [0, 1, 10, 0, 10, 8, 8, 10, 11, -1], [3, 1, 10, 11, 3, 10, -1],
  [1, 2, 11, 1, 11, 9, 9, 11, 8, -1], [3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9, -1], [0, 2, 11, 8, 0, 11, -1], [3, 2, 11, -1],
  [2, 3, 8, 2, 8, 10, 10, 8, 9, -1], [9, 10, 2, 0, 9, 2, -1], [2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1], [1, 10, 2, -1],
  [1, 3, 8, 9, 1, 8, -1], [0, 9, 1, -1], [0, 3, 8, -1], [-1]
];

export function generateImplicitSurface(options: ImplicitSurfaceOptions): ImplicitSurfaceResult {
  const { expression, xRange, yRange, zRange, resolution, functionIndex = 0 } = options;

  const processed = preprocessImplicitExpression(expression);
  const compiled = compile(processed);

  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const [zMin, zMax] = zRange;

  const nx = resolution;
  const ny = resolution;
  const nz = resolution;

  const dx = (xMax - xMin) / nx;
  const dy = (yMax - yMin) / ny;
  const dz = (zMax - zMin) / nz;

  // Evaluate F at all grid points
  const values = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  const getIdx = (i: number, j: number, k: number) => i * (ny + 1) * (nz + 1) + j * (nz + 1) + k;

  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      for (let k = 0; k <= nz; k++) {
        const x = xMin + i * dx;
        const y = yMin + j * dy;
        const z = zMin + k * dz;
        try {
          const val = compiled.evaluate({ x, y, z }) as number;
          values[getIdx(i, j, k)] = (typeof val === 'number' && isFinite(val)) ? val : 1e10;
        } catch {
          values[getIdx(i, j, k)] = 1e10;
        }
      }
    }
  }

  // Normalize to target visual size
  const targetVisualSize = 10;
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const zSpan = zMax - zMin;
  const maxSpan = Math.max(xSpan, ySpan, zSpan);
  const scl = maxSpan > 0 ? targetVisualSize / maxSpan : 1;
  const xOffset = (xMin + xMax) / 2;
  const yOffset = (yMin + yMax) / 2;
  const zOffset = (zMin + zMax) / 2;

  // Run marching cubes
  const vertices: number[] = [];
  const vertexColors: number[] = [];

  // Edge vertex cache to avoid duplicates
  // key: edge identifier, value: vertex index
  const edgeCache = new Map<string, number>();

  function interpolateEdge(
    x1: number, y1: number, z1: number, v1: number,
    x2: number, y2: number, z2: number, v2: number
  ): number[] {
    const t = Math.abs(v1) < 1e-10 ? 0 : Math.abs(v2) < 1e-10 ? 1 : Math.abs(v1 - v2) < 1e-10 ? 0.5 : -v1 / (v2 - v1);
    const tClamped = Math.max(0, Math.min(1, t));
    return [
      x1 + tClamped * (x2 - x1),
      y1 + tClamped * (y2 - y1),
      z1 + tClamped * (z2 - z1)
    ];
  }

  function addVertex(mathX: number, mathY: number, mathZ: number): number {
    const sx = (mathX - xOffset) * scl;
    const sy = (mathY - yOffset) * scl;
    const sz = (mathZ - zOffset) * scl;
    // Three.js: x = math x, y = math z (up), z = math y (depth)
    vertices.push(sx, sz, sy);
    // Color based on math z value
    const color = getColorForZWithPalette(mathZ, zMin, zMax, functionIndex);
    vertexColors.push(color.r, color.g, color.b);
    return (vertices.length / 3) - 1;
  }

  // Corner positions within a cube
  const cornerOffsets = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
  ];

  // Edge connections (pairs of corner indices)
  const edgeConnections = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  const indices: number[] = [];

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        // Get values at 8 corners
        const cornerValues: number[] = [];
        const cornerCoords: number[][] = [];

        for (const [di, dj, dk] of cornerOffsets) {
          cornerValues.push(values[getIdx(i + di, j + dj, k + dk)]);
          cornerCoords.push([
            xMin + (i + di) * dx,
            yMin + (j + dj) * dy,
            zMin + (k + dk) * dz
          ]);
        }

        // Calculate cube index
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          if (cornerValues[c] < 0) cubeIndex |= (1 << c);
        }

        if (EDGE_TABLE[cubeIndex] === 0) continue;

        // Find intersection points on edges
        const edgeVertices: number[] = new Array(12).fill(-1);

        for (let e = 0; e < 12; e++) {
          if (!(EDGE_TABLE[cubeIndex] & (1 << e))) continue;

          const [c1, c2] = edgeConnections[e];
          const edgeKey = `${Math.min(getIdx(i + cornerOffsets[c1][0], j + cornerOffsets[c1][1], k + cornerOffsets[c1][2]), getIdx(i + cornerOffsets[c2][0], j + cornerOffsets[c2][1], k + cornerOffsets[c2][2]))}-${Math.max(getIdx(i + cornerOffsets[c1][0], j + cornerOffsets[c1][1], k + cornerOffsets[c1][2]), getIdx(i + cornerOffsets[c2][0], j + cornerOffsets[c2][1], k + cornerOffsets[c2][2]))}`;

          if (edgeCache.has(edgeKey)) {
            edgeVertices[e] = edgeCache.get(edgeKey)!;
          } else {
            const [px, py, pz] = interpolateEdge(
              cornerCoords[c1][0], cornerCoords[c1][1], cornerCoords[c1][2], cornerValues[c1],
              cornerCoords[c2][0], cornerCoords[c2][1], cornerCoords[c2][2], cornerValues[c2]
            );
            const idx = addVertex(px, py, pz);
            edgeVertices[e] = idx;
            edgeCache.set(edgeKey, idx);
          }
        }

        // Generate triangles
        const triList = TRI_TABLE[cubeIndex];
        for (let t = 0; t < triList.length - 2; t += 3) {
          if (triList[t] === -1) break;
          indices.push(
            edgeVertices[triList[t]],
            edgeVertices[triList[t + 1]],
            edgeVertices[triList[t + 2]]
          );
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return {
    geometry,
    transform: {
      xScale: scl,
      yScale: scl,
      zScale: scl,
      xOffset,
      yOffset,
      zOffset,
    },
  };
}
