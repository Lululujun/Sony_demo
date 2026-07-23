import type { LayeringConfig } from "./layering";
import type { ColorVariant } from "./specialMaterials";

export interface RatioWeights {
  supplyDemand: number;
  operation: number;
  strategy: number;
}

export interface DemoConfiguration {
  version: number;
  layeringConfig: LayeringConfig;
  ratioWeights: RatioWeights;
  wklyRatiosByCategory: Record<string, number>;
  kBig: number;
  bufferRatio: number;
  bigCustomers: Record<string, boolean>;
  skipList: string[];
  colorVariants: ColorVariant[];
  promptText: string;
}

export interface ConfigAuditEntry {
  id: string;
  time: string;
  actor: string;
  field: string;
  oldValue: string;
  newValue: string;
  version: string;
}

export interface ConfigurationState {
  current: DemoConfiguration;
  history: DemoConfiguration[];
  auditLog: ConfigAuditEntry[];
}

export interface ConfigurationChange {
  field: string;
  oldValue: string;
  newValue: string;
  actor?: string;
  time: string;
}

function cloneConfiguration(config: DemoConfiguration): DemoConfiguration {
  return {
    ...config,
    layeringConfig: {
      stopThresholds: { ...config.layeringConfig.stopThresholds },
    },
    ratioWeights: { ...config.ratioWeights },
    wklyRatiosByCategory: { ...config.wklyRatiosByCategory },
    bigCustomers: { ...config.bigCustomers },
    skipList: [...config.skipList],
    colorVariants: config.colorVariants.map((variant) => ({ ...variant })),
  };
}

export function createConfigurationState(
  initial: DemoConfiguration,
): ConfigurationState {
  return {
    current: cloneConfiguration(initial),
    history: [],
    auditLog: [],
  };
}

export function commitConfiguration(
  state: ConfigurationState,
  next: DemoConfiguration,
  change: ConfigurationChange,
): ConfigurationState {
  const previous = cloneConfiguration(state.current);
  const version = previous.version + 1;
  const current = cloneConfiguration({ ...next, version });
  const entry: ConfigAuditEntry = {
    id: `CFG-${String(version).padStart(3, "0")}`,
    time: change.time,
    actor: change.actor ?? "产品 PIC",
    field: change.field,
    oldValue: change.oldValue,
    newValue: change.newValue,
    version: `v1.${version}`,
  };

  return {
    current,
    history: [...state.history, previous],
    auditLog: [entry, ...state.auditLog],
  };
}

export function rollbackConfiguration(
  state: ConfigurationState,
  time: string,
): ConfigurationState {
  const previous = state.history[state.history.length - 1];
  if (!previous) return state;

  const version = state.current.version + 1;
  const restored = cloneConfiguration({ ...previous, version });
  const entry: ConfigAuditEntry = {
    id: `CFG-${String(version).padStart(3, "0")}`,
    time,
    actor: "产品 PIC",
    field: "配置版本回滚",
    oldValue: `v1.${state.current.version}`,
    newValue: `v1.${previous.version}`,
    version: `v1.${version}`,
  };

  return {
    current: restored,
    history: state.history.slice(0, -1),
    auditLog: [entry, ...state.auditLog],
  };
}
