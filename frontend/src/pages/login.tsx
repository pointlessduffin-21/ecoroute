import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Trash2, LogIn, AlertCircle } from "lucide-react";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
    } catch {
      setError("Unable to sign in. Please check your credentials and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-100 p-4">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-green-200/40 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-48 w-48 -translate-x-1/2 rounded-full bg-teal-200/30 blur-3xl" />
      </div>

      <Card className="relative z-10 w-full max-w-md shadow-xl border-0 bg-white/95 backdrop-blur-sm">
        <CardHeader className="space-y-4 text-center pb-2">
          {/* Logo */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-200">
            <Trash2 className="h-7 w-7 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              EcoRoute
            </CardTitle>
            <CardDescription className="mt-1">
              Smart Waste Management Platform
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@ecoroute.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                disabled={isLoading}
                className="h-10"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isLoading}
                minLength={6}
                className="h-10"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className={cn(
                "w-full h-10 text-sm font-medium",
                "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700",
                "shadow-md shadow-green-200/50 transition-all"
              )}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Sign In
                </div>
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Secure access to the EcoRoute admin dashboard.
            <br />
            Contact your administrator if you need an account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
