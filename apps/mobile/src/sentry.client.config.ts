import * as Sentry from "@sentry/react-native";

const initSentry = () => {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  });
};

export { initSentry };
export default Sentry;
