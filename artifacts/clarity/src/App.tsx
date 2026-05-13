import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, ProtectedRoute, PublicRoute } from "@/contexts/AuthContext";

import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Billing from "@/pages/billing";
import Settings from "@/pages/settings";
import DocumentNew from "@/pages/document-new";
import DocumentView from "@/pages/document-view";
import DocumentQA from "@/pages/document-qa";
import Search from "@/pages/search";
import SearchSessionPage from "@/pages/search-session";
import SearchSessionV1Page from "@/pages/search-session-v1";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/">
        <PublicRoute><Landing /></PublicRoute>
      </Route>
      <Route path="/login">
        <PublicRoute><Login /></PublicRoute>
      </Route>
      <Route path="/register">
        <PublicRoute><Register /></PublicRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/documents/new">
        <ProtectedRoute><DocumentNew /></ProtectedRoute>
      </Route>
      <Route path="/documents/:id">
        {(params) => <ProtectedRoute><DocumentView id={params.id} /></ProtectedRoute>}
      </Route>
      <Route path="/documents/:id/qa">
        {(params) => <ProtectedRoute><DocumentQA id={params.id} /></ProtectedRoute>}
      </Route>
      <Route path="/search/:id">
        {(params) => <ProtectedRoute><SearchSessionPage id={params.id} /></ProtectedRoute>}
      </Route>
      <Route path="/search-v1/:id">
        {(params) => <ProtectedRoute><SearchSessionV1Page id={params.id} /></ProtectedRoute>}
      </Route>
      <Route path="/search">
        <ProtectedRoute><Search /></ProtectedRoute>
      </Route>
      <Route path="/billing">
        <ProtectedRoute><Billing /></ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute><Settings /></ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
