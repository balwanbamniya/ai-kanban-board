import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { authConfigured } from "../lib/auth";

interface Identity {
	isLoaded: boolean;
	userId: string | null;
	getToken: () => Promise<string | null>;
}
const IdentityContext = createContext<Identity>({
	isLoaded: true,
	userId: null,
	getToken: async () => null,
});
export function useIdentity() {
	return useContext(IdentityContext);
}
function QueryScope({ children }: { children: ReactNode }) {
	const [client] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: { retry: false, staleTime: 30_000 },
					mutations: { retry: false },
				},
			}),
	);
	useEffect(
		() => () => {
			client.clear();
		},
		[client],
	);
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function AuthenticatedProviders({ children }: { children: ReactNode }) {
	const { isLoaded, userId, sessionId, getToken } = useAuth();
	return (
		<IdentityContext.Provider
			value={{
				isLoaded: Boolean(isLoaded),
				userId: userId ?? null,
				getToken: () => getToken({ skipCache: true }),
			}}
		>
			<QueryScope key={`${userId ?? "guest"}:${sessionId ?? "none"}`}>
				{children}
			</QueryScope>
		</IdentityContext.Provider>
	);
}
export function Providers({ children }: { children: ReactNode }) {
	if (!authConfigured) return <QueryScope>{children}</QueryScope>;
	return (
		<ClerkProvider
			publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
			signInUrl="/login"
			signUpUrl="/register"
			signInFallbackRedirectUrl="/dashboard"
			signUpFallbackRedirectUrl="/dashboard"
			afterSignOutUrl="/"
			appearance={{
				variables: {
					colorPrimary: "#BF4F2B",
					colorBackground: "#FFFEFA",
					colorForeground: "#242620",
					colorMutedForeground: "#6B6D62",
					fontFamily: '"DM Sans", sans-serif',
					borderRadius: "0.75rem",
				},
				elements: {
					rootBox: { width: "100%", maxWidth: "100%" },
					cardBox: {
						width: "100%",
						maxWidth: "100%",
						boxShadow: "none",
						border: "1px solid #ddd8cb",
						borderRadius: "16px",
					},
					card: { background: "#fffefa", boxShadow: "none" },
					formFieldInput: { minHeight: "44px" },
					socialButtonsBlockButton: { minHeight: "44px" },
					formButtonPrimary: {
						minHeight: "44px",
						boxShadow: "none",
						backgroundImage: "none",
					},
				},
			}}
		>
			<AuthenticatedProviders>{children}</AuthenticatedProviders>
		</ClerkProvider>
	);
}
