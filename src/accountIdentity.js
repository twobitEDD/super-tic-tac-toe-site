const normalizeHandle = (value) => {
  if (typeof value !== "string") {
    return "SpaceCowboy";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 24) : "SpaceCowboy";
};

export const createDynamicAccountIdentity = ({ handle, dynamicUser } = {}) => {
  const safeHandle = normalizeHandle(handle);
  const walletAddress =
    Array.isArray(dynamicUser?.verifiedCredentials) &&
    dynamicUser.verifiedCredentials.length > 0 &&
    typeof dynamicUser.verifiedCredentials[0]?.address === "string"
      ? dynamicUser.verifiedCredentials[0].address
      : null;

  return {
    provider: "dynamic.xyz",
    accountId: typeof dynamicUser?.userId === "string" ? dynamicUser.userId : `local-${safeHandle.toLowerCase()}`,
    handle: safeHandle,
    walletAddress,
  };
};
