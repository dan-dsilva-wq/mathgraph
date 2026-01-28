/**
 * Symbolic Integration Module
 * Provides exact integration for polynomial expressions.
 */

import { parse, simplify } from 'mathjs';
import { IntegrationResult } from './numericalIntegration';

export interface PolynomialTerm {
  coefficient: number;
  xPower: number;
  yPower: number;
}

/**
 * Check if an expression is a polynomial in x and y
 * Returns true for expressions like: x^2 + y^2, 3*x*y, x^2 - 2*x + 1, etc.
 */
export function isPolynomial(expression: string): boolean {
  try {
    const node = parse(expression);
    return checkPolynomialNode(node);
  } catch {
    return false;
  }
}

/**
 * Recursively check if a math node represents a polynomial
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkPolynomialNode(node: any): boolean {
  if (!node) return false;

  // Constants are polynomials
  if (node.isConstantNode) {
    return true;
  }

  // x and y are polynomial variables
  if (node.isSymbolNode) {
    const name = node.name.toLowerCase();
    // Allow x, y, pi, e (treated as constants)
    return name === 'x' || name === 'y' || name === 'pi' || name === 'e';
  }

  // Parentheses - check inner content
  if (node.isParenthesisNode) {
    return checkPolynomialNode(node.content);
  }

  // Operations: +, -, *, / (division only by constants), ^
  if (node.isOperatorNode) {
    const op = node.op;

    if (op === '+' || op === '-') {
      // All operands must be polynomials
      return node.args.every((arg: any) => checkPolynomialNode(arg));
    }

    if (op === '*') {
      // All operands must be polynomials
      return node.args.every((arg: any) => checkPolynomialNode(arg));
    }

    if (op === '/') {
      // Numerator must be polynomial, denominator must be constant
      if (node.args.length !== 2) return false;
      return checkPolynomialNode(node.args[0]) && isConstantNode(node.args[1]);
    }

    if (op === '^') {
      // Base must be x or y (or polynomial), exponent must be non-negative integer constant
      if (node.args.length !== 2) return false;
      const base = node.args[0];
      const exp = node.args[1];

      // Check exponent is a non-negative integer
      if (!exp.isConstantNode) return false;
      const expVal = exp.value;
      if (!Number.isInteger(expVal) || expVal < 0) return false;

      // Base must be a simple variable or polynomial
      if (base.isSymbolNode && (base.name === 'x' || base.name === 'y')) {
        return true;
      }
      // Or base is a parenthesized polynomial
      if (base.isParenthesisNode) {
        return checkPolynomialNode(base.content);
      }
      return checkPolynomialNode(base);
    }

    // Unary minus
    if (op === '-' && node.args.length === 1) {
      return checkPolynomialNode(node.args[0]);
    }

    return false;
  }

  // Function nodes are not polynomials (sin, cos, exp, etc.)
  if (node.isFunctionNode) {
    return false;
  }

  return false;
}

/**
 * Check if a node evaluates to a constant (no x or y variables)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isConstantNode(node: any): boolean {
  if (!node) return false;

  if (node.isConstantNode) return true;

  if (node.isSymbolNode) {
    const name = node.name.toLowerCase();
    return name === 'pi' || name === 'e';
  }

  if (node.isParenthesisNode) {
    return isConstantNode(node.content);
  }

  if (node.isOperatorNode) {
    return node.args.every((arg: any) => isConstantNode(arg));
  }

  return false;
}

/**
 * Parse a polynomial expression into a list of terms
 * Each term has {coefficient, xPower, yPower}
 */
export function parsePolynomial(expression: string): PolynomialTerm[] {
  try {
    // Expand and simplify first
    const simplified = simplify(expression).toString();
    const node = parse(simplified);
    const terms: PolynomialTerm[] = [];
    extractTerms(node, 1, terms);
    return combineTerms(terms);
  } catch {
    return [];
  }
}

