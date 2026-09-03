type ValueKind = "number" | "boolean";

/**
 * Validates the restricted calculated-test expression language without running
 * user-controlled JavaScript. The backend repeats this validation and performs
 * the real calculation with its own restricted evaluator.
 */
export function validateCalculationExpression(expression: string): void {
  new ExpressionParser(expression).parse();
}

class ExpressionParser {
  private position = 0;

  constructor(private readonly input: string) {}

  parse(): void {
    this.parseOr();
    this.skipWhitespace();
    if (this.position !== this.input.length) {
      throw this.error("存在不支持的内容");
    }
  }

  private parseOr(): ValueKind {
    let kind = this.parseAnd();
    while (this.match("||")) {
      this.requireKind(kind, "boolean");
      this.requireKind(this.parseAnd(), "boolean");
      kind = "boolean";
    }
    return kind;
  }

  private parseAnd(): ValueKind {
    let kind = this.parseEquality();
    while (this.match("&&")) {
      this.requireKind(kind, "boolean");
      this.requireKind(this.parseEquality(), "boolean");
      kind = "boolean";
    }
    return kind;
  }

  private parseEquality(): ValueKind {
    let kind = this.parseComparison();
    while (this.match("==") || this.match("!=")) {
      const right = this.parseComparison();
      if (kind !== right) {
        throw this.error("等式两侧的数据类型不一致");
      }
      kind = "boolean";
    }
    return kind;
  }

  private parseComparison(): ValueKind {
    let kind = this.parseAdditive();
    while (
      this.match(">=") ||
      this.match("<=") ||
      this.match(">") ||
      this.match("<")
    ) {
      this.requireKind(kind, "number");
      this.requireKind(this.parseAdditive(), "number");
      kind = "boolean";
    }
    return kind;
  }

  private parseAdditive(): ValueKind {
    let kind = this.parseMultiplicative();
    while (this.match("+") || this.match("-")) {
      this.requireKind(kind, "number");
      this.requireKind(this.parseMultiplicative(), "number");
      kind = "number";
    }
    return kind;
  }

  private parseMultiplicative(): ValueKind {
    let kind = this.parseUnary();
    while (this.match("*") || this.match("/")) {
      this.requireKind(kind, "number");
      this.requireKind(this.parseUnary(), "number");
      kind = "number";
    }
    return kind;
  }

  private parseUnary(): ValueKind {
    if (this.match("+") || this.match("-")) {
      const kind = this.parseUnary();
      this.requireKind(kind, "number");
      return "number";
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ValueKind {
    if (this.match("(")) {
      const kind = this.parseOr();
      if (!this.match(")")) {
        throw this.error("缺少右括号");
      }
      return kind;
    }
    this.skipWhitespace();
    if (this.input.startsWith("Infinity", this.position)) {
      this.position += "Infinity".length;
      return "number";
    }
    this.parseNumber();
    return "number";
  }

  private parseNumber(): void {
    this.skipWhitespace();
    const start = this.position;
    let exponentSeen = false;
    while (this.position < this.input.length) {
      const current = this.input[this.position];
      if (/\d|\./.test(current)) {
        this.position += 1;
      } else if ((current === "e" || current === "E") && !exponentSeen) {
        exponentSeen = true;
        this.position += 1;
        if (
          this.input[this.position] === "+" ||
          this.input[this.position] === "-"
        ) {
          this.position += 1;
        }
      } else {
        break;
      }
    }
    const token = this.input.slice(start, this.position);
    if (!token || !Number.isFinite(Number(token))) {
      throw this.error("此处需要有效数字");
    }
  }

  private match(expected: string): boolean {
    this.skipWhitespace();
    if (!this.input.startsWith(expected, this.position)) {
      return false;
    }
    this.position += expected.length;
    return true;
  }

  private requireKind(actual: ValueKind, expected: ValueKind): void {
    if (actual !== expected) {
      throw this.error(
        expected === "number" ? "此处需要数值" : "此处需要判断条件",
      );
    }
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.input[this.position] ?? "")) {
      this.position += 1;
    }
  }

  private error(message: string): Error {
    return new Error(`${message}（位置 ${this.position}）`);
  }
}
