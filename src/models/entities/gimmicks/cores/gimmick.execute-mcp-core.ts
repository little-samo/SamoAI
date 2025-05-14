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

export type ToolDefinition = {
  name: string;
  schema?: SimplifiedMCPToolSchema;
};

type SimplifiedMCPToolProperty = {
  type?: string;
  description?: string;
  items?: {
    type?: string;
  };
};

type SimplifiedMCPToolSchema = {
  arguments?: Record<string, SimplifiedMCPToolProperty>;
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

@RegisterGimmickCore('execute_mcp')
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

    const argsSchemas: z.ZodTypeAny[] = [];

    for (const toolName of toolNames) {
      if (this.cachedTools[toolName]?.schema) {
        const toolSchema = this.cachedTools[toolName].schema;
        let argumentsDescription: string = 'none';
        if (toolSchema?.arguments) {
          argumentsDescription = Object.entries(toolSchema.arguments)
            .map(([argName, argDef]) => {
              let line = `  - ${argName} (${argDef.type || 'no type'})`;
              if (argDef.description) {
                line += `: ${argDef.description}`;
              }
              if (argDef.items && argDef.items.type) {
                line += ` (items type: ${argDef.items.type})`;
              }
              return line;
            })
            .join('\n');
        }

        let requiredString = 'none';
        if (toolSchema?.required && toolSchema.required.length > 0) {
          requiredString = toolSchema.required.join(', ');
        }

        const totalDescription = [
          `Argument for Tool: ${toolName}`,
          `Arguments: ${argumentsDescription}`,
          `Required: ${requiredString}`,
        ].join('\n');

        const toolArgumentSchema = z
          .record(z.string(), z.unknown())
          .describe(totalDescription);
        argsSchemas.push(toolArgumentSchema);
      }
    }

    const argsSchema = z.union(
      argsSchemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]
    );

    return z.object({
      tool: toolEnum.describe(
        "The specific tool offered by this Gimmick that you wish to use. Each tool performs a distinct function and requires specific arguments. Consult this Gimmick\'s main description for details on available tools, their functions, and their respective argument schemas."
      ),
      args: argsSchema.describe(
        'The arguments for the selected tool. These must precisely match the arguments schema defined for that specific tool. Be sure to include all required properties.'
      ),
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

  private async fetchAndCacheTools(): Promise<void> {
    try {
      const client = await this.createMcpClient();

      const toolsList = await client.listTools();

      if (ENV.DEBUG) {
        console.log(
          'MCP Init - Available Tools List:',
          JSON.stringify(toolsList, null, 2)
        );
      }

      if (toolsList && toolsList.tools && Array.isArray(toolsList.tools)) {
        const newToolsMap: Record<string, ToolDefinition> = {};

        for (const tool of toolsList.tools) {
          const schema = {} as SimplifiedMCPToolSchema;

          if (
            tool.inputSchema.properties &&
            typeof tool.inputSchema.properties === 'object'
          ) {
            const properties: Record<string, SimplifiedMCPToolProperty> = {};

            for (const [key, prop] of Object.entries(
              tool.inputSchema.properties
            )) {
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

            schema.arguments = properties;
          }

          if (Array.isArray(tool.inputSchema.required)) {
            schema.required = tool.inputSchema.required.filter(
              (field: string) => field !== 'credentials'
            );
          }

          newToolsMap[tool.name] = {
            name: tool.name,
            schema: schema,
          };
        }

        this.cachedTools = newToolsMap;
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