/**
 * Recursively extract polynomial terms from a math node
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTerms(node: any, coefficient: number, terms: PolynomialTerm[]): void {
  if (!node) return;

  // Constant
  if (node.isConstantNode) {
    terms.push({ coefficient: coefficient * node.value, xPower: 0, yPower: 0 });
    return;
  }

  // Symbol: x or y (or constant like pi, e)
  if (node.isSymbolNode) {
    const name = node.name.toLowerCase();
    if (name === 'x') {
      terms.push({ coefficient, xPower: 1, yPower: 0 });
    } else if (name === 'y') {
      terms.push({ coefficient, xPower: 0, yPower: 1 });
    } else if (name === 'pi') {
      terms.push({ coefficient: coefficient * Math.PI, xPower: 0, yPower: 0 });
    } else if (name === 'e') {
      terms.push({ coefficient: coefficient * Math.E, xPower: 0, yPower: 0 });
    }
    return;
  }

  // Parenthesis
  if (node.isParenthesisNode) {
    extractTerms(node.content, coefficient, terms);
    return;
  }

  // Operators
  if (node.isOperatorNode) {
    const op = node.op;

    // Addition: extract terms from each operand
    if (op === '+') {
      for (const arg of node.args) {
        extractTerms(arg, coefficient, terms);
      }
      return;
    }

    // Subtraction
    if (op === '-') {
      if (node.args.length === 1) {
        // Unary minus
        extractTerms(node.args[0], -coefficient, terms);
      } else {
        // Binary subtraction
        extractTerms(node.args[0], coefficient, terms);
        for (let i = 1; i < node.args.length; i++) {
          extractTerms(node.args[i], -coefficient, terms);
        }
      }
      return;
    }

    // Multiplication
    if (op === '*') {
      // Multiply all factors together
      const factors = node.args.map((arg: any) => {
        const factorTerms: PolynomialTerm[] = [];
        extractTerms(arg, 1, factorTerms);
        return factorTerms;
      });

      // Start with first factor
      let result = factors[0].map((t: PolynomialTerm) => ({ ...t, coefficient: t.coefficient * coefficient }));

      // Multiply by each subsequent factor
      for (let i = 1; i < factors.length; i++) {
        const newResult: PolynomialTerm[] = [];
        for (const t1 of result) {
          for (const t2 of factors[i]) {
            newResult.push({
              coefficient: t1.coefficient * t2.coefficient,
              xPower: t1.xPower + t2.xPower,
              yPower: t1.yPower + t2.yPower
            });
          }
        }
        result = newResult;
      }

      terms.push(...result);
      return;
    }

    // Division by constant
    if (op === '/') {
      const numTerms: PolynomialTerm[] = [];
      extractTerms(node.args[0], coefficient, numTerms);

      // Evaluate denominator as constant
      try {
        const denValue = node.args[1].evaluate ? node.args[1].evaluate() : parseFloat(node.args[1].toString());
        for (const t of numTerms) {
          terms.push({ ...t, coefficient: t.coefficient / denValue });
        }
      } catch {
        // Can't evaluate denominator
      }
      return;
    }

    // Power
    if (op === '^') {
      const base = node.args[0];
      const expVal = node.args[1].value;

      if (base.isSymbolNode) {
        const name = base.name.toLowerCase();
        if (name === 'x') {
          terms.push({ coefficient, xPower: expVal, yPower: 0 });
        } else if (name === 'y') {
          terms.push({ coefficient, xPower: 0, yPower: expVal });
        }
        return;
      }

      // Power of a polynomial: expand using multinomial theorem
      // For now, recursively expand (base)^n = (base) * (base)^(n-1)
      if (expVal === 0) {
        terms.push({ coefficient, xPower: 0, yPower: 0 });
        return;
      }

      let result: PolynomialTerm[] = [];
      extractTerms(base, 1, result);

      for (let i = 1; i < expVal; i++) {
        const baseTerms: PolynomialTerm[] = [];
        extractTerms(base, 1, baseTerms);

        const newResult: PolynomialTerm[] = [];
        for (const t1 of result) {
          for (const t2 of baseTerms) {
            newResult.push({
              coefficient: t1.coefficient * t2.coefficient,
              xPower: t1.xPower + t2.xPower,
              yPower: t1.yPower + t2.yPower
            });
          }
        }
        result = combineTerms(newResult);
      }

      for (const t of result) {
        terms.push({ ...t, coefficient: t.coefficient * coefficient });
      }
      return;
    }
  }
}

/**
 * Combine like terms
 */
function combineTerms(terms: PolynomialTerm[]): PolynomialTerm[] {
  const combined = new Map<string, PolynomialTerm>();

  for (const term of terms) {
    const key = `${term.xPower},${term.yPower}`;
    const existing = combined.get(key);
    if (existing) {
      existing.coefficient += term.coefficient;
    } else {
      combined.set(key, { ...term });
    }
  }

  // Filter out zero coefficients
  return Array.from(combined.values()).filter(t => Math.abs(t.coefficient) > 1e-15);
}

/**
 * Integrate a polynomial term over a rectangular region
 * ∫∫ c·x^m·y^n dA = c · [(x₂^(m+1) - x₁^(m+1))/(m+1)] · [(y₂^(n+1) - y₁^(n+1))/(n+1)]
 */
function integrateTerm(
  term: PolynomialTerm,
  xRange: [number, number],
  yRange: [number, number]
): number {
  const [x1, x2] = xRange;
  const [y1, y2] = yRange;
  const { coefficient, xPower, yPower } = term;

  const xIntegral = (Math.pow(x2, xPower + 1) - Math.pow(x1, xPower + 1)) / (xPower + 1);
  const yIntegral = (Math.pow(y2, yPower + 1) - Math.pow(y1, yPower + 1)) / (yPower + 1);

  return coefficient * xIntegral * yIntegral;
}

