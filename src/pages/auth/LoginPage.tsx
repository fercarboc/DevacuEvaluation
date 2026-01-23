import React from "react";
import { useNavigate } from "react-router-dom";
import { Login } from "@/components/Login";

export default function LoginPage() {
  const navigate = useNavigate();

  return (
    <Login
      onLoginSuccess={() => {
        navigate("/app", { replace: true });
      }}
    />
  );
}
