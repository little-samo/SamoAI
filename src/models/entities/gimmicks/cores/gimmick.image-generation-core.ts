import {
  ENV,
  formatZodErrorMessage,
  LlmFactory,
  LlmGenerateResponse,
  LlmInvalidContentError,
  LlmPlatform,
  LlmResponseType,
  LlmService,
  LlmServiceOptions,
  LlmUsageType,
  truncateString,
} from '@little-samo/samo-ai/common';
import { z } from 'zod';

import { type Entity } from '../../entity';
import { Gimmick } from '../gimmick';
import { GimmickCoreMeta } from '../gimmick.meta';
import { GimmickParameters } from '../gimmick.types';
import {
  GimmickImageGenerationReferenceImageSchema,
  GimmickInputFactory,
} from '../inputs';

import { GimmickCore } from './gimmick.core';
import { RegisterGimmickCore } from './gimmick.core-decorator';

export const GimmickImageGenerationCoreOptionsSchema = z.object({
  images: z.array(GimmickImageGenerationReferenceImageSchema).optional(),
});
export type GimmickImageGenerationCoreOptions = z.infer<
  typeof GimmickImageGenerationCoreOptionsSchema
>;

@RegisterGimmickCore('image_generation')
export class GimmickImageGenerationCore extends GimmickCore {
  public static readonly DEFAULT_IMAGE_GENERATION_LLM_PLATFORM =
    LlmPlatform.GEMINI;
  public static readonly DEFAULT_IMAGE_GENERATION_LLM_MODEL =
    'gemini-2.5-flash-image-preview';
  public static readonly DEFAULT_IMAGE_GENERATION_LLM_MAX_TOKENS = 8192;
  public static readonly DEFAULT_MAX_IMAGE_DESCRIPTION_LENGTH = 500;

  public constructor(gimmick: Gimmick, meta: GimmickCoreMeta) {
    super(gimmick, meta);

    const result = GimmickImageGenerationCoreOptionsSchema.safeParse(
      this.options
    );
    if (!result.success) {
      const errorMessage = formatZodErrorMessage(result.error);
      throw new Error(
        `[Gimmick ${this.gimmick.name}] Image generation configuration error: ${errorMessage}`
      );
    }
  }

  public override get options(): GimmickImageGenerationCoreOptions {
    return super.options as GimmickImageGenerationCoreOptions;
  }

  public override get description(): string {
    return 'Generates high-quality images based on detailed text descriptions. The gimmick can see the full location context including conversation history and reference images. Execution takes approximately 15 seconds.';
  }

  public override get parameters(): z.ZodSchema {
    return z
      .string()
      .max(GimmickImageGenerationCore.DEFAULT_MAX_IMAGE_DESCRIPTION_LENGTH)
      .describe(
        'Detailed image generation prompt. Use conversation context and reference images to create contextually appropriate descriptions. For revealing depictions, describe such elements artistically or symbolically. For instance, using undergarments or creative obstruction can imply nudity without directly showing sensitive areas, ensuring content policy compliance.'
      );
  }

  private async generateImage(
    entity: Entity,
    imageLlm: LlmService,
    prompt: string
  ): Promise<void> {
    // Use the new input system to build rich contextual messages
    const inputBuilder = GimmickInputFactory.createInput(
      'image_generation',
      entity.location,
      this.gimmick,
      entity,
      prompt
    );
    const messages = inputBuilder.build({
      referenceImages: this.options.images,
      timezone: entity.timezone,
    });

    let imageGenerationResponse: LlmGenerateResponse<false>;
    try {
      imageGenerationResponse = await imageLlm.generate(messages, {
        responseTypes: [LlmResponseType.image],
        maxTokens:
          GimmickImageGenerationCore.DEFAULT_IMAGE_GENERATION_LLM_MAX_TOKENS,
        verbose: ENV.VERBOSE_LLM,
      });
    } catch (error) {
      if (error instanceof LlmInvalidContentError && error.llmResponse) {
        error.llmResponse.logType = LlmUsageType.GIMMICK;
        await entity.location.emitAsync(
          'llmGenerate',
          entity,
          error.llmResponse,
          this.gimmick
        );
      }
      throw error;
    }

    imageGenerationResponse.logType = LlmUsageType.GIMMICK;

    const imageData = imageGenerationResponse.content;
    if (!imageData.match(/^data:image\/\w+;base64,/)) {
      console.error(
        `No image data received from the LLM: ${imageData.slice(0, 32)}`
      );
      const imageGenerationResponseWithoutContent = {
        ...imageGenerationResponse,
        content: undefined,
      };
      await entity.location.emitAsync(
        'llmGenerate',
        entity,
        imageGenerationResponseWithoutContent,
        this.gimmick
      );
      throw new Error('No image data received from the LLM');
    }

    await entity.location.emitAsync(
      'llmGenerate',
      entity,
      imageGenerationResponse,
      this.gimmick
    );

    const maxDescriptionLength = Number(
      this.meta.options?.maxDescriptionLength ??
        GimmickImageGenerationCore.DEFAULT_MAX_IMAGE_DESCRIPTION_LENGTH
    );

    prompt = truncateString(prompt, maxDescriptionLength).text;

    if (ENV.DEBUG) {
      console.log(`Gimmick ${this.gimmick.name} executed: ${prompt}`);
      console.log(
        `Generated image with ${imageData.length} characters of data`
      );
    }

    await entity.location.addGimmickMessage(this.gimmick, {
      message: `Image Generated: ${prompt}`,
      image: imageData,
    });
    await entity.location.emitAsync(
      'gimmickExecuted',
      this.gimmick,
      entity,
      imageData,
      prompt
    );
  }

  public override async update(): Promise<boolean> {
    return false;
  }

  public override async execute(
    entity: Entity,
    parameters: GimmickParameters
  ): Promise<string | undefined> {
    if (!parameters || typeof parameters !== 'string') {
      return 'Invalid image generation prompt provided. Please provide a raw string description, not a JSON object or other data type.';
    }
    const prompt = parameters as string;

    const llmImageOptions: Partial<LlmServiceOptions> =
      this.meta.options?.llm ?? {};
    llmImageOptions.platform ??=
      GimmickImageGenerationCore.DEFAULT_IMAGE_GENERATION_LLM_PLATFORM;
    llmImageOptions.model ??=
      GimmickImageGenerationCore.DEFAULT_IMAGE_GENERATION_LLM_MODEL;
    llmImageOptions.apiKey ??=
      entity.location.apiKeys[llmImageOptions.platform]?.key;

    if (!llmImageOptions.apiKey) {
      return 'No API key found for image generation';
    }

    const imageLlm = LlmFactory.create(llmImageOptions as LlmServiceOptions);

    const promise = this.generateImage(entity, imageLlm, prompt);

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
