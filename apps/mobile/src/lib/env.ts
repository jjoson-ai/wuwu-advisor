function requireEnv(name: string) {
  const value = process.env[name];

  if (value == null || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name];

  if (value == null || value === "") {
    return null;
  }

  return value;
}

export const env = {
  supabaseUrl: requireEnv("EXPO_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
  apiBaseUrl: requireEnv("EXPO_PUBLIC_API_BASE_URL"),
  enableTestAccountSignIn:
    __DEV__ && optionalEnv("EXPO_PUBLIC_ENABLE_TEST_ACCOUNT_SIGN_IN") === "true",
  testAccountEmail: optionalEnv("EXPO_PUBLIC_TEST_ACCOUNT_EMAIL"),
  testAccountPassword: optionalEnv("EXPO_PUBLIC_TEST_ACCOUNT_PASSWORD"),
};
