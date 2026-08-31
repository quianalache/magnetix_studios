import "server-only";

import type { MediaStorageProvider } from "@/types/media-asset";
import type { MediaStorageAdapter } from "@/lib/server/media-storage/types";
import { MediaStorageConfigurationError } from "@/lib/server/media-storage/types";
import { firebaseMediaStorageAdapter } from "@/lib/server/media-storage/firebase-adapter";
import { s3CompatibleMediaStorageAdapter } from "@/lib/server/media-storage/s3-compatible-adapter";

export * from "@/lib/server/media-storage/types";

export function mediaStorageAdapter(
  provider: MediaStorageProvider
): MediaStorageAdapter {
  switch (provider) {
    case "firebase":
      return firebaseMediaStorageAdapter;
    case "s3_compatible":
      return s3CompatibleMediaStorageAdapter;
    case "external":
      throw new MediaStorageConfigurationError(
        "External MediaAssets are references and have no Magnetix storage adapter."
      );
  }
}
