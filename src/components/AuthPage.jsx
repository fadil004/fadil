import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function AuthPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (mode === "login") {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) {
          if (err.message.includes("Invalid login")) {
            setError("البريد أو كلمة المرور غلط");
          } else {
            setError(err.message);
          }
        } else if (data?.user) {
          onLogin(data.user);
        }
      } else {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) {
          if (err.message.includes("already registered")) {
            setError("هذا البريد مسجل. جرب تسجيل الدخول");
          } else if (err.message.includes("Password should be")) {
            setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
          } else {
            setError(err.message);
          }
        } else {
          setSuccess("تم إنشاء الحساب! راجع بريدك للتأكيد، ثم سجّل دخول.");
          setMode("login");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg,#0a0a0f,#12121a,#0d0d14)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "'IBM Plex Sans Arabic', sans-serif",
      direction: "rtl",
    }}>
      {/* Background glow */}
      <div style={{ position: "fixed", top: "-200px", left: "-200px", width: "500px", height: "500px", background: "radial-gradient(circle,rgba(212,175,55,0.06),transparent 70%)", pointerEvents: "none" }} />

      <div style={{
        background: "#16161e",
        borderRadius: "20px",
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "40px 32px",
        width: "100%",
        maxWidth: "380px",
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🧮</div>
          <div style={{ fontSize: "10px", letterSpacing: "6px", color: "#d4af37", marginBottom: "8px", fontWeight: 600 }}>
            حاسبة التسعير
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 300, color: "#f5f3ef", margin: 0 }}>
            {mode === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
          </h1>
          <div style={{ width: "40px", height: "1px", background: "linear-gradient(90deg,transparent,#d4af37,transparent)", margin: "14px auto 0" }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "11px", color: "#777", display: "block", marginBottom: "6px" }}>
              البريد الإلكتروني
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@email.com"
              autoComplete="email"
              style={inputStyle}
              dir="ltr"
            />
          </div>

          <div>
            <label style={{ fontSize: "11px", color: "#777", display: "block", marginBottom: "6px" }}>
              كلمة المرور
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              style={inputStyle}
              dir="ltr"
            />
          </div>

          {error && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: "13px" }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399", fontSize: "13px" }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            style={{
              padding: "13px",
              borderRadius: "10px",
              border: "none",
              background: loading || !email.trim() || !password.trim()
                ? "rgba(212,175,55,0.3)"
                : "linear-gradient(135deg,#d4af37,#b8962e)",
              color: "#0a0a0f",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading || !email.trim() || !password.trim() ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              marginTop: "4px",
            }}
          >
            {loading ? "جار التحميل..." : mode === "login" ? "دخول" : "إنشاء الحساب"}
          </button>
        </form>

        {/* Toggle mode */}
        <div style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#666" }}>
          {mode === "login" ? (
            <>
              ما عندك حساب؟{" "}
              <button onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}
                style={{ background: "none", border: "none", color: "#d4af37", cursor: "pointer", fontSize: "13px", textDecoration: "underline" }}>
                سجّل الآن
              </button>
            </>
          ) : (
            <>
              عندك حساب؟{" "}
              <button onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
                style={{ background: "none", border: "none", color: "#d4af37", cursor: "pointer", fontSize: "13px", textDecoration: "underline" }}>
                سجّل دخول
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "11px 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  color: "#e8e6e1",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "'IBM Plex Sans Arabic', sans-serif",
};
