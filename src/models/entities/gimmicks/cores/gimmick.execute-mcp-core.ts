import {
  ENV,
  MCPJsonSchema,
  mcpSchemaToZod,
  formatZodErrorMessage,
} from '@little-samo/samo-ai/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

import packageJson from '../../../../../package.json';
import { type Entity } from '../../entity';
import { type Gimmick } from '../gimmick';
import { type GimmickArguments, type GimmickCoreMeta } from '../gimmick.meta';
import { GimmickParameters } from '../gimmick.types';

import { GimmickCore } from './gimmick.core';
import { RegisterGimmickCore } from './gimmick.core-decorator';

export type McpToolDefinition = {
  name: string;
  description?: string;
  schema: z.ZodTypeAny;
};

// gimmick options schema
export const GimmickExecuteMcpCoreOptionsSchema = z.object({
  serverUrl: z.string().min(1, 'serverUrl is required'),
  serverInstructions: z.string().optional(),

  clientName: z.string().optional(),
  clientVersion: z.string().optional(),

  useEntityAuthorization: z.boolean().optional(),

  tools: z.array(z.string()).optional(),
  additionalArguments: z.array(z.string()).optional(),
});

export type GimmickExecuteMcpCoreOptions = z.infer<
  typeof GimmickExecuteMcpCoreOptionsSchema
>;

export interface GimmickExecuteMcpCoreParameters {
  tool: string;
  args: Record<string, unknown>;
}

interface CachedMcpTools {
  instructions?: string;
  tools: Record<string, McpToolDefinition>;
  expiresAt: Date;
}

class McpToolsCache {
  private static readonly CACHE_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutes
  private static readonly CACHE_REFRESH_BUFFER = 30 * 1000; // 30 seconds buffer before expiration

  private static readonly cachedToolsByServerUrl: Record<
    string,
    CachedMcpTools
  > = {};

