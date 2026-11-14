export interface PayloadManifestEntry {
  kind: string;
  sourceDir: string;
  targetDir: string;
  naming?: 'by-directory' | 'by-file';
  compare?: 'contents' | 'presence';
  installPolicy?: 'repair' | 'report-only-aware';
  required?: boolean;
}

export interface PayloadManifest {
  package: string;
  kinds: PayloadManifestEntry[];
}

export const readPayloadManifest = async (manifestPath: string): Promise<PayloadManifest> => {
  const file = Bun.file(manifestPath);
  const text = await file.text();
  try {
    if (manifestPath.endsWith('.json')) {
      return JSON.parse(text) as PayloadManifest;
    }
    try {
      return JSON.parse(text) as PayloadManifest;
    } catch {
      const result: any = { package: '', kinds: [] };
      const lines = text.split('\n');
      let currentKind: any = null;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed.startsWith('package:')) {
          result.package = trimmed.split(':').slice(1).join(':').trim().replace(/['"]/g, '');
        } else if (trimmed === '- kind:' || trimmed.startsWith('- kind:')) {
          if (currentKind) result.kinds.push(currentKind);
          currentKind = {};
          if (trimmed.includes('kind:')) {
            currentKind.kind = trimmed.split('kind:')[1].trim().replace(/['"]/g, '');
          }
        } else if (currentKind && trimmed.includes(':')) {
          const parts = trimmed.split(':');
          const key = parts[0].trim();
          let value = parts.slice(1).join(':').trim().replace(/['"]/g, '');
          if (value === 'true') value = true;
          if (value === 'false') value = false;
          currentKind[key] = value;
        }
      }
      if (currentKind) result.kinds.push(currentKind);
      return result as PayloadManifest;
    }
  } catch (e) {
    throw new Error(`Failed to read manifest ${manifestPath}: ${e}`);
  }
};
