import { SharePointConnector } from "./sharepoint.js";

const CONNECTORS = {
  sharepoint: SharePointConnector,
};

// Factory used by the sync job (7-C) — provider comes from OrgIntegration.provider.
export function getConnector(provider, config) {
  const Connector = CONNECTORS[provider];
  if (!Connector) throw new Error(`Unknown connector provider: ${provider}`);
  return new Connector(config);
}