/**
 * Integrate a polynomial expression over a rectangular region (exact)
 */
export function integratePolynomial(
  terms: PolynomialTerm[],
  xRange: [number, number],
  yRange: [number, number]
): number {
  let total = 0;
  for (const term of terms) {
    total += integrateTerm(term, xRange, yRange);
  }
  return total;
}

/**
 * Try to compute exact volume for polynomial expressions
 * For volume = ∫∫ |f(x,y)| dA, exact integration is only simple when
 * the function doesn't change sign. Otherwise, we need to find roots.
 *
 * This function handles the simple case where the polynomial has a consistent
 * sign over the integration region, or falls back to numerical integration.
 */
export function integratePolynomialVolume(
  expression: string,
  xRange: [number, number],
  yRange: [number, number]
): IntegrationResult | null {
  if (!isPolynomial(expression)) {
    return null;
  }

  const terms = parsePolynomial(expression);
  if (terms.length === 0) {
    return null;
  }

  // For simple cases like x^2 + y^2 (always non-negative), integrate directly
  // Check corners and center for sign consistency
  const [x1, x2] = xRange;
  const [y1, y2] = yRange;
  const testPoints = [
    [x1, y1], [x1, y2], [x2, y1], [x2, y2],
    [(x1 + x2) / 2, (y1 + y2) / 2]
  ];

  const values = testPoints.map(([x, y]) => evaluatePolynomial(terms, x, y));
  const allNonNegative = values.every(v => v >= 0);
  const allNonPositive = values.every(v => v <= 0);

  if (allNonNegative) {
    // Function is non-negative, integrate directly
    const value = integratePolynomial(terms, xRange, yRange);
    return {
      value,
      error: 0,
      isExact: true,
      method: 'symbolic'
    };
  }

  if (allNonPositive) {
    // Function is non-positive, integrate and negate
    const value = -integratePolynomial(terms, xRange, yRange);
    return {
      value,
      error: 0,
      isExact: true,
      method: 'symbolic'
    };
  }

  // Function changes sign - cannot compute exact volume simply
  // Return null to indicate fallback to numerical integration
  return null;
}

/**
 * Evaluate a polynomial at a point
 */
function evaluatePolynomial(terms: PolynomialTerm[], x: number, y: number): number {
  let result = 0;
  for (const term of terms) {
    result += term.coefficient * Math.pow(x, term.xPower) * Math.pow(y, term.yPower);
  }
  return result;
}

/**
 * Compute exact volume between two polynomial surfaces
 * Returns null if not both polynomials or if the difference changes sign
 */
export function integratePolynomialVolumeBetween(
  expression1: string,
  expression2: string,
  xRange: [number, number],
  yRange: [number, number]
): IntegrationResult | null {
  if (!isPolynomial(expression1) || !isPolynomial(expression2)) {
    return null;
  }

  const terms1 = parsePolynomial(expression1);
  const terms2 = parsePolynomial(expression2);

  if (terms1.length === 0 || terms2.length === 0) {
    // One is zero polynomial
    if (terms1.length === 0 && terms2.length === 0) {
      return { value: 0, error: 0, isExact: true, method: 'symbolic' };
    }
    // Fall through to compute difference
  }

  // Compute difference: f1 - f2
  const differenceTerms = [...terms1];
  for (const t2 of terms2) {
    differenceTerms.push({ ...t2, coefficient: -t2.coefficient });
  }
  const combined = combineTerms(differenceTerms);

  // Check sign consistency of difference
  const [x1, x2] = xRange;
  const [y1, y2] = yRange;
  const testPoints = [
    [x1, y1], [x1, y2], [x2, y1], [x2, y2],
    [(x1 + x2) / 2, (y1 + y2) / 2],
    [x1, (y1 + y2) / 2], [x2, (y1 + y2) / 2],
    [(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2]
  ];

  const values = testPoints.map(([x, y]) => evaluatePolynomial(combined, x, y));
  const allNonNegative = values.every(v => v >= -1e-10);
  const allNonPositive = values.every(v => v <= 1e-10);

  if (allNonNegative) {
    const value = integratePolynomial(combined, xRange, yRange);
    return {
      value: Math.abs(value),
      error: 0,
      isExact: true,
      method: 'symbolic'
    };
  }

  if (allNonPositive) {
    const value = -integratePolynomial(combined, xRange, yRange);
    return {
      value: Math.abs(value),
      error: 0,
      isExact: true,
      method: 'symbolic'
    };
  }

  // Difference changes sign - cannot compute exactly
  return null;
}
