import { ENV } from '@little-samo/samo-ai/common';
import { Entity } from '@little-samo/samo-ai/models/entities/entity';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

import packageJson from '../../../../../package.json';
import { type Gimmick } from '../gimmick';
import { type GimmickCoreMeta } from '../gimmick.meta';
import { GimmickParameters } from '../gimmick.types';

import { GimmickCore } from './gimmick.core';
import { RegisterGimmickCore } from './gimmick.core-decorator';

const toolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  schema: z.any().optional(),
});

const GimmickExecuteMcpCoreOptionsSchema = z.object({
  serverUrl: z.string().min(1, 'serverUrl is required'),
  serverName: z.string().min(1, 'serverName is required'),
  serverDescription: z.string().min(1, 'serverDescription is required'),

  clientName: z.string().optional(),
  clientVersion: z.string().optional(),

  tools: z
    .record(z.string(), toolDefinitionSchema)
    .refine((val) => Object.keys(val).length > 0, {
      message: 'At least one tool is required',
    }),
});

export type McpGimmickOptions = z.infer<
  typeof GimmickExecuteMcpCoreOptionsSchema
>;
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

export interface GimmickExecuteMcpCoreParameters {
  tool: string;
  args: Record<string, unknown>;
}

@RegisterGimmickCore('execute-mcp')
export class GimmickExecuteMcpCore extends GimmickCore {
  private static readonly DEFAULT_MCP_CLIENT_NAME = 'samo-ai';
  private static readonly DEFAULT_MCP_CLIENT_VERSION = packageJson.version;

  public constructor(gimmick: Gimmick, meta: GimmickCoreMeta) {
    super(gimmick, meta);

    if (!this.canvas) {
      throw new Error(`Gimmick ${this.gimmick.name} has no canvas`);
    }

    try {
      GimmickExecuteMcpCoreOptionsSchema.parse(this.options);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        throw new Error(
          `[Gimmick ${this.gimmick.name}] MCP configuration error: ${errorMessage}`
        );
      }
      throw new Error(
        `[Gimmick ${this.gimmick.name}] Error validating MCP configuration`
      );
    }
  }

  public override get options(): McpGimmickOptions {
    return this.meta.options as McpGimmickOptions;
  }

  public override get description(): string {
    return this.options.serverDescription;
  }

  public override get parameters(): z.ZodSchema {
    const toolNames = this.toolNames;

    const toolEnum = z.enum(toolNames as [string, ...string[]]);

    return z.object({
      tool: toolEnum.describe('MCP tool name to call'),
      args: z.any().describe('Arguments to pass to the tool'),
    });
  }

  private get serverName(): string {
    return this.options.serverName;
  }

  private get serverUrl(): string {
    return this.options.serverUrl;
  }

  private get toolNames(): string[] {
    const allTools = Object.keys(this.options.tools);
    return allTools;
  }

  private get toolDefinitions(): Record<string, ToolDefinition> {
    return this.options.tools;
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

  private async callMcpServer(
    entity: Entity,
    tool: string,
    args: Record<string, unknown>
  ): Promise<void> {
    const transport = new StreamableHTTPClientTransport(
      new URL('/mcp', this.serverUrl)
    );

    const client = new Client({
      name:
        this.options.clientName ??
        GimmickExecuteMcpCore.DEFAULT_MCP_CLIENT_NAME,
      version:
        this.options.clientVersion ??
        GimmickExecuteMcpCore.DEFAULT_MCP_CLIENT_VERSION,
    });

    await client.connect(transport);
    if (ENV.DEBUG) {
      console.log(
        `Connected to MCP server: ${this.serverName} - ${this.serverUrl}/mcp`
      );
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

    const maxResultLength = this.canvas!.maxLength - 100;

    if (result.length > maxResultLength) {
      result =
        result.substring(0, maxResultLength) +
        `\n\n... [Result too long, ${result.length - maxResultLength} characters truncated] ...`;
    }

    if (ENV.DEBUG) {
      console.log(
        `Gimmick ${this.gimmick.name} - ${this.serverName} executed: ${tool}`
      );
    }

    await entity.updateCanvas(this.canvas!.name, result);

    const toolDescription = this.getToolDescription(tool);
    await entity.location.addGimmickMessage(this.gimmick, {
      message: `Executed: ${tool} - ${toolDescription}`,
    });

    await entity.location.emitAsync(
      'gimmickExecuted',
      this.gimmick,
      entity,
      result
    );

    await client.close();
  }

  public override async update(): Promise<boolean> {
    return false;
  }

  public override async execute(
    entity: Entity,
    parameters: GimmickParameters
  ): Promise<string | undefined> {
    if (!parameters || typeof parameters !== 'object') {
      return 'Invalid parameters';
    }

    const coreParameters =
      parameters as object as GimmickExecuteMcpCoreParameters;
    const { tool } = coreParameters;
    let { args } = coreParameters;

    if (!tool || !args) {
      return 'Required parameters missing (tool, args)';
    }

    if (!this.toolNames.includes(tool)) {
      return `Unsupported tool: ${tool}`;
    }

    const entityArguments = this.meta.entityArguments?.[entity.key];
    if (entityArguments) {
      args = { ...entityArguments, ...args };
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
  }
}
