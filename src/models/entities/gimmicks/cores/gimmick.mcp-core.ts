import { Entity } from '@little-samo/samo-ai/models/entities/entity';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ENV } from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { type LocationEntityCanvasMeta } from '../../../locations/location.meta';
import { GimmickParameters } from '../gimmick.types';

import { GimmickCore } from './gimmick.core';
import { RegisterGimmickCore } from './gimmick.core-decorator';

const toolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  schema: z.any().optional()
});

const mcpGimmickOptionsSchema = z.object({
  serverUrl: z.string().min(1, "serverUrl is required"),
  serverName: z.string().min(1, "serverName is required"),
  serverDescription: z.string().min(1, "serverDescription is required"),
  
  tools: z.record(z.string(), toolDefinitionSchema)
    .refine((val) => Object.keys(val).length > 0, {
      message: "At least one tool is required"
    }),
  
  // TODO: check if canvas should be individualized for each Entity
  canvasName: z.string().optional(),
  canvasDescription: z.string().optional(),
  maxResultLength: z.number().positive().optional(),

  // Default credentials
  // TODO: check if credentials should be individualized for each Entity
  credentials: z.record(z.string(), z.unknown()).optional()
});

export type McpGimmickOptions = z.infer<typeof mcpGimmickOptionsSchema>;
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

@RegisterGimmickCore('mcp')
export class GimmickMcpCore extends GimmickCore {
  private static readonly DEFAULT_MAX_RESULT_LENGTH = 2000;
  private static readonly MCP_CLIENT_NAME = 'samo-ai-mcp-client';
  private static readonly MCP_CLIENT_VERSION = '1.0.0';
  private _validatedOptions: McpGimmickOptions | null = null;
  
  private validateOptions(): string | null {
    try {
      const rawOptions = this.meta.options || {};
      this._validatedOptions = mcpGimmickOptionsSchema.parse(rawOptions);
      return null;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      }
      return 'Error validating options';
    }
  }
  
  private get mcpOptions(): McpGimmickOptions {
    if (!this._validatedOptions) {
      const validationError = this.validateOptions();
      if (validationError) {
        console.error(`MCP gimmick option error: ${validationError}`);
        throw new Error(`MCP gimmick option error: ${validationError}`);
      }
    }
    return this._validatedOptions!;
  }
  
  private get serverName(): string {
    return this.mcpOptions.serverName;
  }

  private get serverUrl(): string {
    return this.mcpOptions.serverUrl;
  }
    
  public override get description(): string {
    return this.mcpOptions.serverDescription;
  }

  public override get parameters(): z.ZodSchema {
    const toolNames = this.toolNames;
    
    const toolEnum = z.enum(toolNames as [string, ...string[]]);
    
    return z.object({
      tool: toolEnum.describe('MCP tool name to call'),
      args: z.any().describe('Arguments to pass to the tool')
    });
  }

  private get toolNames(): string[] {
    const allTools = Object.keys(this.mcpOptions.tools);
    return allTools;
  }

  private get toolDefinitions(): Record<string, ToolDefinition> {
    return this.mcpOptions.tools;
  }

  private getToolDefinition(toolName: string): ToolDefinition | undefined {
    return this.toolDefinitions[toolName];
  }

  private getToolDescription(toolName: string): string {
    const toolDef = this.getToolDefinition(toolName);
    if (!toolDef || !toolDef.description) {
      throw new Error(`Tool definition not found: ${toolName}`);
    }
    return toolDef.description;
  }

  private get mcpCanvasName(): string {
    return this.mcpOptions.canvasName || `mcp_${this.serverName}_result`;
  }

  private get mcpCanvasDescription(): string {
    return this.mcpOptions.canvasDescription || 
           `Displays results returned from the ${this.serverName} MCP server.`;
  }


  private get maxResultLength(): number {
    return this.mcpOptions.maxResultLength || GimmickMcpCore.DEFAULT_MAX_RESULT_LENGTH;
  }

  public override get canvas(): LocationEntityCanvasMeta {
    return {
      name: this.mcpCanvasName,
      description: this.mcpCanvasDescription,
      maxLength: this.maxResultLength,
    };
  }

  private async callMcpServer(
    entity: Entity,
    tool: string,
    args: any
  ): Promise<void> {
    try {
      this.mcpOptions;
      
      if (!this.toolNames.includes(tool)) {
        throw new Error(`Unsupported tool: ${tool}`);
      }
      
      const transport = new StreamableHTTPClientTransport(
        new URL(`${this.serverUrl}/mcp`)
      );
      
      const client = new Client({
        name: GimmickMcpCore.MCP_CLIENT_NAME,
        version: GimmickMcpCore.MCP_CLIENT_VERSION,
      });

      await client.connect(transport);
      if (ENV.DEBUG) {
        console.log(`Connected to MCP server: ${this.serverName} - ${this.serverUrl}/mcp`);
      }

      const rawResult = await client.callTool({
        name: tool,
        arguments: args,
      });

      let result = '';
      if (rawResult && typeof rawResult === 'object') {
        if (rawResult.content && Array.isArray(rawResult.content)) {
          for (const item of rawResult.content) {
            if (item.type === 'text' && item.text) {
              result += item.text + '\n';
            }
          }
        } else {
          result = JSON.stringify(rawResult, null, 2);
        }
      } else {
        result = String(rawResult);
      }

      const maxResultLength = this.maxResultLength;
      const maxSummaryLength = this.gimmick.location.meta.messageLengthLimit || 200;

      if (result.length > maxResultLength) {
        result = result.substring(0, maxResultLength) + 
          `\n\n... [Result too long, ${result.length - maxResultLength} characters truncated] ...`;
      }

      const toolDescription = this.getToolDescription(tool);
      const summary = `${this.serverName}: ${toolDescription} - ${
        result.length > maxSummaryLength ? result.substring(0, maxSummaryLength) + '...' : result
      }`;

      if (ENV.DEBUG) {
        console.log(`Gimmick ${this.gimmick.name} - ${this.serverName} executed: ${tool}`);
      }

      await entity.updateCanvas(this.mcpCanvasName, result);
      await entity.location.addGimmickMessage(this.gimmick, {
        message: summary,
      });
      
      await entity.location.emitAsync(
        'gimmickExecuted',
        this.gimmick,
        entity,
        summary
      );
      
      await client.close();
    } catch (error: any) {
      throw new Error(`MCP server call error: ${error.message}`);
    }
  }

  public override async update(): Promise<boolean> {
    return false;
  }

  public override async execute(
    entity: Entity,
    parameters: GimmickParameters
  ): Promise<string | undefined> {
    const validationError = this.validateOptions();
    if (validationError) {
      return `MCP configuration error: ${validationError}`;
    }
    
    if (!parameters || typeof parameters !== 'object') {
      return 'Invalid parameters';
    }

    try {
      const { tool, args } = parameters as {
        tool: string;
        args: any;
      };

      if (!tool || !args) {
        return 'Required parameters missing (tool, args)';
      }

      if (!this.toolNames.includes(tool)) {
        return `Unsupported tool: ${tool}`;
      }
      
      const credentials = this.mcpOptions.credentials;
      if (args && !args.credentials && credentials) {
        args.credentials = credentials;
      }

      const promise = this.callMcpServer(entity, tool, args);
      
      await this.gimmick.location.emitAsync(
        'gimmickExecuting',
        this.gimmick,
        entity,
        parameters,
        promise
      );

      return undefined;
    } catch (error: any) {
      return `MCP execution error: ${error.message}`;
    }
  }
} 