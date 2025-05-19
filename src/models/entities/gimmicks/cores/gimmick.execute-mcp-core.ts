import { ENV } from '@little-samo/samo-ai/common';
import { Entity } from '@little-samo/samo-ai/models/entities/entity';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

import packageJson from '../../../../../package.json';
import { type Gimmick } from '../gimmick';
import { GimmickEntityArguments, type GimmickCoreMeta } from '../gimmick.meta';
import { GimmickParameters } from '../gimmick.types';

import { GimmickCore } from './gimmick.core';
import { RegisterGimmickCore } from './gimmick.core-decorator';

export type McpToolDefinition = {
  name: string;
  schema: McpToolSchema;
};

export type McpToolPropertyDef = {
  type?: string;
  description?: string;
  items?: {
    type?: string;
  };
};

export type McpToolSchema = {
  parameters: Record<string, McpToolPropertyDef>;
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

interface CachedMcpTools {
  tools: Record<string, McpToolDefinition>;
  expiresAt: Date;
}

class McpToolsCache {
  private static readonly CACHE_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutes

  private static readonly cachedToolsByServerUrl: Record<
    string,
    CachedMcpTools
  > = {};

  public static async cacheTools(
    serverUrl: string,
    createMcpClient: () => Promise<Client>
  ): Promise<void> {
    const cachedTools = this.cachedToolsByServerUrl[serverUrl];
    if (cachedTools && cachedTools.expiresAt > new Date()) {
      return;
    }

    const client = await createMcpClient();
    const toolsList = await client.listTools();

    if (ENV.DEBUG) {
      console.log(
        'McpToolsCache update - Available Tools List:',
        JSON.stringify(toolsList, null, 2)
      );
    }

    const tools: Record<string, McpToolDefinition> = {};
    for (const tool of toolsList.tools) {
      const schema = {} as McpToolSchema;

      if (
        tool.inputSchema.properties &&
        typeof tool.inputSchema.properties === 'object'
      ) {
        const parameters: Record<string, McpToolPropertyDef> = {};

        for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
          if (typeof prop === 'object') {
            const typedProp = prop as Record<string, unknown>;

            parameters[key] = {
              type: typedProp.type as string | undefined,
              description: typedProp.description as string | undefined,
            };

            if (typedProp.type === 'array' && typedProp.items) {
              parameters[key].items = {
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

        schema.parameters = parameters;
      }

      if (Array.isArray(tool.inputSchema.required)) {
        schema.required = [...tool.inputSchema.required];
      }

      tools[tool.name] = {
        name: tool.name,
        schema: schema,
      };
    }

    this.cachedToolsByServerUrl[serverUrl] = {
      tools: tools,
      expiresAt: new Date(Date.now() + this.CACHE_EXPIRATION_TIME),
    };

    await client.close();
  }

  public static getTools(
    serverUrl: string,
    entityArguments?: GimmickEntityArguments
  ): Record<string, McpToolDefinition> {
    const cachedTools = this.cachedToolsByServerUrl[serverUrl];
    if (cachedTools && cachedTools.expiresAt > new Date()) {
      let tools = cachedTools.tools;
      if (entityArguments) {
        // deep copy and edit
        tools = JSON.parse(JSON.stringify(tools));
        for (const tool of Object.values(tools)) {
          for (const key of Object.keys(entityArguments)) {
            delete tool.schema.parameters[key];
          }
          if (tool.schema.required) {
            tool.schema.required = tool.schema.required.filter(
              (required: string) => !entityArguments[required]
            );
          }
        }
      }
      return tools;
    }
    throw new Error(`McpToolsCache expired for server ${serverUrl}`);
  }
}

@RegisterGimmickCore('execute_mcp')
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
    let entityArguments: GimmickEntityArguments | undefined = undefined;
    if (this.meta.entityArguments && this.gimmick.location.updatingEntity) {
      entityArguments =
        this.meta.entityArguments[this.gimmick.location.updatingEntity.key];
    }
    const tools = McpToolsCache.getTools(this.serverUrl, entityArguments);
    const toolEnum = z.enum(Object.keys(tools) as [string, ...string[]]);

    const argsSchemas: z.ZodTypeAny[] = [];
    for (const toolName of Object.keys(tools)) {
      const toolSchema = tools[toolName].schema;
      const argumentsDescription = Object.entries(toolSchema.parameters)
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

      let requiredString = 'none';
      if (toolSchema.required && toolSchema.required.length > 0) {
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
    const tools = McpToolsCache.getTools(this.serverUrl);
    return Object.keys(tools);
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
      await McpToolsCache.cacheTools(
        this.serverUrl,
        async () => await this.createMcpClient()
      );
    } catch (error) {
      console.error(
        `[Gimmick ${this.gimmick.name}] MCP tools cache update error:`,
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
