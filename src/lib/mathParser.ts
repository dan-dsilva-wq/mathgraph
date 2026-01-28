import { compile, simplify, parse, derivative, rationalize, MathNode } from 'mathjs';

export type Evaluator = (x: number, y: number) => number | null;

// List of known function names to avoid breaking
const FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'sqrt', 'exp', 'log', 'log10', 'log2', 'abs', 'ceil', 'floor', 'round', 'sign'];

/**
 * Preprocess expression to add implicit multiplication and auto-brackets
 * Examples:
 *   2x -> 2*x
 *   x2 -> x*2
 *   xy -> x*y
 *   2(x) -> 2*(x)
 *   (x)(y) -> (x)*(y)
 *   xsin(y) -> x*sin(y)
 *   2sin(x) -> 2*sin(x)
 *   sinx -> sin(x)
 *   cosy -> cos(y)
 */
function preprocessExpression(expr: string): string {
  let result = expr;

  // Auto-add brackets for trig functions without them: sinx -> sin(x), cosy -> cos(y)
  FUNCTIONS.forEach(fn => {
    // Match function name followed directly by x or y (not already having parenthesis)
    // e.g., sinx, cosy, tanx, expx, sqrtx
    result = result.replace(new RegExp(`(${fn})([xy])(?![a-z0-9(])`, 'gi'), '$1($2)');
    // Also handle cases like sinxy -> sin(x)*y or sinx+cosy
    result = result.replace(new RegExp(`(${fn})([xy])([+\\-*/^])`, 'gi'), '$1($2)$3');
    // Handle at end of string
    result = result.replace(new RegExp(`(${fn})([xy])$`, 'gi'), '$1($2)');
  });

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

  // Convert π symbol to pi for math.js
  result = result.replace(/π/g, 'pi');

  // Handle implicit multiplication for constants e (Euler's number) and pi
  // Use negative lookahead to avoid matching 'e' in 'exp'
  //
  // First handle variable/number followed by e: ye -> y*e, xe -> x*e, 3e -> 3*e
  // (must come before e followed by variable, so yex -> y*ex -> y*e*x)
  result = result.replace(/([xy])(e)(?!xp)/gi, '$1*$2');  // ye -> y*e, but not yexp
  result = result.replace(/(\d)(e)(?!xp)/gi, '$1*$2');     // 3e -> 3*e, but not 3exp

  // Then handle e followed by variable/number/paren: ex -> e*x, e3 -> e*3, e( -> e*(
  result = result.replace(/\be(?!xp)\(/g, 'e*(');
  result = result.replace(/\be(?!xp)([xy])/gi, 'e*$1');
  result = result.replace(/\be(?!xp)(\d)/gi, 'e*$1');

  // Handle pi similarly
  result = result.replace(/([xy])(pi)\b/gi, '$1*$2');      // xpi -> x*pi
  result = result.replace(/(\d)(pi)\b/gi, '$1*$2');        // 3pi -> 3*pi
  result = result.replace(/\bpi\(/gi, 'pi*(');
  result = result.replace(/\bpi([xy])/gi, 'pi*$1');
  result = result.replace(/\bpi(\d)/gi, 'pi*$1');

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

/**
 * Convert a math expression to LaTeX format for display
 * Uses mathjs's built-in toTex() for proper handling of all cases
 */
export function expressionToLatex(expr: string): string {
  try {
    // Preprocess to handle implicit multiplication
    const processed = preprocessExpression(expr.trim());
    // Parse and convert to LaTeX using mathjs
    const node = parse(processed);
    if (Array.isArray(node)) {
      return expr; // Fallback for multiple statements
    }
    return node.toTex({ parenthesis: 'auto', implicit: 'hide' });
  } catch {
    // Fallback: return the original expression if parsing fails
    return expr;
  }
}

/**
 * Get partial derivatives of an expression with respect to x and y
 * Returns LaTeX formatted strings for display
 */
export function getPartialDerivatives(expr: string): { dzdx: string; dzdy: string } | null {
  try {
    const processed = preprocessExpression(expr.trim());
    const node = parse(processed);
    if (Array.isArray(node)) return null;

    const dzdx = derivative(node, 'x');
    const dzdy = derivative(node, 'y');

    // Simplify and convert to LaTeX
    const dzdxSimplified = simplify(dzdx).toTex({ parenthesis: 'auto', implicit: 'hide' });
    const dzdySimplified = simplify(dzdy).toTex({ parenthesis: 'auto', implicit: 'hide' });

    return {
      dzdx: dzdxSimplified,
      dzdy: dzdySimplified,
    };
  } catch {
    return null;
  }
}

/**
 * Create evaluators for partial derivatives (for numerical optimization)
 * Returns functions that evaluate ∂z/∂x and ∂z/∂y at any point
 */
export function createDerivativeEvaluators(expression: string): {
  dzdx: Evaluator;
  dzdy: Evaluator;
  d2zdx2: Evaluator;
  d2zdy2: Evaluator;
  d2zdxdy: Evaluator;
} | null {
  try {
    const processed = preprocessExpression(expression.trim());
    const node = parse(processed);
    if (Array.isArray(node)) return null;

    // First derivatives
    const dzdxNode = simplify(derivative(node, 'x'));
    const dzdyNode = simplify(derivative(node, 'y'));

    // Second derivatives
    const d2zdx2Node = simplify(derivative(dzdxNode, 'x'));
    const d2zdy2Node = simplify(derivative(dzdyNode, 'y'));
    const d2zdxdyNode = simplify(derivative(dzdxNode, 'y'));

    // Create evaluator from a math node
    const createEvalFromNode = (mathNode: MathNode): Evaluator => {
      const compiled = compile(mathNode.toString());
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
    };

    return {
      dzdx: createEvalFromNode(dzdxNode),
      dzdy: createEvalFromNode(dzdyNode),
      d2zdx2: createEvalFromNode(d2zdx2Node),
      d2zdy2: createEvalFromNode(d2zdy2Node),
      d2zdxdy: createEvalFromNode(d2zdxdyNode),
    };
  } catch {
    return null;
  }
}

/**
 * Check if a mathjs node contains the variable y
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nodeContainsY(node: any): boolean {
  if (Array.isArray(node)) return node.some((n: unknown) => nodeContainsY(n));
  let found = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node.traverse((n: any) => {
    if (n.isSymbolNode && n.name === 'y') found = true;
  });
  return found;
}

/**
 * Simplify special cases in the final answer
 * - sqrt(constant) -> evaluated number
 * - sqrt(x^2) -> x (since we have ± already)
 * - arcsin(0), arccos(1), etc. -> evaluated
 */
function simplifyFinalAnswer(latex: string, innerExpr: string): string {
  try {
    // Try to evaluate if it's a pure number
    const simplified = simplify(innerExpr);
    const evaluated = simplified.evaluate();

    if (typeof evaluated === 'number' && isFinite(evaluated) && evaluated >= 0) {
      const sqrtVal = Math.sqrt(evaluated);
      // Check if it's a nice integer or simple fraction
      if (Number.isInteger(sqrtVal)) {
        return `y = \\pm ${sqrtVal}`;
      }
      // Check for simple fractions like sqrt(0.25) = 0.5
      if (Number.isInteger(sqrtVal * 2) || Number.isInteger(sqrtVal * 4)) {
        return `y = \\pm ${sqrtVal}`;
      }
    }
  } catch {
    // Not a pure number, continue with other simplifications
  }

  // Check for sqrt(x^2) pattern - simplify to x
  const innerSimplified = simplify(innerExpr).toString();
  if (innerSimplified === 'x ^ 2' || innerSimplified === 'x^2') {
    return `y = \\pm x`;
  }

  // Check for expressions that evaluate to 0 inside sqrt
  try {
    const testVal = simplify(innerExpr).evaluate();
    if (testVal === 0) {
      return `y = 0`;
    }
  } catch {
    // Continue with original
  }

  return latex;
}

/**
 * Simplify arcsin/arccos/arctan of special values
 */
function simplifyInverseTrig(fnName: string, value: string): string | null {
  try {
    const numVal = simplify(value).evaluate();
    if (typeof numVal !== 'number') return null;

    if (fnName === 'asin' || fnName === 'arcsin') {
      if (numVal === 0) return '0';
      if (numVal === 1) return '\\frac{\\pi}{2}';
      if (numVal === -1) return '-\\frac{\\pi}{2}';
      if (Math.abs(numVal - 0.5) < 1e-10) return '\\frac{\\pi}{6}';
      if (Math.abs(numVal + 0.5) < 1e-10) return '-\\frac{\\pi}{6}';
    }
    if (fnName === 'acos' || fnName === 'arccos') {
      if (numVal === 0) return '\\frac{\\pi}{2}';
      if (numVal === 1) return '0';
      if (numVal === -1) return '\\pi';
      if (Math.abs(numVal - 0.5) < 1e-10) return '\\frac{\\pi}{3}';
    }
    if (fnName === 'atan' || fnName === 'arctan') {
      if (numVal === 0) return '0';
      if (numVal === 1) return '\\frac{\\pi}{4}';
      if (numVal === -1) return '-\\frac{\\pi}{4}';
    }
  } catch {
    // Not evaluable
  }
  return null;
}

/**
 * Try to solve a quadratic-like equation for y
 * Handles forms like: a*y^2 + b*x^2 + c = 0
 */
function tryQuadraticSolve(exprStr: string): { solved: boolean; solution: string; steps: string[] } | null {
  try {
    // Check if expression contains y^2 (and no other y terms like y, y^3, etc.)
    const hasY2 = /y\s*\^?\s*2|\by\s*\*\s*y\b|y\^2/i.test(exprStr);
    const hasOtherY = /(?<!\^)\by(?!\s*\^?\s*2)(?!\s*\*\s*y)/i.test(exprStr.replace(/y\s*\^\s*2/gi, '').replace(/y\s*\*\s*y/gi, ''));

    if (!hasY2 || hasOtherY) return null;

    // Use mathjs to get the coefficient of y^2 and the rest
    const parsed = parse(preprocessExpression(exprStr));
    if (Array.isArray(parsed)) return null;

    // Try to extract: coeff * y^2 + rest = 0  =>  y^2 = -rest/coeff
    const expr = parsed.toString();

    // Use derivative to find coefficient of y^2: d²/dy² of expr / 2
    const firstDeriv = derivative(parsed, 'y');
    const secondDeriv = derivative(firstDeriv, 'y');
    const y2Coeff = simplify(`(${secondDeriv.toString()}) / 2`).toString();

    // Evaluate coefficient (should be a number or expression in x only)
    if (nodeContainsY(parse(y2Coeff))) return null;

    // rest = expr - coeff*y^2, evaluated at y=0
    const restExpr = simplify(expr.replace(/y/gi, '(0)')).toString();

    // y^2 = -rest / coeff
    const y2ValueRaw = `-(${restExpr}) / (${y2Coeff})`;
    // Use rationalize to fully simplify fractions like (10-2x^2)/2 -> 5-x^2
    let y2Value: string;
    try {
      y2Value = rationalize(y2ValueRaw).toString();
    } catch {
      y2Value = simplify(y2ValueRaw).toString();
    }
    // Additional simplification pass
    y2Value = simplify(y2Value).toString();
    const y2ValueLatex = expressionToLatex(y2Value);

    const steps: string[] = [];
    steps.push(`y^{2} = ${y2ValueLatex}`);

    // Try to simplify the final sqrt expression (e.g., sqrt(4) -> 2, sqrt(x^2) -> x)
    const baseSolution = `y = \\pm\\sqrt{${y2ValueLatex}}`;
    const simplifiedSolution = simplifyFinalAnswer(baseSolution, y2Value);

    return {
      solved: true,
      solution: simplifiedSolution,
      steps
    };
  } catch {
    return null;
  }
}

/**
 * Universal equation solver using AST analysis
 * Analyzes the structure of the expression to solve for y
 */
function solveForYUniversal(exprStr: string): { solved: boolean; solution: string; steps: string[] } {
  const steps: string[] = [];

  // First try the quadratic solver for y^2 terms
  const quadResult = tryQuadraticSolve(exprStr);
  if (quadResult && quadResult.solved) {
    return quadResult;
  }

  try {
    const processed = preprocessExpression(exprStr);
    const node = parse(processed);
    if (Array.isArray(node)) return { solved: false, solution: '', steps: [] };

    // The expression is in the form: f(x,y) = 0
    // We need to isolate y

    // Strategy: Recursively unwrap operations around y
    // If the expression is: op(y_part) - other = 0
    // Then: op(y_part) = other, so y_part = inverse_op(other)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const solve = (expr: any): { solved: boolean; result: string } => {
      if (Array.isArray(expr)) return { solved: false, result: '' };

      // Base case: if expression is just 'y', we're done
      if (expr.isSymbolNode && expr.name === 'y') {
        return { solved: true, result: 'y' };
      }

      // If expression is an operator node
      if (expr.isOperatorNode) {
        const op = expr.op;
        const args = expr.args;

        // Handle subtraction (binary)
        if (op === '-' && args.length === 2) {
          // a - b = 0 means a = b
          const leftHasY = nodeContainsY(args[0]);
          const rightHasY = nodeContainsY(args[1]);

          if (leftHasY && !rightHasY) {
            // y_expr - const = 0  =>  y_expr = const
            const rhs = args[1].toTex({ parenthesis: 'auto' });
            steps.push(`${args[0].toTex({ parenthesis: 'auto' })} = ${rhs}`);
            return solveIsolated(args[0], args[1].toString());
          } else if (!leftHasY && rightHasY) {
            // const - y_expr = 0  =>  y_expr = const
            const lhs = args[0].toTex({ parenthesis: 'auto' });
            steps.push(`${args[1].toTex({ parenthesis: 'auto' })} = ${lhs}`);
            return solveIsolated(args[1], args[0].toString());
          } else if (leftHasY && rightHasY) {
            // Both sides have y - try to solve the left side = right side
            const rhsStr = args[1].toString();
            steps.push(`${args[0].toTex({ parenthesis: 'auto' })} = ${args[1].toTex({ parenthesis: 'auto' })}`);
            return solveIsolated(args[0], rhsStr);
          }
        }

        // Handle addition (can have multiple args)
        if (op === '+') {
          // Separate y-terms from non-y-terms
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const yTerms: any[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nonYTerms: any[] = [];

          args.forEach((arg: any) => {
            if (nodeContainsY(arg)) {
              yTerms.push(arg);
            } else {
              nonYTerms.push(arg);
            }
          });

          if (yTerms.length > 0 && nonYTerms.length > 0) {
            // Move non-y terms to the other side: y_terms = -nonY_terms
            const yExprStr = yTerms.map((t: any) => `(${t.toString()})`).join(' + ');
            const nonYExprStr = nonYTerms.map((t: any) => `(${t.toString()})`).join(' + ');
            const negNonY = simplify(`-(${nonYExprStr})`).toString();

            const yExprLatex = yTerms.length === 1
              ? yTerms[0].toTex({ parenthesis: 'auto' })
              : yTerms.map((t: any) => t.toTex({ parenthesis: 'auto' })).join(' + ');
            steps.push(`${yExprLatex} = ${expressionToLatex(negNonY)}`);

            // If there's only one y-term, solve it directly
            if (yTerms.length === 1) {
              return solveIsolated(yTerms[0], negNonY);
            }
            // Multiple y-terms - parse combined and try to solve
            const combinedYExpr = parse(yExprStr);
            if (!Array.isArray(combinedYExpr)) {
              return solveIsolated(combinedYExpr, negNonY);
            }
          } else if (yTerms.length > 0 && nonYTerms.length === 0) {
            // All terms have y, equation is sum_of_y_terms = 0
            // Try to solve if there's a single y term
            if (yTerms.length === 1) {
              steps.push(`${yTerms[0].toTex({ parenthesis: 'auto' })} = 0`);
              return solveIsolated(yTerms[0], '0');
            }
          }
        }
      }

      return { solved: false, result: '' };
    };

    // Solve an isolated expression containing y equal to some value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const solveIsolated = (yExpr: any, value: string): { solved: boolean; result: string } => {
      if (Array.isArray(yExpr)) return { solved: false, result: '' };

      // Base case: y = value
      if (yExpr.isSymbolNode && yExpr.name === 'y') {
        try {
          // Try to fully evaluate the expression (handles asin(0) -> 0, etc.)
          const simplified = simplify(value);
          const evaluated = simplified.evaluate();

          if (typeof evaluated === 'number' && isFinite(evaluated)) {
            // Check for nice integer values
            if (evaluated === 0) return { solved: true, result: `y = 0` };
            if (Number.isInteger(evaluated)) return { solved: true, result: `y = ${evaluated}` };

            // Check for pi-related values from inverse trig
            const piRatios = [
              { val: Math.PI, tex: '\\pi' },
              { val: Math.PI / 2, tex: '\\frac{\\pi}{2}' },
              { val: Math.PI / 3, tex: '\\frac{\\pi}{3}' },
              { val: Math.PI / 4, tex: '\\frac{\\pi}{4}' },
              { val: Math.PI / 6, tex: '\\frac{\\pi}{6}' },
              { val: -Math.PI / 2, tex: '-\\frac{\\pi}{2}' },
              { val: -Math.PI / 3, tex: '-\\frac{\\pi}{3}' },
              { val: -Math.PI / 4, tex: '-\\frac{\\pi}{4}' },
              { val: -Math.PI / 6, tex: '-\\frac{\\pi}{6}' },
            ];
            for (const pr of piRatios) {
              if (Math.abs(evaluated - pr.val) < 1e-10) {
                return { solved: true, result: `y = ${pr.tex}` };
              }
            }

            // For other numeric values, show rounded if reasonable
            if (Math.abs(evaluated) < 1000) {
              const rounded = Math.round(evaluated * 10000) / 10000;
              if (Math.abs(rounded - evaluated) < 1e-10) {
                return { solved: true, result: `y = ${rounded}` };
              }
            }
          }
        } catch {
          // Can't evaluate, continue with symbolic representation
        }

        const valLatex = expressionToLatex(simplify(value).toString());
        return { solved: true, result: `y = ${valLatex}` };
      }

      // Power: y^n = value  =>  y = value^(1/n)
      if (yExpr.isOperatorNode && yExpr.op === '^') {
        const base = yExpr.args[0];
        const exp = yExpr.args[1];

        if (nodeContainsY(base) && !nodeContainsY(exp)) {
          const expStr = exp.toString();
          const expLatex = expressionToLatex(expStr);
          const valLatex = expressionToLatex(simplify(value).toString());

          // Special case for ^2: use ± sqrt
          if (expStr === '2') {
            steps.push(`y = \\pm\\sqrt{${valLatex}}`);
            return { solved: true, result: `y = \\pm\\sqrt{${valLatex}}` };
          }

          // General: y = value^(1/exp)
          const newValue = `(${value})^(1/(${expStr}))`;
          steps.push(`${base.toTex({ parenthesis: 'auto' })} = ${valLatex}^{1/${expLatex}}`);
          return solveIsolated(base, newValue);
        }
      }

      // Function calls: sin(y) = value => y = asin(value)
      if (yExpr.isFunctionNode) {
        const fnName = yExpr.fn.name || (yExpr.fn as unknown as string);
        const arg = yExpr.args[0];

        if (nodeContainsY(arg)) {
          const valSimplified = simplify(value).toString();
          const valLatex = expressionToLatex(valSimplified);

          const inverses: Record<string, { fn: string; latex: string }> = {
            'sin': { fn: 'asin', latex: `\\arcsin\\left(${valLatex}\\right)` },
            'cos': { fn: 'acos', latex: `\\arccos\\left(${valLatex}\\right)` },
            'tan': { fn: 'atan', latex: `\\arctan\\left(${valLatex}\\right)` },
            'asin': { fn: 'sin', latex: `\\sin\\left(${valLatex}\\right)` },
            'acos': { fn: 'cos', latex: `\\cos\\left(${valLatex}\\right)` },
            'atan': { fn: 'tan', latex: `\\tan\\left(${valLatex}\\right)` },
            'sinh': { fn: 'asinh', latex: `\\text{arcsinh}\\left(${valLatex}\\right)` },
            'cosh': { fn: 'acosh', latex: `\\text{arccosh}\\left(${valLatex}\\right)` },
            'tanh': { fn: 'atanh', latex: `\\text{arctanh}\\left(${valLatex}\\right)` },
            'exp': { fn: 'log', latex: `\\ln\\left(${valLatex}\\right)` },
            'log': { fn: 'exp', latex: `e^{${valLatex}}` },
            'sqrt': { fn: 'square', latex: `\\left(${valLatex}\\right)^{2}` },
          };

          if (fnName in inverses) {
            const inv = inverses[fnName];
            const newValue = inv.fn === 'square' ? `(${valSimplified})^2` : `${inv.fn}(${valSimplified})`;
            steps.push(`${arg.toTex({ parenthesis: 'auto' })} = ${inv.latex}`);
            return solveIsolated(arg, newValue);
          }
        }
      }

      // Multiplication: a * y_expr = value => y_expr = value / a
      if (yExpr.isOperatorNode && yExpr.op === '*') {
        for (let i = 0; i < yExpr.args.length; i++) {
          if (nodeContainsY(yExpr.args[i])) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const others = yExpr.args.filter((_: any, j: number) => j !== i);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const otherProduct = others.map((a: any) => `(${a.toString()})`).join(' * ');
            const newValue = `(${value}) / (${otherProduct})`;
            const newValSimplified = simplify(newValue).toString();
            steps.push(`${yExpr.args[i].toTex({ parenthesis: 'auto' })} = ${expressionToLatex(newValSimplified)}`);
            return solveIsolated(yExpr.args[i], newValSimplified);
          }
        }
      }

      // Division: y_expr / a = value => y_expr = value * a
      if (yExpr.isOperatorNode && yExpr.op === '/') {
        const num = yExpr.args[0];
        const den = yExpr.args[1];

        if (nodeContainsY(num) && !nodeContainsY(den)) {
          const newValue = `(${value}) * (${den.toString()})`;
          const newValSimplified = simplify(newValue).toString();
          steps.push(`${num.toTex({ parenthesis: 'auto' })} = ${expressionToLatex(newValSimplified)}`);
          return solveIsolated(num, newValSimplified);
        }
      }

      // Addition: y_expr + other = value => y_expr = value - other
      if (yExpr.isOperatorNode && yExpr.op === '+') {
        for (let i = 0; i < yExpr.args.length; i++) {
          if (nodeContainsY(yExpr.args[i])) {
            // Check if only ONE term contains y (otherwise can't solve simply)
            const yTerms = yExpr.args.filter((a: any) => nodeContainsY(a));
            if (yTerms.length === 1) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const others = yExpr.args.filter((_: any, j: number) => j !== i);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const otherSum = others.map((a: any) => `(${a.toString()})`).join(' + ');
              const newValue = `(${value}) - (${otherSum})`;
              const newValSimplified = simplify(newValue).toString();
              steps.push(`${yExpr.args[i].toTex({ parenthesis: 'auto' })} = ${expressionToLatex(newValSimplified)}`);
              return solveIsolated(yExpr.args[i], newValSimplified);
            }
          }
        }
      }

      // Subtraction: y_expr - other = value => y_expr = value + other
      // Or: other - y_expr = value => y_expr = other - value
      if (yExpr.isOperatorNode && yExpr.op === '-' && yExpr.args.length === 2) {
        const left = yExpr.args[0];
        const right = yExpr.args[1];
        const leftHasY = nodeContainsY(left);
        const rightHasY = nodeContainsY(right);

        if (leftHasY && !rightHasY) {
          // y_expr - other = value => y_expr = value + other
          const newValue = `(${value}) + (${right.toString()})`;
          const newValSimplified = simplify(newValue).toString();
          steps.push(`${left.toTex({ parenthesis: 'auto' })} = ${expressionToLatex(newValSimplified)}`);
          return solveIsolated(left, newValSimplified);
        } else if (!leftHasY && rightHasY) {
          // other - y_expr = value => y_expr = other - value
          const newValue = `(${left.toString()}) - (${value})`;
          const newValSimplified = simplify(newValue).toString();
          steps.push(`${right.toTex({ parenthesis: 'auto' })} = ${expressionToLatex(newValSimplified)}`);
          return solveIsolated(right, newValSimplified);
        }
      }

      return { solved: false, result: '' };
    };

    const result = solve(node);
    return { solved: result.solved, solution: result.result, steps };

  } catch (e) {
    return { solved: false, solution: '', steps: [] };
  }
}

