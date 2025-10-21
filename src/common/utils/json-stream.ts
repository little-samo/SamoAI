import { fixJson } from './json';

export interface PartialFieldUpdate {
  index: number;
  toolName: string;
  argumentKey: string;
  value: string;
  delta: string;
}

interface CurrentObjectState {
  name: string | null;
  inArguments: boolean;
  currentKey: string | null;
  currentValue: string;
  keyDepth: number;
  isComplete: boolean;
  accumulatedValue: string;
  isTrackingField: boolean;
}

/**
 * Converts a pattern with wildcards (*) to a regex pattern
 * @param pattern - e.g., "send_*_message" or "exact_match"
 * @returns RegExp for matching
 */
function patternToRegex(pattern: string): RegExp {
  // Escape special regex characters except *
  const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Replace * with regex pattern for any characters
  const regexPattern = '^' + escapedPattern.replace(/\*/g, '.*') + '$';
  return new RegExp(regexPattern);
}

/**
 * Parses a streaming JSON object in the format {toolCalls: [{...}, {...}, {...}]}
 * and yields complete tool call objects as they arrive
 *
 * Optimized for tool call format:
 * { "toolCalls": [{ "name": "tool_name", "arguments": { "key": "value", ... } }, ...] }
 *
 * Performance Optimizations:
 * - O(n) complexity: Incremental character accumulation (not re-parsing from start)
 * - Flag-based tracking: Single condition check per character for tracked fields
 * - Memory management: Automatic cleanup of completed object field values
 */
export class JsonArrayStreamParser {
  private buffer = '';
  private depth = 0;
  private inString = false;
  private escaped = false;
  private rootObjectStarted = false;
  private arrayStarted = false;
  private objectStartIndex = -1;
  private yieldedCount = 0;
  private trackedPairs: Array<{ pattern: string; regex: RegExp }> = []; // "toolName:argumentKey" pairs (supports wildcards)
  private onFieldUpdate?: (update: PartialFieldUpdate) => void;

  // Current object parsing state
  private currentObject: CurrentObjectState | null = null;
  private fieldValues = new Map<string, string>(); // "index:key" -> value

  // String parsing state
  private currentStringStart = -1;
  private lastJsonKey: string | null = null;
  private lastString: string | null = null;

  /**
   * Set a callback to be notified when specific fields are updated
   */
  public setFieldUpdateCallback(
    callback: (update: PartialFieldUpdate) => void
  ): void {
    this.onFieldUpdate = callback;
  }

  /**
   * Track specific (toolName, argumentKey) pairs for partial updates
   * Supports wildcard patterns with * (e.g., 'send_*_message')
   * @param pairs - e.g., [['send_message', 'message'], ['send_*_message', 'message'], ['send_casual_message', 'casualPolicyViolatingAnswer']]
   */
  public trackToolFields(pairs: Array<[string, string]>): void {
    this.trackedPairs = [];
    for (const [toolName, argumentKey] of pairs) {
      const pattern = `${toolName}:${argumentKey}`;
      this.trackedPairs.push({
        pattern,
        regex: patternToRegex(pattern),
      });
    }
  }

  /**
   * Checks if a toolName:argumentKey pair matches any tracked pattern
   */
  private matchesTrackedPair(toolName: string, argumentKey: string): boolean {
    const pairKey = `${toolName}:${argumentKey}`;
    return this.trackedPairs.some(({ regex }) => regex.test(pairKey));
  }

  /**
   * Extracts the current string value from buffer
   */
  private extractStringValue(startIndex: number, endIndex: number): string {
    let value = '';
    let i = startIndex;

    while (i < endIndex) {
      const char = this.buffer[i];

      if (char === '\\' && i + 1 < endIndex) {
        const nextChar = this.buffer[i + 1];
        // Handle escape sequences
        switch (nextChar) {
          case '"':
          case '\\':
          case '/':
            value += nextChar;
            i += 2;
            break;
          case 'n':
            value += '\n';
            i += 2;
            break;
          case 'r':
            value += '\r';
            i += 2;
            break;
          case 't':
            value += '\t';
            i += 2;
            break;
          default:
            value += char;
            i++;
        }
      } else {
        value += char;
        i++;
      }
    }

    return value;
  }

