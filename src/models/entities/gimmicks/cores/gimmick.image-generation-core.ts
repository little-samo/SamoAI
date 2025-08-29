import {
  ENV,
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
import { GimmickParameters } from '../gimmick.types';
import { GimmickInputFactory } from '../inputs';
// Import to register the input
import '../inputs/gimmick.image-generation-input';

import { GimmickCore } from './gimmick.core';
import { RegisterGimmickCore } from './gimmick.core-decorator';

@RegisterGimmickCore('image_generation')
export class GimmickImageGenerationCore extends GimmickCore {
  public static readonly DEFAULT_IMAGE_GENERATION_LLM_PLATFORM =
    LlmPlatform.GEMINI;
  public static readonly DEFAULT_IMAGE_GENERATION_LLM_MODEL =
    'gemini-2.5-flash-image-preview';
  public static readonly DEFAULT_MAX_IMAGE_DESCRIPTION_LENGTH = 500;

  public override get description(): string {
    return 'Generates high-quality images based on detailed text descriptions using an advanced AI model. Execution takes approximately 15-30 seconds. Provide clear, descriptive prompts for best results, including style, composition, colors, and other visual details.';
  }

  public override get parameters(): z.ZodSchema {
    return z
      .string()
      .max(GimmickImageGenerationCore.DEFAULT_MAX_IMAGE_DESCRIPTION_LENGTH)
      .describe(
        'A detailed, descriptive prompt for image generation. Include specific details about subject, style, composition, colors, lighting, and artistic elements. Be creative and specific to get the best results.'
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
    const messages = inputBuilder.build();

    let imageGenerationResponse: LlmGenerateResponse<false>;
    try {
      imageGenerationResponse = await imageLlm.generate(messages, {
        responseTypes: [LlmResponseType.image],
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
    await entity.location.emitAsync(
      'llmGenerate',
      entity,
      imageGenerationResponse,
      this.gimmick
    );

    const imageData = imageGenerationResponse.content;
    if (!imageData.match(/^data:image\/\w+;base64,/)) {
      console.error(
        `No image data received from the LLM: ${imageData.slice(0, 32)}`
      );
      throw new Error('No image data received from the LLM');
    }

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
