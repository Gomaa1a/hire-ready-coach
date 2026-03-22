import { useState } from "react";
import AdminSidebar, { type Tab } from "@/components/admin/AdminSidebar";
import AdminOverview from "@/components/admin/AdminOverview";
import AdminLiveInterviews from "@/components/admin/AdminLiveInterviews";
import AdminPastInterviews from "@/components/admin/AdminPastInterviews";
import AdminUsers from "@/components/admin/AdminUsers";

const Admin = () => {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <AdminOverview />;
      case "live":
        return <AdminLiveInterviews />;
      case "past":
        return <AdminPastInterviews />;
      case "users":
        return <AdminUsers />;
      case "settings":
        return (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground">Admin settings coming soon.</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-background dark">
      <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-y-auto p-8">{renderContent()}</main>
    </div>
  );
};

export default Admin;
