import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUpdateProfile, useDeleteAccount, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2 } from "lucide-react";
import { getApiUrl } from "@/lib/api-url";

const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Italian"] as const;

export default function Settings() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [language, setLanguage] = useState(user?.preferredLanguage ?? "English");

  // Sync form state when user data loads (covers async auth hydration)
  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.preferredLanguage) setLanguage(user.preferredLanguage);
  }, [user?.name, user?.preferredLanguage]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [langSaving, setLangSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const updateProfileMutation = useUpdateProfile();
  const deleteAccountMutation = useDeleteAccount();

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateProfileMutation.mutate(
      { data: { name } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({ title: "Profile updated" });
        },
        onError: () => {
          toast({ title: "Failed to update profile", variant: "destructive" });
        },
      },
    );
  };

  const handleLanguageSave = async () => {
    setLangSaving(true);
    try {
      const res = await fetch(getApiUrl("/api/settings/preferences"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLanguage: language }),
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Language preference saved" });
    } catch {
      toast({ title: "Failed to save preference", variant: "destructive" });
    } finally {
      setLangSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "New password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch(getApiUrl("/api/settings/change-password"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: "include",
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: "Password updated" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast({
        title: "Password change failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    deleteAccountMutation.mutate(undefined, {
      onSuccess: () => {
        logout();
      },
      onError: () => {
        toast({ title: "Failed to delete account", variant: "destructive" });
        setDeleteConfirm(false);
      },
    });
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-[34px] md:text-[40px] font-semibold tracking-tight text-deep-shadow mb-2 leading-none">
            Settings
          </h1>
          <p className="text-muted-stone text-[15px] md:text-[16px]">
            Manage your profile, language preference, and account.
          </p>
        </header>

        <div className="max-w-2xl space-y-5">
          {/* Profile */}
          <section className="rounded-2xl border border-pebble-gray bg-white shadow-subtle overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-pebble-gray">
              <h2 className="text-[17px] font-semibold text-deep-shadow">Profile</h2>
              <p className="text-[13px] text-muted-stone mt-0.5">Your display name shown across the workspace.</p>
            </div>
            <form onSubmit={handleProfileSave} className="p-6 space-y-5">
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                  Full name
                </Label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 border"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                  Email
                </Label>
                <Input
                  type="text"
                  value={user?.email ?? ""}
                  disabled
                  className="h-11 bg-pebble-gray/20 opacity-70 cursor-not-allowed border"
                />
                <p className="text-[12px] text-muted-stone">Email cannot be changed from here.</p>
              </div>
              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={updateProfileMutation.isPending || !name.trim()}
                  className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92"
                >
                  {updateProfileMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Save name
                    </>
                  )}
                </Button>
              </div>
            </form>
          </section>

          {/* Language preference */}
          <section className="rounded-2xl border border-pebble-gray bg-white shadow-subtle overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-pebble-gray">
              <h2 className="text-[17px] font-semibold text-deep-shadow">Language preference</h2>
              <p className="text-[13px] text-muted-stone mt-0.5">
                All paper analyses will be delivered in your preferred language.
              </p>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                  Read analyses in
                </Label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full h-11 px-3 border border-muted-stone rounded-xl bg-transparent outline-none focus:border-inkwell transition-all text-[14px] appearance-none cursor-pointer text-inkwell"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
                <p className="text-[12px] text-muted-stone">
                  Applies to new analyses only — previously analysed papers won't change.
                </p>
              </div>
              <Button
                onClick={handleLanguageSave}
                disabled={langSaving || language === user?.preferredLanguage}
                className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92"
              >
                {langSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Save preference
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* Change password */}
          <section className="rounded-2xl border border-pebble-gray bg-white shadow-subtle overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-pebble-gray">
              <h2 className="text-[17px] font-semibold text-deep-shadow">Change password</h2>
              <p className="text-[13px] text-muted-stone mt-0.5">
                Use at least 8 characters. We recommend a passphrase.
              </p>
            </div>
            <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                  Current password
                </Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-11 border"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                  New password
                </Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-11 border"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                  Confirm new password
                </Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 border"
                  required
                />
              </div>
              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                  className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92"
                >
                  {passwordSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Update password"
                  )}
                </Button>
              </div>
            </form>
          </section>

          {/* Danger zone */}
          <section className="rounded-2xl border border-red-200 bg-white shadow-subtle overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-red-100">
              <h2 className="text-[17px] font-semibold text-red-600">Delete account</h2>
              <p className="text-[13px] text-muted-stone mt-0.5">
                Permanently removes your account, all papers, and analysis history. This cannot be undone.
              </p>
            </div>
            <div className="p-6">
              {!deleteConfirm ? (
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                  onClick={() => setDeleteConfirm(true)}
                >
                  Delete my account
                </Button>
              ) : (
                <div className="space-y-4">
                  <p className="text-[14px] text-red-700 font-medium">
                    Are you sure? This will immediately delete everything.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      onClick={handleDeleteAccount}
                      disabled={deleteAccountMutation.isPending}
                    >
                      {deleteAccountMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Yes, delete everything"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDeleteConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
