export interface LocalModelProvider {
  enabled: false;
}

export interface DeepScanProvider {
  enabled: false;
}

export interface StorageProvider {
  enabled: false;
}

export interface TimestampProvider {
  enabled: false;
}

export interface FeatureProviders {
  localModel: LocalModelProvider;
  deepScan: DeepScanProvider;
  storage: StorageProvider;
  timestamp: TimestampProvider;
}

export const featureProviders: FeatureProviders = {
  localModel: { enabled: false },
  deepScan: { enabled: false },
  storage: { enabled: false },
  timestamp: { enabled: false },
};

