import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useRegister,
  getGetMeQueryKey,
  type RegisterMutationError,
  type RegisterMutationResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const registerMutation = useRegister();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(
      { data: { name, email, password } },
      {
        onSuccess: (data: RegisterMutationResult) => {
          queryClient.setQueryData(getGetMeQueryKey(), data.user);
          setLocation("/search");
        },
        onError: (err: RegisterMutationError) => {
          const data = err?.data as { error?: string } | null;
          toast({
            title: "Registration failed",
            description: data?.error ?? "Could not create account",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas-parchment px-4 font-sans text-inkwell">
      <div className="w-full max-w-[420px] bg-white/86 p-8 rounded-2xl shadow-subtle border border-pebble-gray backdrop-blur-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 bg-inkwell rounded-lg flex items-center justify-center mx-auto mb-5 shadow-subtle">
            <div className="w-4 h-4 bg-canvas-parchment rounded-[2px] rotate-45" />
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight text-deep-shadow">Create your workspace</h1>
          <p className="text-muted-stone mt-2 text-[14px] leading-6">Upload a research paper, academic study, or literature review and get a clearer explanation in minutes.</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-stone">Full name</Label>
            <Input 
              id="name" 
              placeholder="Jane Doe"
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-stone">Email address</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="name@example.com"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-stone">Password</Label>
            <Input 
              id="password" 
              type="password" 
              placeholder="••••••••"
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? "Creating account..." : "Create account"}
          </Button>
        </form>
        
        <div className="text-center mt-6 text-[13px] text-muted-stone">
          Already have an account? <Link href="/login" className="text-onyx-outline font-medium hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
