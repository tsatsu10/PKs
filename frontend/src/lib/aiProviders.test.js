import { describe, it, expect } from 'vitest';
import {
  resolveRunSelection,
  serverSelection,
  modelForProvider,
  modelsForProvider,
  validateAnthropicApiKey,
  validateApiKeyForProvider,
} from './aiProviders';

const saved = [
  { id: 'p-ds', provider_type: 'deepseek' },
  { id: 'p-claude', provider_type: 'anthropic' },
];

describe('aiProviders', () => {
  it('treats an empty selection as the Claude server default', () => {
    expect(resolveRunSelection(null, saved)).toEqual({ provider: 'anthropic', userProviderId: null });
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

  it('offers only the models the shared server key actually runs', () => {
    expect(modelsForProvider('anthropic', true).map((m) => m.id)).toEqual(['claude-sonnet-5']);
    expect(modelsForProvider('anthropic', false).map((m) => m.id)).toEqual(['claude-opus-5', 'claude-sonnet-5']);
    expect(modelsForProvider('deepseek', true).map((m) => m.id)).toEqual(['deepseek-chat', 'deepseek-reasoner']);
    expect(modelForProvider('anthropic', 'claude-opus-5', true)).toBe('claude-sonnet-5');
    expect(modelForProvider('anthropic', 'claude-opus-5', false)).toBe('claude-opus-5');
  });

  it('validates Claude keys', () => {
    expect(validateAnthropicApiKey('sk-ant-api03-abc').ok).toBe(true);
    expect(validateAnthropicApiKey('sk-abc').ok).toBe(false);
  });

  it('does not accept a Claude key as a DeepSeek key', () => {
    expect(validateApiKeyForProvider('deepseek', 'sk-ant-api03-abc').ok).toBe(false);
  });
});
