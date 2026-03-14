export function getAlchemyKey() {
  const key = process.env.ALCHEMY_KEY;

  if (!key) {
    throw new Error("Missing ALCHEMY_KEY environment variable.");
  }

  return key;
}

export function getOptionalAlchemyKey() {
  return process.env.ALCHEMY_KEY;
}
