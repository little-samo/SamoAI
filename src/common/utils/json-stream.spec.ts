import { JsonArrayStreamParser } from './json-stream';

function collectResults(
  parser: JsonArrayStreamParser,
  chunks: string[]
): Array<{ json: string; index: number }> {
  const results: Array<{ json: string; index: number }> = [];
  for (const chunk of chunks) {
    for (const result of parser.processChunk(chunk)) {
      results.push(result);
    }
  }
  for (const result of parser.finalize()) {
    results.push(result);
  }
  return results;
}

function feedAsStream(
  parser: JsonArrayStreamParser,
  input: string,
  chunkSize = 10
): Array<{ json: string; index: number }> {
  const chunks: string[] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    chunks.push(input.substring(i, i + chunkSize));
  }
  return collectResults(parser, chunks);
}

describe('JsonArrayStreamParser', () => {
  describe('basic parsing', () => {
    it('should parse a single tool call in one chunk', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "test", "arguments": {"key": "value"}}]}';
      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.name).toBe('test');
      expect(parsed.arguments.key).toBe('value');
      expect(results[0].index).toBe(0);
    });

    it('should parse multiple tool calls', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "tool1", "arguments": {"a": 1}}, {"name": "tool2", "arguments": {"b": 2}}]}';
      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(2);
      expect(JSON.parse(results[0].json).name).toBe('tool1');
      expect(JSON.parse(results[1].json).name).toBe('tool2');
      expect(results[0].index).toBe(0);
      expect(results[1].index).toBe(1);
    });

    it('should handle streaming (small chunks)', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "test", "arguments": {"msg": "hello"}}]}';
      const results = feedAsStream(parser, input, 5);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.name).toBe('test');
      expect(parsed.arguments.msg).toBe('hello');
    });
  });

  describe('line-wrapping artifact recovery', () => {
    it('should fix literal newlines inside string values', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "send_message", "arguments": {"message": "hello\nworld"}}]}';
      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.arguments.message).toBe('helloworld');
    });

    it('should fix word broken by newline + spaces in key name', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "edit", "arguments": {"e \n       xisting_content": "old", "new_content": "new"}}]}';
      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.arguments).toHaveProperty('existing_content');
      expect(parsed.arguments.existing_content).toBe('old');
    });

    it('should fix number broken by newline + spaces in value', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "report", "arguments": {"time": "22 \n       :00 UTC"}}]}';
      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.arguments.time).toBe('22:00 UTC');
    });

    it('should preserve escaped \\n (valid JSON escape)', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "msg", "arguments": {"text": "line1\\nline2"}}]}';
      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.arguments.text).toBe('line1\nline2');
    });

    it('should handle line-wrapping in streaming mode', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "edit", "arguments": {"e \n       xisting_content": "val"}}]}';
      const results = feedAsStream(parser, input, 7);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.arguments).toHaveProperty('existing_content');
    });

    it('should strip control characters', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "test", "arguments": {"msg": "hel\x01lo"}}]}';
      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.arguments.msg).toBe('hello');
    });
  });

  describe('excess closing bracket recovery', () => {
    it('should handle excess } at array level', () => {
      const parser = new JsonArrayStreamParser();
      const input = '{"toolCalls": [{"name": "test", "arguments": {"a": 1}}}]}';
      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.name).toBe('test');
    });
  });

  describe('real-world Anthropic error case', () => {
    it('should recover the full malformed multi-tool-call JSON', () => {
      const parser = new JsonArrayStreamParser();
      const input = `{"toolCalls": [{"name": "send_message", "arguments": {"message": "GitLab (GTLB) 시장 분석 결과를 보고합니다.\\n\\n**마감**: 22 \n       :00 UTC (약 17.5시간 후)", "expression": "고개를 끄덕이며"}}, {"name": "edit_agent_canvas", "arguments": {"name": "plan", "e \n       xisting_content": "- [ ] 2-1: GitLab GTLB Earnings", "new_content": "- [x] 승인"}}, {"name": "execute_gimmick", "arguments": {"gimmickKey": "gimmick:2", "reason": "Elon Musk", "parameters": {"tool": "get_market", "args": {"co \n       ndition_id": "0xd19d790"}}}}]}`;

      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(3);

      const tool1 = JSON.parse(results[0].json);
      expect(tool1.name).toBe('send_message');
      expect(tool1.arguments.message).toContain('22:00 UTC');

      const tool2 = JSON.parse(results[1].json);
      expect(tool2.name).toBe('edit_agent_canvas');
      expect(tool2.arguments).toHaveProperty('existing_content');
      expect(tool2.arguments.existing_content).toBe(
        '- [ ] 2-1: GitLab GTLB Earnings'
      );

      const tool3 = JSON.parse(results[2].json);
      expect(tool3.name).toBe('execute_gimmick');
      expect(tool3.arguments.parameters.args).toHaveProperty('condition_id');
      expect(tool3.arguments.parameters.args.condition_id).toBe('0xd19d790');
    });

    it('should handle the same error case in streaming mode', () => {
      const parser = new JsonArrayStreamParser();
      const input = `{"toolCalls": [{"name": "send_message", "arguments": {"message": "마감: 22 \n       :00 UTC", "expression": "표정"}}, {"name": "edit_agent_canvas", "arguments": {"name": "plan", "e \n       xisting_content": "- [ ] 2-1: GitLab", "new_content": "- [x] 승인"}}]}`;

      const results = feedAsStream(parser, input, 13);

      expect(results).toHaveLength(2);

      const tool1 = JSON.parse(results[0].json);
      expect(tool1.arguments.message).toContain('22:00 UTC');

      const tool2 = JSON.parse(results[1].json);
      expect(tool2.arguments).toHaveProperty('existing_content');
    });
  });

  describe('finalize', () => {
    it('should yield partial tool call on finalize', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "test", "arguments": {"key": "value"';
      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.name).toBe('test');
      expect(parsed.arguments.key).toBe('value');
    });

    it('should fix line-wrapping in finalized partial JSON', () => {
      const parser = new JsonArrayStreamParser();
      const input =
        '{"toolCalls": [{"name": "edit", "arguments": {"e \n       xisting_content": "old"';
      const results = collectResults(parser, [input]);

      expect(results).toHaveLength(1);
      const parsed = JSON.parse(results[0].json);
      expect(parsed.arguments).toHaveProperty('existing_content');
    });
  });

  describe('field update tracking', () => {
    it('should emit partial field updates for tracked fields', () => {
      const parser = new JsonArrayStreamParser();
      const updates: Array<{
        index: number;
        toolName: string;
        argumentKey: string;
        value: string;
        delta: string;
      }> = [];

      parser.trackToolFields([['send_message', 'message']]);
      parser.setFieldUpdateCallback((update) => {
        updates.push(update);
      });

      const input =
        '{"toolCalls": [{"name": "send_message", "arguments": {"message": "hello world"}}]}';
      feedAsStream(parser, input, 3);

      expect(updates.length).toBeGreaterThan(0);
      const lastUpdate = updates[updates.length - 1];
      expect(lastUpdate.toolName).toBe('send_message');
      expect(lastUpdate.argumentKey).toBe('message');
      expect(lastUpdate.value).toBe('hello world');
    });
  });
});
