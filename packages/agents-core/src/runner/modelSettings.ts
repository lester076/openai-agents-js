import { Agent } from '../agent';
import {
  isGpt5OrNewerReasoningModel,
  isGpt5OrNewerDefault,
} from '../defaultModel';
import { Model, ModelSettings } from '../model';
import { AgentToolUseTracker } from './toolUseTracker';
export { mergeModelSettings } from './modelSettingsMerge';

const hasReasoningModelSettings = (settings?: ModelSettings): boolean => {
  const providerData = settings?.providerData as
    | {
        reasoning?: unknown;
        text?: { verbosity?: unknown };
        reasoning_effort?: unknown;
      }
    | undefined;
  return Boolean(
    providerData?.reasoning ||
    providerData?.text?.verbosity ||
    (providerData as { reasoning_effort?: unknown } | undefined)
      ?.reasoning_effort,
  );
};

/**
 * Resolves the effective model for the next turn by giving precedence to an explicitly
 * configured run-level model, otherwise falling back to the agent's own model. This matches
 * Python's `RunConfig.model` precedence (#2707).
 */
export function selectModel(
  agentModel: string | Model,
  runConfigModel: string | Model | undefined,
): string | Model {
  if (runConfigModel) {
    return runConfigModel;
  }
  if (
    (typeof agentModel === 'string' &&
      agentModel !== Agent.DEFAULT_MODEL_PLACEHOLDER) ||
    agentModel
  ) {
    return agentModel;
  }
  return Agent.DEFAULT_MODEL_PLACEHOLDER;
}

/**
 * Resets the tool choice when the agent is configured to prefer a fresh tool selection after
 * any tool usage. This prevents the provider from reusing stale tool hints across turns.
 */
export function maybeResetToolChoice(
  agent: Agent<any, any>,
  toolUseTracker: AgentToolUseTracker,
  modelSettings: ModelSettings,
) {
  if (
    agent.resetToolChoice &&
    toolUseTracker.hasUsedTools(agent) &&
    modelSettings.toolChoice !== 'none'
  ) {
    return { ...modelSettings, toolChoice: undefined };
  }
  return modelSettings;
}

/**
 * Preserves legacy settings cleanup for explicitly selected models outside the
 * GPT-5-and-newer reasoning family when the default model belongs to that family.
 */
export function adjustModelSettingsForLegacyModel(
  explicitlyModelSet: boolean,
  agentModelSettings: ModelSettings,
  modelSettings: ModelSettings,
  resolvedModelName?: string,
): ModelSettings {
  // Only a resolved string selection establishes model identity.
  const isLegacyModel =
    typeof resolvedModelName === 'string' &&
    !isGpt5OrNewerReasoningModel(resolvedModelName);
  const hasReasoningSettings =
    hasReasoningModelSettings(agentModelSettings) ||
    hasReasoningModelSettings(modelSettings);

  if (
    isGpt5OrNewerDefault() &&
    explicitlyModelSet &&
    isLegacyModel &&
    hasReasoningSettings
  ) {
    return stripReasoningModelSettings(modelSettings);
  }
  return modelSettings;
}

function stripReasoningModelSettings(
  modelSettings: ModelSettings,
): ModelSettings {
  const copiedProviderData = modelSettings.providerData
    ? { ...modelSettings.providerData }
    : undefined;

  if (copiedProviderData) {
    if (
      copiedProviderData.text &&
      typeof copiedProviderData.text === 'object'
    ) {
      copiedProviderData.text = { ...copiedProviderData.text };
      delete (copiedProviderData.text as any).verbosity;
    }
    delete (copiedProviderData as any).reasoning;
    delete (copiedProviderData as any).reasoning_effort;
  }

  const copiedModelSettings: ModelSettings = {
    ...modelSettings,
    providerData: copiedProviderData,
  };
  if (modelSettings.retry) {
    copiedModelSettings.retry = { ...modelSettings.retry };
    if (modelSettings.retry.backoff) {
      copiedModelSettings.retry.backoff = { ...modelSettings.retry.backoff };
    }
  }
  if (modelSettings.reasoning) {
    copiedModelSettings.reasoning = { ...modelSettings.reasoning };
  }
  if (modelSettings.text) {
    copiedModelSettings.text = { ...modelSettings.text };
  }

  delete copiedModelSettings.providerData?.reasoning;
  delete (copiedModelSettings.providerData as any)?.text?.verbosity;
  delete (copiedModelSettings.providerData as any)?.reasoning_effort;
  if (copiedModelSettings.reasoning) {
    delete copiedModelSettings.reasoning.effort;
    delete copiedModelSettings.reasoning.summary;
  }
  if (copiedModelSettings.text) {
    delete copiedModelSettings.text.verbosity;
  }
  return copiedModelSettings;
}
