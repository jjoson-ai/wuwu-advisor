import * as Linking from "expo-linking";
import type { Session, User } from "@supabase/supabase-js";
import { AppState } from "react-native";
import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "signup";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  authMessage: string | null;
  signInWithPassword: (params: {
    email: string;
    password: string;
  }) => Promise<{ success: boolean; message: string }>;
  signUpWithPassword: (params: {
    email: string;
    password: string;
  }) => Promise<{ success: boolean; message: string }>;
  signInWithTestAccount: () => Promise<{ success: boolean; message: string }>;
  isTestAccountEnabled: boolean;
  signOut: () => Promise<void>;
  clearAuthMessage: () => void;
};

function getAuthParams(url: string) {
  const [baseUrl, hash = ""] = url.split("#");
  const parsedUrl = new URL(baseUrl);
  const params = new URLSearchParams(parsedUrl.search);
  const hashParams = new URLSearchParams(hash);

  hashParams.forEach((value, key) => {
    if (params.has(key) === false) {
      params.set(key, value);
    }
  });

  return {
    code: params.get("code"),
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    errorDescription: params.get("error_description") ?? params.get("error"),
  };
}

function buildTestAliasEmail(email: string) {
  const atIndex = email.indexOf("@");

  if (atIndex <= 0) {
    return null;
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (domain === "") {
    return null;
  }

  return `${local}+mobile@${domain}`;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  isLoading: true,
  authMessage: null,
  signInWithPassword: async () => ({
    success: false,
    message: "Auth provider is not ready.",
  }),
  signUpWithPassword: async () => ({
    success: false,
    message: "Auth provider is not ready.",
  }),
  signInWithTestAccount: async () => ({
    success: false,
    message: "Test account sign-in is not available.",
  }),
  isTestAccountEnabled: false,
  signOut: async () => {},
  clearAuthMessage: () => {},
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  async function handleAuthUrl(url: string) {
    const { code, accessToken, refreshToken, errorDescription } =
      getAuthParams(url);

    if (errorDescription) {
      setAuthMessage(errorDescription);
      return;
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        setAuthMessage(error.message);
      } else {
        setAuthMessage(null);
      }

      return;
    }

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        setAuthMessage(error.message);
      } else {
        setAuthMessage(null);
      }
    }
  }

  async function signInWithPassword(params: {
    email: string;
    password: string;
  }) {
    const { error } = await supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });
    const message =
      error === null
        ? "Signed in."
        : error.message;

    setAuthMessage(message);

    return {
      success: error === null,
      message,
    };
  }

  async function signUpWithPassword(params: {
    email: string;
    password: string;
  }) {
    const { data, error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
    });

    const message =
      error != null
        ? error.message
        : data.session != null
          ? "Account created and signed in."
          : "Account created. Confirm your email, then sign in with your password.";

    setAuthMessage(message);

    return {
      success: error === null,
      message,
    };
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthMessage(error.message);
      throw error;
    }

    setAuthMessage(null);
  }

  async function signInWithTestAccount() {
    if (
      env.enableTestAccountSignIn === false ||
      env.testAccountEmail == null ||
      env.testAccountPassword == null
    ) {
      const message = "Test account sign-in is not configured.";
      setAuthMessage(message);

      return {
        success: false,
        message,
      };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: env.testAccountEmail,
      password: env.testAccountPassword,
    });

    if (error?.message === "Invalid login credentials") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: env.testAccountEmail,
        password: env.testAccountPassword,
      });

      if (signUpError == null) {
        if (data.session != null) {
          const message = "Created and signed in with the local test account.";
          setAuthMessage(message);

          return {
            success: true,
            message,
          };
        }

        const message =
          "Test account was created, but email confirmation is still required in Supabase Auth. Disable email confirmation for local testing or create a confirmed test user in Supabase.";
        setAuthMessage(message);

        return {
          success: false,
          message,
        };
      }

      if (signUpError?.message === "User already registered") {
        const aliasEmail = buildTestAliasEmail(env.testAccountEmail);

        if (aliasEmail != null) {
          const {
            data: aliasData,
            error: aliasSignUpError,
          } = await supabase.auth.signUp({
            email: aliasEmail,
            password: env.testAccountPassword,
          });

          if (aliasSignUpError == null) {
            if (aliasData.session != null) {
              const message = `Created and signed in with local test account alias ${aliasEmail}.`;
              setAuthMessage(message);

              return {
                success: true,
                message,
              };
            }

            const message =
              "A fresh test-account alias was created, but email confirmation is still required in Supabase Auth.";
            setAuthMessage(message);

            return {
              success: false,
              message,
            };
          }
        }
      }
    }

    const message =
      error == null
        ? "Signed in with the local test account."
        : error.message;

    setAuthMessage(message);

    return {
      success: error == null,
      message,
    };
  }

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const initialUrl = await Linking.getInitialURL();

        if (initialUrl) {
          await handleAuthUrl(initialUrl);
        }

        const { data } = await supabase.auth.getSession();

        if (isMounted) {
          setSession(data.session);
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setAuthMessage(
            error instanceof Error ? error.message : "Unable to load session.",
          );
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleAuthUrl(url);
    });
    const appStateSubscription = AppState.addEventListener("change", (status) => {
      if (status !== "active") {
        return;
      }

      void supabase.auth.refreshSession();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      linkingSubscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isLoading,
        authMessage,
        signInWithPassword,
        signUpWithPassword,
        signInWithTestAccount,
        isTestAccountEnabled:
          env.enableTestAccountSignIn &&
          env.testAccountEmail != null &&
          env.testAccountPassword != null,
        signOut,
        clearAuthMessage: () => setAuthMessage(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
