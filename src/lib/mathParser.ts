import { compile } from 'mathjs';

export type Evaluator = (x: number, y: number) => number | null;

// List of known function names to avoid breaking
const FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'sqrt', 'exp', 'log', 'log10', 'log2', 'abs', 'ceil', 'floor', 'round', 'sign'];

/**
 * Preprocess expression to add implicit multiplication
 * Examples:
 *   2x -> 2*x
 *   x2 -> x*2
 *   xy -> x*y
 *   2(x) -> 2*(x)
 *   (x)(y) -> (x)*(y)
 *   xsin(y) -> x*sin(y)
 *   2sin(x) -> 2*sin(x)
 */
function preprocessExpression(expr: string): string {
  let result = expr;

  // Number followed by variable: 2x -> 2*x, 2y -> 2*y
  result = result.replace(/(\d)([xy])/gi, '$1*$2');

  // Variable followed by number: x2 -> x*2, y3 -> y*3
  result = result.replace(/([xy])(\d)/gi, '$1*$2');

  // Variable followed by variable: xy -> x*y
  result = result.replace(/([xy])([xy])/gi, '$1*$2');

  // Number followed by opening paren: 2( -> 2*(
  result = result.replace(/(\d)\(/g, '$1*(');

  // Closing paren followed by opening paren: )( -> )*(
  result = result.replace(/\)\(/g, ')*(');

  // Closing paren followed by number: )2 -> )*2
  result = result.replace(/\)(\d)/g, ')*$1');

  // Closing paren followed by variable: )x -> )*x
  result = result.replace(/\)([xy])/gi, ')*$1');

  // Variable followed by opening paren (but not a function): x( -> x*(
  // First, temporarily replace function names
  let temp = result;
  FUNCTIONS.forEach((fn, i) => {
    temp = temp.replace(new RegExp(fn + '\\(', 'gi'), `__FN${i}__(`);
  });
  // Now add multiplication for variable followed by (
  temp = temp.replace(/([xy])\(/gi, '$1*(');
  // Restore function names
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
    result = result.replace(new RegExp(`([xy])(${fn})\\(`, 'gi'), '$1*$2(');
  });

  // Closing paren followed by function: )sin -> )*sin
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`\\)(${fn})\\(`, 'gi'), ')*$1(');
  });

  return result;
}

export function createEvaluator(expression: string): Evaluator {
  try {
    const processed = preprocessExpression(expression);
    const compiled = compile(processed);
    return (x: number, y: number): number | null => {
      try {
        const result = compiled.evaluate({ x, y });
        if (typeof result === 'number' && isFinite(result)) {
          return result;
        }
        return null;
      } catch {
        return null;
      }
    };
  } catch (error) {
    throw new Error(`Invalid expression: ${expression}`);
  }
}

export function validateExpression(expression: string): { valid: boolean; error?: string } {
  if (!expression.trim()) {
    return { valid: false, error: 'Expression cannot be empty' };
  }

  try {
    const processed = preprocessExpression(expression);
    compile(processed);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid expression'
    };
  }
}
