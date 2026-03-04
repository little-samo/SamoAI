import {
  fixJson,
  parseAndFixJson,
  safeParseJson,
  extractJsonBlocksFromText,
} from './json';

describe('extractJsonBlocksFromText', () => {
  it('should extract JSON from ```json code fence', () => {
    const input = 'Here is the result:\n```json\n{"key": "value"}\n```';
    expect(extractJsonBlocksFromText(input)).toBe('{"key": "value"}');
  });

  it('should return original string when no code fence', () => {
    const input = '{"key": "value"}';
    expect(extractJsonBlocksFromText(input)).toBe(input);
  });
});

describe('fixJson', () => {
  describe('basic functionality', () => {
    it('should pass through valid JSON unchanged', () => {
      const input = '{"name": "test", "value": 42}';
      expect(JSON.parse(fixJson(input))).toEqual({ name: 'test', value: 42 });
    });

    it('should handle valid JSON arrays', () => {
      const input = '[1, 2, 3]';
      expect(JSON.parse(fixJson(input))).toEqual([1, 2, 3]);
    });
  });

  describe('LLM line-wrapping artifacts', () => {
    it('should fix literal newlines inside string values', () => {
      const input = '{"message": "hello\nworld"}';
      const result = JSON.parse(fixJson(input));
      expect(result.message).toBe('helloworld');
    });

    it('should fix word broken by newline + spaces ("e \\n       xisting_content")', () => {
      const input =
        '{"e \n       xisting_content": "old value", "new_content": "new value"}';
      const result = JSON.parse(fixJson(input));
      expect(result).toHaveProperty('existing_content');
      expect(result.existing_content).toBe('old value');
    });

    it('should fix number broken by newline + spaces ("22 \\n :00")', () => {
      const input = '{"time": "22 \n       :00 UTC"}';
      const result = JSON.parse(fixJson(input));
      expect(result.time).toBe('22:00 UTC');
    });

    it('should fix multiple line-wrapping artifacts in one string', () => {
      const input = '{"msg": "hel \n  lo wo \n  rld"}';
      const result = JSON.parse(fixJson(input));
      expect(result.msg).toBe('hello world');
    });

    it('should strip \\r\\n (CRLF) line endings', () => {
      const input = '{"msg": "hello\r\nworld"}';
      const result = JSON.parse(fixJson(input));
      expect(result.msg).toBe('helloworld');
    });

    it('should preserve escaped \\n (two-char sequence) inside strings', () => {
      const input = '{"msg": "line1\\nline2"}';
      const result = JSON.parse(fixJson(input));
      expect(result.msg).toBe('line1\nline2');
    });

    it('should preserve escaped \\\\ followed by n', () => {
      const input = '{"msg": "path\\\\name"}';
      const result = JSON.parse(fixJson(input));
      expect(result.msg).toBe('path\\name');
    });
  });

  describe('comment removal', () => {
    it('should remove single-line comments', () => {
      const input = '{\n"key": "value" // this is a comment\n}';
      const result = JSON.parse(fixJson(input));
      expect(result.key).toBe('value');
    });

    it('should remove multi-line comments', () => {
      const input = '{"key": /* comment */ "value"}';
      const result = JSON.parse(fixJson(input));
      expect(result.key).toBe('value');
    });

    it('should not strip // inside strings', () => {
      const input = '{"url": "https://example.com"}';
      const result = JSON.parse(fixJson(input));
      expect(result.url).toBe('https://example.com');
    });
  });

  describe('trailing commas', () => {
    it('should remove trailing comma in object', () => {
      const input = '{"a": 1, "b": 2,}';
      const result = JSON.parse(fixJson(input));
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should remove trailing comma in array', () => {
      const input = '[1, 2, 3,]';
      const result = JSON.parse(fixJson(input));
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('unclosed structures', () => {
    it('should close unclosed object', () => {
      const input = '{"key": "value"';
      const result = JSON.parse(fixJson(input));
      expect(result.key).toBe('value');
    });

    it('should close unclosed string and object', () => {
      const input = '{"key": "value';
      const result = JSON.parse(fixJson(input));
      expect(result.key).toBe('value');
    });

    it('should close unclosed array', () => {
      const input = '["a", "b"';
      const result = JSON.parse(fixJson(input));
      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('excess closing brackets', () => {
    it('should skip excess closing brace', () => {
      const input = '{"key": "value"}}';
      const result = JSON.parse(fixJson(input));
      expect(result.key).toBe('value');
    });

    it('should skip excess closing bracket', () => {
      const input = '["a", "b"]]';
      const result = JSON.parse(fixJson(input));
      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('LLM prefixes and tags', () => {
    it('should remove [TOOL_CALLS] prefix', () => {
      const input = '[TOOL_CALLS]\n{"name": "test"}';
      const result = JSON.parse(fixJson(input));
      expect(result.name).toBe('test');
    });

    it('should remove <tool_calls> tags', () => {
      const input = '<tool_calls>\n{"name": "test"}\n</tool_calls>';
      const result = JSON.parse(fixJson(input));
      expect(result.name).toBe('test');
    });
  });

  describe('real-world Anthropic error case', () => {
    it('should fix the full malformed tool call JSON from the bug report', () => {
      const input = `{"toolCalls": [{"name": "send_message", "arguments": {"message": "GitLab (GTLB) 시장 분석 결과를 보고합니다.\\n\\n**마감**: 22 \n       :00 UTC (약 17.5시간 후) — 6~24시간 조건 충족\\n**현재가**: 0.895", "expression": "고개를 끄덕이며"}}, {"name": "edit_agent_canvas", "arguments": {"name": "plan", "e \n       xisting_content": "- [ ] 2-1: GitLab GTLB Earnings", "new_content": "- [x] 2-1: GitLab GTLB Earnings — 승인"}}]}`;

      const result = JSON.parse(fixJson(input));

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('send_message');
      expect(result.toolCalls[0].arguments.message).toContain('22:00 UTC');
      expect(result.toolCalls[1].name).toBe('edit_agent_canvas');
      expect(result.toolCalls[1].arguments).toHaveProperty('existing_content');
      expect(result.toolCalls[1].arguments.existing_content).toBe(
        '- [ ] 2-1: GitLab GTLB Earnings'
      );
    });
  });
});

describe('parseAndFixJson', () => {
  it('should parse valid JSON directly', () => {
    const result = parseAndFixJson('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('should fix and parse broken JSON', () => {
    const result = parseAndFixJson('{"key": "value"');
    expect(result).toEqual({ key: 'value' });
  });

  it('should throw on completely invalid input', () => {
    expect(() => parseAndFixJson('not json at all')).toThrow();
  });
});

describe('safeParseJson', () => {
  it('should return parsed value on success', () => {
    expect(safeParseJson('{"key": "value"}')).toEqual({ key: 'value' });
  });

  it('should return null on failure', () => {
    expect(safeParseJson('not json at all')).toBeNull();
  });
});
