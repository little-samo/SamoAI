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
  private trackedPairs = new Set<string>(); // "toolName:argumentKey" pairs
  private onFieldUpdate?: (update: PartialFieldUpdate) => void;

  // Current object parsing state
  private currentObject: CurrentObjectState | null = null;
  private fieldValues = new Map<string, string>(); // "index:key" -> value

  // String parsing state
  private currentStringStart = -1;
  private lastJsonKey: string | null = null;

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
   * @param pairs - e.g., [['send_message', 'message'], ['send_casual_message', 'casualPolicyViolatingAnswer']]
   */
  public trackToolFields(pairs: Array<[string, string]>): void {
    this.trackedPairs.clear();
    for (const [toolName, argumentKey] of pairs) {
      this.trackedPairs.add(`${toolName}:${argumentKey}`);
    }
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
    const pairKey = `${toolName}:${argumentKey}`;
    if (!this.trackedPairs.has(pairKey)) {
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
            this.trackedPairs.has(
              `${this.currentObject.name}:${this.currentObject.currentKey}`
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

          // Check if this is a JSON key (followed by ':')
          let isKey = false;
          for (let j = i + 1; j < this.buffer.length; j++) {
            const c = this.buffer[j];
            if (c === ':') {
              isKey = true;
              break;
            } else if (c !== ' ' && c !== '\n' && c !== '\t' && c !== '\r') {
              break;
            }
          }

          if (isKey) {
            this.lastJsonKey = stringValue;
          } else if (this.lastJsonKey) {
            // This is a value for the last key
            if (this.currentObject) {
              if (this.lastJsonKey === 'name' && this.depth === 3) {
                this.currentObject.name = stringValue;
              } else if (
                this.currentObject.inArguments &&
                this.currentObject.currentKey === this.lastJsonKey &&
                this.depth === this.currentObject.keyDepth + 1
              ) {
                // String value completed for tracked argument
                if (
                  this.currentObject.name &&
                  this.trackedPairs.has(
                    `${this.currentObject.name}:${this.lastJsonKey}`
                  )
                ) {
                  this.emitFieldUpdate(
                    this.yieldedCount,
                    this.currentObject.name,
                    this.lastJsonKey,
                    stringValue
                  );
                }
                this.currentObject.currentKey = null;
              }

              // Reset tracking flag when string ends
              if (this.currentObject.isTrackingField) {
                this.currentObject.isTrackingField = false;
                this.currentObject.accumulatedValue = '';
              }
            }

            this.lastJsonKey = null;
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
      } else if (
        char === ':' &&
        this.currentObject &&
        this.lastJsonKey &&
        this.depth === 3
      ) {
        // Found a key-value separator at tool call object root level
        // Next value could be for "name" or start of "arguments"
      } else if (
        char === ':' &&
        this.currentObject &&
        this.currentObject.inArguments &&
        this.lastJsonKey &&
        this.depth === this.currentObject.keyDepth + 1
      ) {
        // We just found a key in arguments
        // Check if this (toolName, argumentKey) pair is tracked
        if (
          this.currentObject.name &&
          this.trackedPairs.has(
            `${this.currentObject.name}:${this.lastJsonKey}`
          )
        ) {
          this.currentObject.currentKey = this.lastJsonKey;
        }
      }
    }
  }

  /**
   * Finalizes parsing and yields any remaining complete objects
   */
  public *finalize(): Generator<{ json: string; index: number }> {
    // If we have a partial tool call object at the end, try to fix and yield it
    if (this.objectStartIndex !== -1 && this.depth > 2) {
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