  public static async cacheTools(
    serverUrl: string,
    createMcpClient: () => Promise<Client>
  ): Promise<void> {
    const cachedTools = this.cachedToolsByServerUrl[serverUrl];
    if (
      cachedTools &&
      cachedTools.expiresAt.getTime() - this.CACHE_REFRESH_BUFFER > Date.now()
    ) {
      return;
    }

    let client: Client | null = null;
    try {
      client = await createMcpClient();
      const instructions = client.getInstructions();
      const toolsList = await client.listTools();

      if (ENV.DEBUG) {
        console.log(`McpToolsCache update: ${serverUrl}`);
      }

      const tools: Record<string, McpToolDefinition> = {};
      for (const tool of toolsList.tools) {
        tools[tool.name] = {
          name: tool.name,
          description: tool.description,
          schema: mcpSchemaToZod(tool.inputSchema as MCPJsonSchema),
        };

        if (ENV.DEBUG) {
          console.log(`Tool ${tool.name} - ${tool.description}`);
        }
      }

      this.cachedToolsByServerUrl[serverUrl] = {
        instructions: instructions,
        tools: tools,
        expiresAt: new Date(Date.now() + this.CACHE_EXPIRATION_TIME),
      };
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  private static getCachedTools(
    serverUrl: string,
    options?: GimmickExecuteMcpCoreOptions
  ): CachedMcpTools {
    const cachedTools = this.cachedToolsByServerUrl[serverUrl];
    if (!cachedTools || cachedTools.expiresAt < new Date()) {
      throw new Error(`McpToolsCache expired for server ${serverUrl}`);
    }

    if (!options) {
      return cachedTools;
    }

    const toolsToInclude = new Set(options?.tools ?? []);
    const additionalArguments = options?.additionalArguments ?? [];
    if (toolsToInclude.size === 0 && additionalArguments.length === 0) {
      return cachedTools;
    }

    const tools: Record<string, McpToolDefinition> = {};
    for (const tool of Object.values(cachedTools.tools)) {
      if (toolsToInclude.size > 0 && !toolsToInclude.has(tool.name)) {
        continue;
      }

      let schema = tool.schema;
      if (schema instanceof z.ZodObject) {
        for (const argument of additionalArguments) {
          schema = (schema as z.AnyZodObject).extend({
            [argument]: z.any(),
          });
        }
        schema = (schema as z.AnyZodObject).strict();
      }
      tools[tool.name] = {
        name: tool.name,
        description: tool.description,
        schema,
      };

      if (ENV.DEBUG) {
        console.log(`Tool ${tool.name} - ${tool.description}`);
      }
    }

    return {
      instructions: cachedTools.instructions,
      tools: tools,
      expiresAt: cachedTools.expiresAt,
    };
  }

  public static getInstructions(serverUrl: string): string | undefined {
    const cachedTools = this.getCachedTools(serverUrl);
    return cachedTools.instructions;
  }

  public static getTools(
    serverUrl: string,
    options?: GimmickExecuteMcpCoreOptions,
    gimmickArguments?: GimmickArguments
  ): Record<string, McpToolDefinition> {
    const cachedTools = this.getCachedTools(serverUrl, options);
    if (!gimmickArguments) {
      return cachedTools.tools;
    }

    const mask: Record<string, true | undefined> = {};
    for (const key of Object.keys(gimmickArguments)) {
      mask[key] = true;
    }

    const tools: Record<string, McpToolDefinition> = {};
    for (const [name, tool] of Object.entries(cachedTools.tools)) {
      if (tool.schema instanceof z.ZodObject) {
        tools[name] = {
          ...tool,
          schema: tool.schema.omit(mask),
        };
      } else {
        tools[name] = tool;
      }
    }

    return tools;
  }

  public static getTool(
    serverUrl: string,
    toolName: string,
    options?: GimmickExecuteMcpCoreOptions,
    gimmickArguments?: GimmickArguments
  ): McpToolDefinition | undefined {
    const cachedTools = this.getCachedTools(serverUrl, options);
    const tool = cachedTools.tools[toolName];
    if (!tool || !gimmickArguments || !(tool.schema instanceof z.ZodObject)) {
      return tool;
    }

    const mask: Record<string, true | undefined> = {};
    for (const key of Object.keys(gimmickArguments)) {
      mask[key] = true;
    }

    return {
      ...tool,
      schema: tool.schema.omit(mask),
    };
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

  public override get options(): GimmickExecuteMcpCoreOptions {
    return this.meta.options as GimmickExecuteMcpCoreOptions;
  }

  public override get description(): string {
    return (
      this.options.serverInstructions ??
      McpToolsCache.getInstructions(this.serverUrl) ??
      `Execute an MCP tool on the server.`
    );
  }

  public override get parameters(): z.ZodSchema {
    const gimmickArguments = this.getGimmickArguments();
    const tools = McpToolsCache.getTools(
      this.serverUrl,
      this.options,
      gimmickArguments
    );

    const toolSchemas = Object.entries(tools).map(([name, tool]) => {
      const description = tool.description || `Arguments for the ${name} tool.`;
      const argsSchemaWithDescription = tool.schema.describe(description);

      return z.object({
        tool: z.literal(name).describe(tool.description || name),
        args: argsSchemaWithDescription,
      });
    });

    if (toolSchemas.length === 0) {
      return z.object({
        tool: z.string().describe('No tools available on the MCP server.'),
        args: z.object({}).describe('No arguments needed.'),
      });
    }

    if (toolSchemas.length === 1) {
      return toolSchemas[0];
    }

    const discriminatedUnion = z.discriminatedUnion(
      'tool',
      toolSchemas as unknown as [
        z.AnyZodObject,
        z.AnyZodObject,
        ...z.AnyZodObject[],
      ]
    );

    return discriminatedUnion.describe(
      'Execute a tool on a remote MCP server. Select a tool and provide the corresponding arguments.'
    );
  }

  private get serverUrl(): string {
    return this.options.serverUrl;
  }

  private getGimmickArguments(entity?: Entity): GimmickArguments | undefined {
    let gimmickArguments: GimmickArguments | undefined = undefined;
    if (this.meta.arguments) {
      gimmickArguments = this.meta.arguments;
    }

    // Use the provided entity or fall back to updatingEntity
    const targetEntity = entity ?? this.gimmick.location.updatingEntity;
    if (this.meta.entityArguments && targetEntity) {
      const entityArguments = this.meta.entityArguments[targetEntity.key];
      if (entityArguments) {
        if (gimmickArguments) {
          gimmickArguments = {
            ...gimmickArguments,
            ...entityArguments,
          };
        } else {
          gimmickArguments = entityArguments;
        }
      }
    }

    return gimmickArguments;
  }

  private async createMcpClient(
    options?: StreamableHTTPClientTransportOptions
  ): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(
      new URL('mcp', this.serverUrl),
      options
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
        `[Gimmick ${this.gimmick.name}] MCP tools cache update error (${this.serverUrl}):`,
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
    const options: StreamableHTTPClientTransportOptions = {};
    if (this.options.useEntityAuthorization && entity.authorizationHeader) {
      options.requestInit = {
        headers: {
          Authorization: entity.authorizationHeader,
        },
      };
    }
    const client = await this.createMcpClient(options);

    if (ENV.DEBUG) {
      console.log(
        `Connected to MCP server: ${this.gimmick.name} - ${this.serverUrl}/mcp`
      );
    }

    try {
      const rawResult = await client.callTool({
        name: tool,
        arguments: args,
      });

      let result: string;
      const content = rawResult.content;
      if (content && Array.isArray(content)) {
        result = content
          .map((item) => {
            if (item.type === 'text' && item.text) {
              return item.text;
            }
            return JSON.stringify(item, null, 2);
          })
          .join('\n\n');
      } else {
        result = JSON.stringify(content, null, 2);
      }

      if (rawResult.isError) {
        throw new Error(`MCP server returned an error\n${result}`);
      }

      if (ENV.DEBUG) {
        console.log(`Gimmick ${this.gimmick.name} executed: ${tool}`);
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
    } finally {
      await client.close();
    }
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
    const { tool: toolName, args } = coreParameters;

    if (!toolName || !args) {
      return 'Required parameters missing (tool, args)';
    }

    // Get additional arguments from gimmick and entity
    const gimmickArguments = this.getGimmickArguments(entity);

    const tool = McpToolsCache.getTool(
      this.serverUrl,
      toolName,
      this.options,
      gimmickArguments
    );
    if (!tool) {
      return `Unsupported tool: ${toolName}`;
    }

    // Validate and clean args using the Zod schema
    const parseResult = tool.schema.safeParse(args);
    let cleanedArgs = args;
    let removedFields: string[] = [];

    if (!parseResult.success) {
      // Extract valid fields from the schema and filter args
      if (tool.schema instanceof z.ZodObject) {
        const schemaShape = tool.schema.shape;
        const validKeys = Object.keys(schemaShape);
        const originalKeys = Object.keys(args);

        cleanedArgs = {};
        for (const key of validKeys) {
          if (key in args) {
            cleanedArgs[key] = args[key];
          }
        }

        // Track removed fields
        removedFields = originalKeys.filter((key) => !validKeys.includes(key));

        // Re-validate with cleaned args
        const reParseResult = tool.schema.safeParse(cleanedArgs);
        if (!reParseResult.success) {
          const errorMessage = formatZodErrorMessage(reParseResult.error);
          return `Invalid arguments for tool ${toolName} - ${errorMessage}`;
        }
      } else {
        // For non-object schemas, return the original error
        const errorMessage = formatZodErrorMessage(parseResult.error);
        return `Invalid arguments for tool ${toolName} - ${errorMessage}`;
      }
    }

    // Add gimmick message if fields were removed
    if (removedFields.length > 0) {
      await entity.location.addGimmickMessage(this.gimmick, {
        message: `Removed unknown fields from ${toolName} arguments: ${removedFields.join(', ')}`,
      });
    }

    // Merge with gimmick and entity arguments
    if (gimmickArguments) {
      const originalTool = McpToolsCache.getTool(
        this.serverUrl,
        toolName,
        this.options
      );
      if (!originalTool) {
        return `Cache error occurred. Try again in a little while.`;
      }

      let originalToolSchema = originalTool.schema;
      if (originalToolSchema instanceof z.ZodObject) {
        originalToolSchema = originalToolSchema.strip();
      }

      const originalToolParseResult = originalToolSchema.safeParse({
        ...cleanedArgs,
        ...gimmickArguments,
      });
      if (!originalToolParseResult.success) {
        const errorMessage = formatZodErrorMessage(
          originalToolParseResult.error
        );
        return `Invalid gimmick arguments for tool ${toolName} - ${errorMessage}`;
      }
      cleanedArgs = originalToolParseResult.data;
    }

    const promise = this.callMcpServer(entity, toolName, cleanedArgs);

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
