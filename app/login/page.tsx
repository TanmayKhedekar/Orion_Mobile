"use client";

import React, { useState } from "react";
import Image from 'next/image';
import { useAuth } from "@/context/AuthContext";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Shield } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.push("/");
        } catch (err: any) {
            if (err.code === "auth/invalid-credential" || (err.message && err.message.includes("auth/invalid-credential"))) {
                setError("Invalid Credentials");
            } else {
                setError(err.message || "Failed to log in.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError("");
        setLoading(true);
        try {
            await signInWithPopup(auth, googleProvider);
            router.push("/");
        } catch (err: any) {
            setError(err.message || "Failed to log in with Google.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 flex-col">
            <div className="mb-8 flex flex-col items-center">
                <Image src="/logo.png" alt="Orion" width={112} height={112} className="h-28 w-auto object-contain mb-4 dark:invert-0 invert" priority />
                <h1 className="text-2xl font-bold tracking-tight">API Intelligence Layer</h1>
            </div>

            <Card className="w-full max-w-md border-border glassmorphism shadow-2xl">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl flex justify-center items-center gap-2">
                        Welcome Back
                    </CardTitle>
                    <CardDescription>
                        Securely login to access your account
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <form onSubmit={handleEmailLogin} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Email
                            </label>
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="bg-black/20 border-border"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Password
                            </label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="bg-black/20 border-border"
                            />
                        </div>
                        {error && <div className="text-sm text-red-500 font-medium">{error}</div>}
                        <Button type="submit" className="w-full font-bold" disabled={loading}>
                            {loading ? "Logging in..." : "Login"}
                        </Button>
                    </form>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-card px-2 text-muted-foreground">
                                Or continue with
                            </span>
                        </div>
                    </div>

                    <Button variant="outline" type="button" onClick={handleGoogleLogin} className="w-full border-border bg-transparent hover:bg-white/5" disabled={loading}>
                        <svg className="w-5 h-5 mr-no-shrink mr-2" viewBox="0 0 24 24">
                            <path
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                fill="#4285F4"
                            />
                            <path
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                fill="#34A853"
                            />
                            <path
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                fill="#FBBC05"
                            />
                            <path
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                fill="#EA4335"
                            />
                        </svg>
                        Google
                    </Button>
                </CardContent>
                <CardFooter className="flex flex-col items-center justify-center space-y-2 pb-6">
                    <div className="text-sm text-muted-foreground">
                        Don&apos;t have an account?{" "}
                        <Link href="/signup" className="text-primary hover:underline font-medium">
                            Sign up
                        </Link>
                    </div>
                </CardFooter>
            </Card>

            <div className="mt-10 flex flex-col items-center space-y-3">
                <div className="text-sm text-muted-foreground flex items-center gap-1.5 opacity-80">
                    <Shield className="w-4 h-4 text-primary" /> Secure Authentication
                </div>
                <p className="text-xs text-muted-foreground/50">
                    © {new Date().getFullYear()} Orion. All rights reserved.
                </p>
            </div>
        </div>
    );
}