  /**
   * Resets current object state
   */
  private resetCurrentObject(): void {
    this.currentObject = {
      name: null,
      inArguments: false,
      currentKey: null,
      currentValue: '',
      keyDepth: 0,
      isComplete: false,
      accumulatedValue: '',
      isTrackingField: false,
    };
  }

  /**
   * Emits field update if value has changed
   */
  private emitFieldUpdate(
    index: number,
    toolName: string,
    argumentKey: string,
    newValue: string
  ): void {
    // Don't emit if object is already complete
    if (this.currentObject?.isComplete) {
      return;
    }

    // Only emit for tracked (toolName, argumentKey) pairs
    if (!this.matchesTrackedPair(toolName, argumentKey)) {
      return;
    }

    const fieldKey = `${index}:${argumentKey}`;
    const oldValue = this.fieldValues.get(fieldKey) || '';

    if (newValue !== oldValue && newValue.length > 0) {
      const delta = newValue.substring(oldValue.length);

      if (this.onFieldUpdate && delta.length > 0) {
        this.onFieldUpdate({
          index,
          toolName,
          argumentKey,
          value: newValue,
          delta,
        });
      }

      this.fieldValues.set(fieldKey, newValue);
    }
  }

  /**
   * Processes a chunk of text and yields any complete objects found
   */
  public *processChunk(
    chunk: string
  ): Generator<{ json: string; index: number }> {
    this.buffer += chunk;
    const startPos = this.buffer.length - chunk.length;

    for (let i = startPos; i < this.buffer.length; i++) {
      const char = this.buffer[i];

      // Handle escape sequences
      if (this.escaped) {
        this.escaped = false;
        // If we're tracking a string value, it continues
        continue;
      }

      if (char === '\\' && this.inString) {
        this.escaped = true;
        continue;
      }

      // Track string boundaries
      if (char === '"') {
        if (!this.inString) {
          this.inString = true;
          this.currentStringStart = i + 1;

          // Optimization: Determine if we should track this field ONCE
          if (
            this.currentObject &&
            this.currentObject.name &&
            this.currentObject.inArguments &&
            this.currentObject.currentKey &&
            this.matchesTrackedPair(
              this.currentObject.name,
              this.currentObject.currentKey
            )
          ) {
            this.currentObject.isTrackingField = true;
            this.currentObject.accumulatedValue = '';
          }
        } else {
          this.inString = false;

          // Extract the completed string value
          const stringValue = this.extractStringValue(
            this.currentStringStart,
            i
          );

          // Store the string - we'll determine if it's a key or value when we see the next delimiter
          this.lastString = stringValue;

          // Reset tracking flag when string ends
          if (this.currentObject?.isTrackingField) {
            this.currentObject.isTrackingField = false;
            this.currentObject.accumulatedValue = '';
          }
        }
        continue;
      }

      // Optimization: Incremental character accumulation for tracked fields
      if (this.inString && this.currentObject?.isTrackingField) {
        // Process character with escape handling
        if (this.escaped) {
          // Handle escape sequences incrementally
          switch (char) {
            case '"':
            case '\\':
            case '/':
              this.currentObject.accumulatedValue += char;
              break;
            case 'n':
              this.currentObject.accumulatedValue += '\n';
              break;
            case 'r':
              this.currentObject.accumulatedValue += '\r';
              break;
            case 't':
              this.currentObject.accumulatedValue += '\t';
              break;
            default:
              // Unknown escape, keep the backslash
              this.currentObject.accumulatedValue += '\\' + char;
          }
        } else if (char !== '\\') {
          // Regular character (not a backslash)
          this.currentObject.accumulatedValue += char;
        }

        // Emit update with accumulated value (skip backslash itself)
        if (char !== '\\' || this.escaped) {
          this.emitFieldUpdate(
            this.yieldedCount,
            this.currentObject.name!,
            this.currentObject.currentKey!,
            this.currentObject.accumulatedValue
          );
        }
      }

      // Skip other characters inside strings
      if (this.inString) {
        continue;
      }

      // Track root object start
      if (char === '{' && this.depth === 0 && !this.rootObjectStarted) {
        this.rootObjectStarted = true;
        this.depth++;
        continue;
      }

      // Track toolCalls array start
      if (
        char === '[' &&
        this.depth === 1 &&
        this.lastJsonKey === 'toolCalls' &&
        !this.arrayStarted
      ) {
        this.arrayStarted = true;
        this.depth++;
        continue;
      }

      // Handle string values before structural changes
      if (char === ',' || char === '}' || char === ']') {
        // The last string was a value (or we're at end of object/array)
        if (this.lastString !== null && this.lastJsonKey !== null) {
          // Process the key-value pair
          if (this.currentObject) {
            if (this.lastJsonKey === 'name' && this.depth === 3) {
              this.currentObject.name = this.lastString;
            } else if (
              this.currentObject.inArguments &&
              this.currentObject.currentKey === this.lastJsonKey &&
              this.depth === this.currentObject.keyDepth + 1
            ) {
              // String value completed for tracked argument
              if (
                this.currentObject.name &&
                this.matchesTrackedPair(
                  this.currentObject.name,
                  this.lastJsonKey
                )
              ) {
                this.emitFieldUpdate(
                  this.yieldedCount,
                  this.currentObject.name,
                  this.lastJsonKey,
                  this.lastString
                );
              }
              this.currentObject.currentKey = null;
            }
          }
          this.lastString = null;
          this.lastJsonKey = null;
        }
      }

      // Track object boundaries
      if (char === '{') {
        // Tool call object starts at depth 2 (inside toolCalls array)
        if (this.depth === 2 && this.arrayStarted) {
          this.objectStartIndex = i;
          this.resetCurrentObject();
        }

        // Check if we're entering "arguments" (at depth 3)
        if (
          this.currentObject &&
          this.lastJsonKey === 'arguments' &&
          this.depth === 3
        ) {
          this.currentObject.inArguments = true;
          this.currentObject.keyDepth = this.depth;
        }

        this.depth++;
      } else if (char === '}') {
        this.depth--;

        // Check if we're leaving arguments
        if (
          this.currentObject &&
          this.currentObject.inArguments &&
          this.depth === this.currentObject.keyDepth
        ) {
          this.currentObject.inArguments = false;
          this.currentObject.currentKey = null;
        }

        // Complete tool call object (back to depth 2)
        if (this.depth === 2 && this.objectStartIndex !== -1) {
          // We have a complete tool call object
          if (this.currentObject) {
            this.currentObject.isComplete = true;
          }

          const objectJson = this.buffer.substring(
            this.objectStartIndex,
            i + 1
          );
          yield { json: objectJson, index: this.yieldedCount };

          // Memory cleanup: remove field values for completed object
          for (const key of this.fieldValues.keys()) {
            if (key.startsWith(`${this.yieldedCount}:`)) {
              this.fieldValues.delete(key);
            }
          }

          this.yieldedCount++;
          this.objectStartIndex = -1;
          this.currentObject = null;
          this.lastJsonKey = null;
        }
      } else if (char === ']') {
        this.depth--;
        // Exiting toolCalls array
        if (this.depth === 1 && this.arrayStarted) {
          this.arrayStarted = false;
        }
        this.lastString = null;
      } else if (char === ':') {
        // The last string was a key
        if (this.lastString !== null) {
          this.lastJsonKey = this.lastString;
          this.lastString = null;

          // Check if we're tracking this field in arguments
          if (
            this.currentObject &&
            this.currentObject.inArguments &&
            this.currentObject.name &&
            this.depth === this.currentObject.keyDepth + 1 &&
            this.matchesTrackedPair(this.currentObject.name, this.lastJsonKey)
          ) {
            this.currentObject.currentKey = this.lastJsonKey;
          }
        }
      }
    }
  }

  /**
   * Finalizes parsing and yields any remaining complete objects
   */
  public *finalize(): Generator<{ json: string; index: number }> {
    // If we have a partial tool call object at the end, try to fix and yield it
    if (this.objectStartIndex !== -1 && this.depth >= 2) {
      const partialJson = this.buffer.substring(this.objectStartIndex);
      try {
        const fixedJson = fixJson(partialJson);
        // Verify it's valid JSON before yielding
        JSON.parse(fixedJson);
        yield { json: fixedJson, index: this.yieldedCount };
        this.yieldedCount++;
      } catch {
        // If we can't fix it, just skip it
      }
    }

    // Memory cleanup: clear accumulated field values
    this.fieldValues.clear();
  }

  /**
   * Gets the total count of objects yielded
   */
  public getYieldedCount(): number {
    return this.yieldedCount;
  }

  /**
   * Gets the current buffer content
   */
  public getBuffer(): string {
    return this.buffer;
  }
}
