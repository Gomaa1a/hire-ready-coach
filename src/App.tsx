import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import Index from "./pages/Index";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import Dashboard from "./pages/Dashboard";
import NewInterview from "./pages/interview/NewInterview";
import LiveInterview from "./pages/interview/LiveInterview";
import NegotiationSim from "./pages/interview/NegotiationSim";
import Report from "./pages/Report";
import Pricing from "./pages/Pricing";
import Onboarding from "./pages/Onboarding";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/signup" element={<Signup />} />
            <Route path="/dashboard" element={<ProtectedRoute children={<Dashboard />} />} />
            <Route path="/interview/new" element={<ProtectedRoute children={<NewInterview />} />} />
            <Route path="/interview/:id" element={<ProtectedRoute children={<LiveInterview />} />} />
            <Route path="/report/:id" element={<ProtectedRoute children={<Report />} />} />
            <Route path="/negotiation/:interviewId" element={<ProtectedRoute children={<NegotiationSim />} />} />
            <Route path="/onboarding" element={<ProtectedRoute children={<Onboarding />} />} />
            <Route path="/pricing" element={<ProtectedRoute children={<Pricing />} />} />
            <Route path="/admin" element={<AdminRoute children={<Admin />} />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
