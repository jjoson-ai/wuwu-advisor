export type AccessLevel = "free" | "pro" | "internal";

function getContentDepthRank(accessLevel: AccessLevel) {
  return accessLevel === "free" ? 0 : 1;
}

export function getArtifactGenerationAccessLevel(
  accessLevel: AccessLevel | null | undefined,
): AccessLevel {
  return accessLevel ?? "free";
}

export function isArtifactStaleForCurrentAccess(
  currentAccessLevel: AccessLevel,
  artifactGenerationAccessLevel: AccessLevel | null | undefined,
) {
  return (
    getContentDepthRank(currentAccessLevel) >
    getContentDepthRank(
      getArtifactGenerationAccessLevel(artifactGenerationAccessLevel),
    )
  );
}
