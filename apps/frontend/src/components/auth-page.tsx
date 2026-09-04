import { SignIn, SignUp } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { authConfigured } from "../lib/auth";
import { useIdentity } from "./providers";
import { Brand, Loading } from "./ui";
export function AuthPage({ mode }: { mode: "login" | "register" }) {
	const login = mode === "login";
	const { isLoaded } = useIdentity();
	return (
		<main id="main-content" className="auth-layout">
			<aside className="auth-editorial">
				<Brand />
				<div className="auth-story">
					<span className="eyebrow">A LITTLE STRUCTURE. MORE POSSIBILITY.</span>
					<h1>
						{login ? (
							<>
								Welcome back <br />
								to your next <br />
								<em>good idea.</em>
							</>
						) : (
							<>
								Big things <br />
								start with <br />
								<em>a little clarity.</em>
							</>
						)}
					</h1>
					<p>
						Your tasks, your people, your next chapter.
						<br />
						All with a little more room to breathe.
					</p>
					<div className="auth-note">
						<span>
							<Sparkles size={20} />
						</span>
						<div>
							<strong>Make space for what matters.</strong>
							<p>One thoughtful step at a time.</p>
						</div>
						<Check size={18} />
					</div>
				</div>
				<span className="auth-bottom">
					AI KANBAN BOARD <span>THINK IT. PLAN IT. MOVE IT.</span>
				</span>
				<span className="auth-decoration" aria-hidden="true">
					✳
				</span>
			</aside>
			<section
				className="auth-form-panel"
				aria-label={login ? "Sign in" : "Create account"}
			>
				<Link to="/" className="back-link">
					<ArrowLeft size={16} />
					Back to home
				</Link>
				<div className="auth-form-wrap">
					<span className="eyebrow">
						{login ? "PICK UP WHERE YOU LEFT OFF" : "YOUR NEXT CHAPTER"}
					</span>
					<h2>{login ? "A fresh start, again." : "Let’s make it happen."}</h2>
					<p className="auth-intro">
						{login
							? "Sign in to find your workspace, just as you left it."
							: "Create your account. Give your ideas a place to grow."}
					</p>
					{authConfigured && !isLoaded && (
						<Loading>Preparing secure sign-in…</Loading>
					)}
					{authConfigured ? (
						login ? (
							<SignIn
								routing="hash"
								signUpUrl="/register"
								forceRedirectUrl="/dashboard"
							/>
						) : (
							<SignUp
								routing="hash"
								signInUrl="/login"
								forceRedirectUrl="/dashboard"
							/>
						)
					) : (
						<div className="error-notice" role="status">
							Sign-in is not available yet. Please try again later.
						</div>
					)}
					<p className="auth-alternative">
						{login ? "New around here?" : "Already have an account?"}{" "}
						<Link to={login ? "/register" : "/login"}>
							{login ? "Create an account" : "Welcome back"}{" "}
							<span aria-hidden="true">↗</span>
						</Link>
					</p>
				</div>
				<p className="auth-form-footer">A calmer place to do your best work.</p>
			</section>
		</main>
	);
}