/**
 * Convert LaTeX with nested braces to math expression
 * Handles \sqrt{...}, \frac{...}{...} with proper brace matching
 */
function latexToMath(latex: string): string {
  let result = latex;

  // Helper to find matching closing brace
  function findMatchingBrace(str: string, start: number): number {
    let depth = 1;
    for (let i = start; i < str.length; i++) {
      if (str[i] === '{') depth++;
      else if (str[i] === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  // Process \sqrt{...} with proper brace matching
  let sqrtMatch;
  while ((sqrtMatch = result.match(/\\sqrt\{/)) !== null) {
    const startIdx = sqrtMatch.index!;
    const contentStart = startIdx + 6; // After '\sqrt{'
    const endIdx = findMatchingBrace(result, contentStart);
    if (endIdx === -1) break;

    const content = result.slice(contentStart, endIdx);
    result = result.slice(0, startIdx) + 'sqrt(' + content + ')' + result.slice(endIdx + 1);
  }

  // Process \frac{...}{...} with proper brace matching
  let fracMatch;
  while ((fracMatch = result.match(/\\frac\{/)) !== null) {
    const startIdx = fracMatch.index!;
    const numStart = startIdx + 6; // After '\frac{'
    const numEnd = findMatchingBrace(result, numStart);
    if (numEnd === -1) break;

    const numerator = result.slice(numStart, numEnd);

    // Find denominator - should start with { right after }
    if (result[numEnd + 1] !== '{') break;
    const denStart = numEnd + 2;
    const denEnd = findMatchingBrace(result, denStart);
    if (denEnd === -1) break;

    const denominator = result.slice(denStart, denEnd);
    result = result.slice(0, startIdx) + '((' + numerator + ')/(' + denominator + '))' + result.slice(denEnd + 1);
  }

  // Simple replacements (no nested brace issues)
  result = result
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*')
    .replace(/\\pi/g, 'pi')
    .replace(/\\ln/g, 'log')
    .replace(/\\arcsin/g, 'asin')
    .replace(/\\arccos/g, 'acos')
    .replace(/\\arctan/g, 'atan')
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\tan/g, 'tan')
    .replace(/\\exp/g, 'exp')
    .replace(/\\text\{[^}]*\}/g, ''); // Remove \text{...}

  // Convert remaining braces: ^{...} -> ^(...) and {...} -> (...)
  // Process ^{...} first
  result = result.replace(/\^\{([^{}]+)\}/g, '^($1)');
  // Then remaining {...} -> (...)
  result = result.replace(/\{([^{}]+)\}/g, '($1)');

  // Ensure plain exponents have parentheses
  result = result.replace(/\^(\d+)/g, '^($1)');
  result = result.replace(/\^([a-zA-Z])(?![a-zA-Z0-9(])/g, '^($1)');

  return result.trim();
}

/**
 * Try to solve an expression for y
 * Uses universal AST-based solver
 * Returns both LaTeX solution and raw math expressions for graphing (positive and negative branches)
 */
function solveForY(expr: string): { solved: boolean; solution: string; rawExpr: string; rawExprNeg: string; hasPlusMinus: boolean; steps: string[] } {
  const result = solveForYUniversal(expr);

  // Extract raw expression from LaTeX solution
  let rawExpr = '';
  let rawExprNeg = '';
  let hasPlusMinus = false;

  if (result.solved && result.solution) {
    // Check if the solution has ±
    hasPlusMinus = result.solution.includes('\\pm');

    // Remove "y = " prefix and ± symbol, then convert LaTeX to math
    const withoutPrefix = result.solution
      .replace(/^y\s*=\s*/, '')
      .replace(/\\pm\s*/g, ''); // Remove ± for positive branch

    rawExpr = latexToMath(withoutPrefix);

    // Create negative branch if there's ±
    if (hasPlusMinus) {
      rawExprNeg = '-(' + rawExpr + ')';
    }
  }

  return { ...result, rawExpr, rawExprNeg, hasPlusMinus };
}

/**
 * Swap x and y variables in an expression
 */
function swapXY(expr: string): string {
  // Use a placeholder to avoid double-swapping
  return expr
    .replace(/\bx\b/g, '___TEMP___')
    .replace(/\by\b/g, 'x')
    .replace(/___TEMP___/g, 'y');
}

/**
 * Try to solve an expression for x by swapping variables, solving for y, then swapping back
 */
function solveForX(expr: string): { solved: boolean; solution: string; rawExpr: string; rawExprNeg: string; hasPlusMinus: boolean; steps: string[] } {
  // Swap x and y in the expression
  const swappedExpr = swapXY(expr);

  // Solve for y (which is actually x after swapping)
  const result = solveForYUniversal(swappedExpr);

  let rawExpr = '';
  let rawExprNeg = '';
  let hasPlusMinus = false;
  const steps: string[] = [];

  if (result.solved && result.solution) {
    hasPlusMinus = result.solution.includes('\\pm');

    // Swap x and y back in the solution
    const swappedSolution = swapXY(result.solution).replace(/^y\s*=\s*/, 'x = ');

    // Swap back in steps too
    result.steps.forEach(step => {
      steps.push(swapXY(step));
    });

    // Remove "x = " prefix and ± symbol for raw expression
    const withoutPrefix = swappedSolution
      .replace(/^x\s*=\s*/, '')
      .replace(/\\pm\s*/g, '');

    rawExpr = latexToMath(withoutPrefix);

    if (hasPlusMinus) {
      rawExprNeg = '-(' + rawExpr + ')';
    }

    return { solved: true, solution: swappedSolution, rawExpr, rawExprNeg, hasPlusMinus, steps };
  }

  return { solved: false, solution: '', rawExpr: '', rawExprNeg: '', hasPlusMinus: false, steps: [] };
}

/**
 * Generate the intersection equation for two expressions
 * Solves for y where possible, falls back to solving for x
 */
export function generateIntersectionEquation(expr1: string, expr2: string): {
  simplified: string;
  rawExpression: string; // Raw math expression for 2D graphing (positive branch)
  rawExpressionNeg: string; // Negative branch for ± solutions
  hasPlusMinus: boolean; // Whether the solution has ±
  solvedFor: 'y' | 'x' | null; // Which variable was solved for (for axis swapping in 2D preview)
  steps: string[];
} {
  const processed1 = preprocessExpression(expr1);
  const processed2 = preprocessExpression(expr2);

  const steps: string[] = [
    `z_1 = z_2`,
    `${expressionToLatex(expr1)} = ${expressionToLatex(expr2)}`,
  ];

  try {
    // Create the difference expression: f(x,y) - g(x,y) = 0
    const diffExpr = `(${processed1}) - (${processed2})`;

    // Simplify the expression
    const simplified = simplify(diffExpr);
    const simplifiedStr = simplified.toString();

    // Check if the result is just a constant (no x or y)
    // This means the surfaces are parallel and never intersect (or are identical)
    const hasVariables = /[xy]/i.test(simplifiedStr);

    if (!hasVariables) {
      // It's just a number - check if it's zero (identical surfaces) or non-zero (no intersection)
      const numValue = parseFloat(simplifiedStr);
      if (numValue === 0) {
        steps.push(`0 = 0`);
        return {
          simplified: `\\text{Identical surfaces (intersect everywhere)}`,
          rawExpression: '',
          rawExpressionNeg: '',
          hasPlusMinus: false,
          solvedFor: null,
          steps
        };
      } else {
        steps.push(`${simplifiedStr} = 0`);
        steps.push(`\\text{This is never true}`);
        return {
          simplified: `\\text{No intersection (parallel surfaces)}`,
          rawExpression: '',
          rawExpressionNeg: '',
          hasPlusMinus: false,
          solvedFor: null,
          steps
        };
      }
    }

    steps.push(`${expressionToLatex(simplifiedStr)} = 0`);

    // Try to solve for y first
    const solutionY = solveForY(simplifiedStr);

    if (solutionY.solved) {
      // Add solving steps
      steps.push(...solutionY.steps);
      return {
        simplified: solutionY.solution,
        rawExpression: solutionY.rawExpr,
        rawExpressionNeg: solutionY.rawExprNeg,
        hasPlusMinus: solutionY.hasPlusMinus,
        solvedFor: 'y',
        steps
      };
    }

    // Try to solve for x if y failed
    const solutionX = solveForX(simplifiedStr);

    if (solutionX.solved) {
      steps.push(...solutionX.steps);
      return {
        simplified: solutionX.solution,
        rawExpression: solutionX.rawExpr,
        rawExpressionNeg: solutionX.rawExprNeg,
        hasPlusMinus: solutionX.hasPlusMinus,
        solvedFor: 'x',
        steps
      };
    }

    // Couldn't solve for either, return simplified form
    return {
      simplified: `${expressionToLatex(simplifiedStr)} = 0`,
      rawExpression: simplifiedStr,
      rawExpressionNeg: '',
      hasPlusMinus: false,
      solvedFor: null,
      steps
    };
  } catch {
    // Fallback
    const originalLatex = `(${expressionToLatex(expr1)}) - (${expressionToLatex(expr2)}) = 0`;
    return {
      simplified: originalLatex,
      rawExpression: `(${expr1}) - (${expr2})`,
      rawExpressionNeg: '',
      hasPlusMinus: false,
      solvedFor: null,
      steps: [originalLatex]
    };
  }
}
