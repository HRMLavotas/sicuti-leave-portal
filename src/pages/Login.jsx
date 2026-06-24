import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthManager } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { Eye, EyeOff, Shield } from "lucide-react";
import SessionManager from "@/lib/sessionManager";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already authenticated
  useEffect(() => {
    if (AuthManager.isAuthenticated()) {
      navigate("/employees", { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await AuthManager.login(username, password);

      // Initialize session management
      SessionManager.init();

      toast({
        title: "Login Berhasil",
        description: "Selamat datang di SiCuti - Binalavotas",
      });

      navigate("/employees", { replace: true });
    } catch (error) {
      setError(error.message);
      toast({
        variant: "destructive",
        title: "Login Gagal",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Card className="w-full max-w-md bg-slate-800/80 border-slate-700/70 shadow-xl backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-white text-2xl">SiCuti - Binalavotas</CardTitle>
          <p className="text-slate-400 text-sm">Masuk ke akun Anda</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label
                htmlFor="username"
                className="block text-slate-300 mb-2 font-medium"
              >
                Username
              </label>
              <Input
                id="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-500"
                placeholder="Masukkan username"
                autoFocus
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-slate-300 mb-2 font-medium"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-500 pr-10"
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            {error && (
              <div className="bg-red-900/50 border border-red-600/30 rounded-lg p-3">
                <div className="text-red-400 text-sm text-center">{error}</div>
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium py-3"
              disabled={loading}
            >
              {loading ? "Memproses..." : "Masuk"}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-slate-500 text-xs">
              SiCuti - Binalavotas v
              {import.meta.env.VITE_APP_VERSION || "1.0.0"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
