import { describe, it, expect } from 'vitest';
import {
  resolveRunSelection,
  serverSelection,
  modelForProvider,
  validateAnthropicApiKey,
  validateApiKeyForProvider,
} from './aiProviders';

const saved = [
  { id: 'p-ds', provider_type: 'deepseek' },
  { id: 'p-claude', provider_type: 'anthropic' },
];

describe('aiProviders', () => {
  it('treats an empty selection as the DeepSeek server default', () => {
    expect(resolveRunSelection(null, saved)).toEqual({ provider: 'deepseek', userProviderId: null });
  });

  it('resolves server selections without a saved key', () => {
    expect(resolveRunSelection(serverSelection('anthropic'), saved)).toEqual({ provider: 'anthropic', userProviderId: null });
  });

  it('resolves a saved key to its provider', () => {
    expect(resolveRunSelection('p-claude', saved)).toEqual({ provider: 'anthropic', userProviderId: 'p-claude' });
  });

  it('keeps a model the provider offers and swaps one it does not', () => {
    expect(modelForProvider('deepseek', 'deepseek-reasoner')).toBe('deepseek-reasoner');
    expect(modelForProvider('anthropic', 'deepseek-chat')).toBe('claude-opus-5');
  });

  it('validates Claude keys', () => {
    expect(validateAnthropicApiKey('sk-ant-api03-abc').ok).toBe(true);
    expect(validateAnthropicApiKey('sk-abc').ok).toBe(false);
  });

  it('does not accept a Claude key as a DeepSeek key', () => {
    expect(validateApiKeyForProvider('deepseek', 'sk-ant-api03-abc').ok).toBe(false);
  });
});
