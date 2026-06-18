import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';

// Null when no key is configured — callers degrade gracefully (no aisle tags)
// rather than failing the request. Keys live only in the server env.
export const anthropic = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

// Plan: Haiku for the cheap, cacheable classify step.
export const HAIKU_MODEL = 'claude-haiku-4-5';
