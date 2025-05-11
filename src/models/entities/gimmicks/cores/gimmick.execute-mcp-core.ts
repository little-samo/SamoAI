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

// mcp server tools response schema
const inputSchemaPropertySchema = z
  .object({
    type: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

const inputSchemaSchema = z
  .object({
    type: z.string().optional(),
    properties: z.record(z.string(), inputSchemaPropertySchema).optional(),
    description: z.string().optional(),
  })
  .passthrough();

const mcpToolSchema = z
  .object({
    name: z.string(),
    inputSchema: inputSchemaSchema.optional(),
  })
  .passthrough();

const mcpToolsListResponseSchema = z
  .object({
    tools: z.array(mcpToolSchema),
  })
  .passthrough();

export type ToolDefinition = {
  name: string;
  schema?: unknown;
};

type SimplifiedMCPToolProperty = {
  type?: string;
  description?: string;
  items?: {
    type?: string;
  };
};

type SimplifiedMCPToolSchema = {
  properties?: Record<string, SimplifiedMCPToolProperty>;
  required?: string[];
};

// gimmick options schema
const GimmickExecuteMcpCoreOptionsSchema = z.object({
  serverUrl: z.string().min(1, 'serverUrl is required'),
  serverName: z.string().min(1, 'serverName is required'),
  serverDescription: z.string().min(1, 'serverDescription is required'),

  clientName: z.string().optional(),
  clientVersion: z.string().optional(),
});

export type McpGimmickOptions = z.infer<
  typeof GimmickExecuteMcpCoreOptionsSchema
>;

export interface GimmickExecuteMcpCoreParameters {
  tool: string;
  args: Record<string, unknown>;
}

@RegisterGimmickCore('execute-mcp')
export class GimmickExecuteMcpCore extends GimmickCore {
  private static readonly DEFAULT_MCP_CLIENT_NAME = 'samo-ai';
  private static readonly DEFAULT_MCP_CLIENT_VERSION = packageJson.version;

  private cachedTools: Record<string, ToolDefinition> = {};

  public constructor(gimmick: Gimmick, meta: GimmickCoreMeta) {
    super(gimmick, meta);

    if (!this.canvas) {
      throw new Error(`Gimmick ${this.gimmick.name} has no canvas`);
    }

    try {
      GimmickExecuteMcpCoreOptionsSchema.parse(this.options);
      this.cachedTools = {};
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
    const toolNames = this.tools;

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

  private get tools(): string[] {
    const allTools = Object.keys(this.cachedTools);
    return allTools;
  }

  private get toolDefinitions(): Record<string, ToolDefinition> {
    return this.cachedTools;
  }

  private async createMcpClient(): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(
      new URL('mcp', this.serverUrl)
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
    return client;
  }

  private simplifySchema(
    schema: z.infer<typeof inputSchemaSchema> | undefined
  ): SimplifiedMCPToolSchema | undefined {
    if (!schema || typeof schema !== 'object') {
      return undefined;
    }

    const result: SimplifiedMCPToolSchema = {};

    if (schema.properties && typeof schema.properties === 'object') {
      const properties: Record<string, SimplifiedMCPToolProperty> = {};

      for (const [key, prop] of Object.entries(schema.properties)) {
        if (key !== 'credentials' && typeof prop === 'object') {
          const typedProp = prop as Record<string, unknown>;

          properties[key] = {
            type: typedProp.type as string | undefined,
            description: typedProp.description as string | undefined,
          };

          if (typedProp.type === 'array' && typedProp.items) {
            properties[key].items = {
              type:
                typeof typedProp.items === 'object'
                  ? ((typedProp.items as Record<string, unknown>).type as
                      | string
                      | undefined)
                  : undefined,
            };
          }
        }
      }

      result.properties = properties;
    }

    if (Array.isArray(schema.required)) {
      result.required = schema.required.filter(
        (field) => field !== 'credentials'
      );
    }

    return result;
  }

  private async fetchAndCacheTools(): Promise<void> {
    try {
      const client = await this.createMcpClient();

      const resultTools = await client.listTools();

      if (ENV.DEBUG) {
        console.log(
          'MCP Init - Available Tools List:',
          JSON.stringify(resultTools, null, 2)
        );
      }

      const toolsList = mcpToolsListResponseSchema.parse(resultTools);

      if (toolsList && toolsList.tools && Array.isArray(toolsList.tools)) {
        const newToolsMap: Record<string, ToolDefinition> = {};

        for (const tool of toolsList.tools) {
          newToolsMap[tool.name] = {
            name: tool.name,
            schema: this.simplifySchema(tool.inputSchema),
          };
        }

        this.cachedTools = {
          ...this.cachedTools,
          ...newToolsMap,
        };
      }

      await client.close();
    } catch (error) {
      console.error(
        `[Gimmick ${this.gimmick.name}] MCP tools fetch error:`,
        error
      );
      throw error;
    }
  }

  private async callMcpServer(
    entity: Entity,
    tool: string,
    args: Record<string, unknown>
  ): Promise<void> {
    const client = await this.createMcpClient();

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

    await entity.location.addGimmickMessage(this.gimmick, {
      message: `Executed: ${tool}`,
    });

    await entity.location.emitAsync(
      'gimmickExecuted',
      this.gimmick,
      entity,
      result
    );

    await client.close();
  }

  public override async init(): Promise<void> {
    await super.init();
    await this.fetchAndCacheTools();
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

    if (!this.tools.includes(tool)) {
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
